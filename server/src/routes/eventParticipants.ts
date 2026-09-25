import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { eventMutationRateLimit } from "../middleware/rateLimit";
import { organizerIdsWithPermission } from "../lib/access";
import { logAudit } from "../lib/audit";
import { enqueueNotificationIntent } from "../lib/notificationOutboxService";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);

const TYPES = ["SPEAKER", "SPONSOR", "VENDOR", "PARTNER", "STAFF", "CUSTOM"] as const;
const STATUSES = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const;

const participantSchema = z.object({
  participantType: z.enum(TYPES),
  customType: z.string().trim().min(1).max(100).optional(),
  name: z.string().trim().min(1).max(200),
  title: z.string().trim().max(200).optional(),
  organization: z.string().trim().max(200).optional(),
  bio: z.string().trim().max(5000).optional(),
  email: z.string().trim().email().max(320).optional(),
  phone: z.string().trim().max(50).optional(),
  website: z.string().trim().url().max(500).optional(),
  photoUrl: z.string().trim().url().max(1000).optional(),
  sortOrder: z.number().int().min(0).max(100000).default(0),
  isPublic: z.boolean().default(true),
});

const updateSchema = participantSchema.extend({ customType: z.string().trim().min(1).max(100).nullable().optional(), status: z.enum(["ACTIVE", "INACTIVE"]).optional() }).partial();

async function loadEvent(eventId: string, user: Parameters<typeof organizerIdsWithPermission>[0], permission: "event:view" | "event:update") {
  const organizerIds = await organizerIdsWithPermission(user, permission);
  if (organizerIds.length === 0) return null;
  return prisma.event.findFirst({
    where: { id: eventId, organizerId: { in: organizerIds }, archivedAt: null },
    select: { id: true, organizerId: true },
  });
}

async function participantsEnabled(eventId: string) {
  const row = await prisma.eventModuleEnablement.findUnique({
    where: { eventId_moduleType: { eventId, moduleType: "PARTICIPANTS" } },
    select: { enabled: true },
  });
  return row?.enabled === true;
}

function validateCustomType(type: typeof TYPES[number], customType: string | undefined) {
  if (type === "CUSTOM" && !customType) return "customType is required for CUSTOM participants";
  if (type !== "CUSTOM" && customType) return "customType is only valid for CUSTOM participants";
  return null;
}

function validatePublicVisibility(type: typeof TYPES[number], isPublic: boolean | undefined) {
  if (type === "STAFF" && isPublic === true) return "STAFF participants cannot be public";
  return null;
}

router.get("/:eventId/participants", async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:view");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await participantsEnabled(req.params.eventId))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });

  const type = req.query.type ? String(req.query.type) : undefined;
  const status = req.query.status ? String(req.query.status) : undefined;
  const search = req.query.search ? String(req.query.search).trim() : undefined;
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 50);
  const sortBy = String(req.query.sortBy ?? "sortOrder");
  const sortDir = String(req.query.sortDir ?? "asc");
  const allowedSorts = ["sortOrder", "name", "organization", "createdAt"] as const;
  if (!allowedSorts.includes(sortBy as typeof allowedSorts[number])) return res.status(400).json({ error: "Invalid sortBy" });
  if (sortDir !== "asc" && sortDir !== "desc") return res.status(400).json({ error: "Invalid sortDir" });

  if (type && !TYPES.includes(type as typeof TYPES[number])) return res.status(400).json({ error: "Invalid participant type" });
  if (status && !STATUSES.includes(status as typeof STATUSES[number])) return res.status(400).json({ error: "Invalid participant status" });
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({ error: "page must be >= 1 and limit must be 1-100" });
  }

  const where = {
    eventId: event.id,
    ...(type ? { participantType: type as typeof TYPES[number] } : {}),
    ...(status ? { status: status as typeof STATUSES[number] } : { status: { not: "ARCHIVED" as const } }),
    ...(search ? {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { title: { contains: search, mode: "insensitive" as const } },
        { organization: { contains: search, mode: "insensitive" as const } },
      ],
    } : {}),
  };

  const [participants, total] = await Promise.all([
    prisma.eventParticipant.findMany({ where, orderBy: [{ [sortBy]: sortDir as "asc" | "desc" }], skip: (page - 1) * limit, take: limit }),
    prisma.eventParticipant.count({ where }),
  ]);

  res.json({ participants, total, page, pageSize: limit });
});

router.post("/:eventId/participants", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await participantsEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });

  const parsed = participantSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const customTypeError = validateCustomType(parsed.data.participantType, parsed.data.customType);
  if (customTypeError) return res.status(400).json({ error: customTypeError });
  const publicVisibilityError = validatePublicVisibility(parsed.data.participantType, parsed.data.isPublic);
  if (publicVisibilityError) return res.status(400).json({ error: publicVisibilityError });

  const participant = await prisma.eventParticipant.create({ data: { ...parsed.data, eventId: event.id } });
  await enqueueNotificationIntent({
    eventKey: "participant-created",
    idempotencyKey: `participant-created:${participant.id}`,
    eventType: "PARTICIPANT_CREATED",
    entityType: "Event",
    entityId: event.id,
    payload: { eventId: event.id, participantId: participant.id, participantName: participant.name, organizerId: event.organizerId },
    actorUserId: req.user!.id,
  });
  await logAudit({
    actorUserId: req.user!.id,
    action: "eventParticipant.created",
    entityType: "EventParticipant",
    entityId: participant.id,
    metadata: { eventId: event.id, participantType: participant.participantType },
  });
  res.status(201).json({ participant });
});

router.patch("/:eventId/participants/:participantId", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await participantsEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });

  const existing = await prisma.eventParticipant.findFirst({ where: { id: req.params.participantId, eventId: event.id } });
  if (!existing) return res.status(404).json({ error: "Participant not found" });
  if (existing.archivedAt) return res.status(409).json({ error: "Participant is archived. Restore it before editing." });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const participantType = parsed.data.participantType ?? existing.participantType;
  const customType = parsed.data.customType !== undefined ? (parsed.data.customType ?? undefined) : (existing.customType ?? undefined);
  const customTypeError = validateCustomType(participantType, customType);
  if (customTypeError) return res.status(400).json({ error: customTypeError });
  const publicVisibilityError = validatePublicVisibility(participantType, parsed.data.isPublic ?? existing.isPublic);
  if (publicVisibilityError) return res.status(400).json({ error: publicVisibilityError });

  const participant = await prisma.eventParticipant.update({ where: { id: existing.id }, data: parsed.data });
  await enqueueNotificationIntent({
    eventKey: "participant-updated",
    idempotencyKey: `participant-updated:${participant.id}:${participant.updatedAt.toISOString()}`,
    eventType: "PARTICIPANT_UPDATED",
    entityType: "Event",
    entityId: event.id,
    payload: { eventId: event.id, participantId: participant.id, participantName: participant.name, organizerId: event.organizerId },
    actorUserId: req.user!.id,
  });
  await logAudit({
    actorUserId: req.user!.id,
    action: "eventParticipant.updated",
    entityType: "EventParticipant",
    entityId: participant.id,
    metadata: { eventId: event.id, changedFields: Object.keys(parsed.data) },
  });
  res.json({ participant });
});

router.delete("/:eventId/participants/:participantId", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await participantsEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });

  const existing = await prisma.eventParticipant.findFirst({ where: { id: req.params.participantId, eventId: event.id } });
  if (!existing) return res.status(404).json({ error: "Participant not found" });
  if (existing.archivedAt) return res.status(204).send();

  const participant = await prisma.eventParticipant.update({
    where: { id: existing.id },
    data: { status: "ARCHIVED", archivedAt: new Date(), isPublic: false },
  });
  await logAudit({
    actorUserId: req.user!.id,
    action: "eventParticipant.archived",
    entityType: "EventParticipant",
    entityId: participant.id,
    metadata: { eventId: event.id },
  });
  res.status(204).send();
});

router.post("/:eventId/participants/:participantId/restore", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await participantsEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });

  const existing = await prisma.eventParticipant.findFirst({ where: { id: req.params.participantId, eventId: event.id } });
  if (!existing) return res.status(404).json({ error: "Participant not found" });
  if (!existing.archivedAt) return res.status(400).json({ error: "Participant is not archived" });

  const participant = await prisma.eventParticipant.update({ where: { id: existing.id }, data: { status: "ACTIVE", archivedAt: null } });
  await logAudit({
    actorUserId: req.user!.id,
    action: "eventParticipant.restored",
    entityType: "EventParticipant",
    entityId: participant.id,
    metadata: { eventId: event.id },
  });
  res.json({ participant });
});

export default router;
