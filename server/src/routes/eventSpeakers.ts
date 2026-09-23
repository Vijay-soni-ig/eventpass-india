import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { eventMutationRateLimit } from "../middleware/rateLimit";
import { organizerIdsWithPermission } from "../lib/access";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);

const speakerSchema = z.object({
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

const updateSchema = speakerSchema.partial();
const STATUSES = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const;

type UserLike = Parameters<typeof organizerIdsWithPermission>[0];

async function loadEvent(eventId: string, user: UserLike, permission: "event:view" | "event:update") {
  const organizerIds = await organizerIdsWithPermission(user, permission);
  if (organizerIds.length === 0) return null;
  return prisma.event.findFirst({
    where: { id: eventId, organizerId: { in: organizerIds } },
    select: { id: true },
  });
}

async function speakersEnabled(eventId: string) {
  const row = await prisma.eventModuleEnablement.findUnique({
    where: { eventId_moduleType: { eventId, moduleType: "PARTICIPANTS" } },
    select: { enabled: true },
  });
  return row?.enabled === true;
}

router.get("/:eventId/speakers", async (req, res) => {
  if (!(await speakersEnabled(req.params.eventId))) return res.status(409).json({ error: "The SPEAKERS module is not enabled for this event" });
  const event = await loadEvent(req.params.eventId, req.user!, "event:view");
  if (!event) return res.status(404).json({ error: "Event not found" });

  const status = req.query.status ? String(req.query.status) : undefined;
  const search = req.query.search ? String(req.query.search).trim() : undefined;
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 50);
  const sortBy = String(req.query.sortBy ?? "sortOrder");
  const sortDir = String(req.query.sortDir ?? "asc");
  const allowedSorts = ["sortOrder", "name", "organization", "createdAt"] as const;
  if (!allowedSorts.includes(sortBy as typeof allowedSorts[number])) return res.status(400).json({ error: "Invalid sortBy" });
  if (sortDir !== "asc" && sortDir !== "desc") return res.status(400).json({ error: "Invalid sortDir" });

  if (status && !STATUSES.includes(status as typeof STATUSES[number])) {
    return res.status(400).json({ error: "Invalid speaker status" });
  }
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({ error: "page must be >= 1 and limit must be 1-100" });
  }

  const where = {
    eventId: event.id,
    participantType: "SPEAKER" as const,
    ...(status ? { status: status as typeof STATUSES[number] } : { status: { not: "ARCHIVED" as const } }),
    ...(search ? {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { title: { contains: search, mode: "insensitive" as const } },
        { organization: { contains: search, mode: "insensitive" as const } },
      ],
    } : {}),
  };

  const [speakers, total] = await Promise.all([
    prisma.eventParticipant.findMany({
      where,
      orderBy: [{ [sortBy]: sortDir as "asc" | "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.eventParticipant.count({ where }),
  ]);

  return res.json({ speakers, total, page, pageSize: limit });
});

router.post("/:eventId/speakers", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await speakersEnabled(event.id))) {
    return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });
  }

  const parsed = speakerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const speaker = await prisma.eventParticipant.create({
    data: { participantType: "SPEAKER", ...parsed.data, eventId: event.id },
  });
  await logAudit({
    actorUserId: req.user!.id,
    action: "eventSpeaker.created",
    entityType: "EventParticipant",
    entityId: speaker.id,
    metadata: { eventId: event.id },
  });
  return res.status(201).json({ speaker });
});

router.patch("/:eventId/speakers/:speakerId", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await speakersEnabled(event.id))) {
    return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });
  }

  const existing = await prisma.eventParticipant.findFirst({
    where: { id: req.params.speakerId, eventId: event.id, participantType: "SPEAKER" },
  });
  if (!existing) return res.status(404).json({ error: "Speaker not found" });
  if (existing.archivedAt) return res.status(409).json({ error: "Speaker is archived. Restore it before editing." });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const speaker = await prisma.eventParticipant.update({ where: { id: existing.id }, data: parsed.data });
  await logAudit({
    actorUserId: req.user!.id,
    action: "eventSpeaker.updated",
    entityType: "EventParticipant",
    entityId: speaker.id,
    metadata: { eventId: event.id, changedFields: Object.keys(parsed.data) },
  });
  return res.json({ speaker });
});

router.delete("/:eventId/speakers/:speakerId", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await speakersEnabled(event.id))) {
    return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });
  }

  const existing = await prisma.eventParticipant.findFirst({
    where: { id: req.params.speakerId, eventId: event.id, participantType: "SPEAKER" },
  });
  if (!existing) return res.status(404).json({ error: "Speaker not found" });
  if (existing.archivedAt) return res.status(204).send();

  const speaker = await prisma.eventParticipant.update({
    where: { id: existing.id },
    data: { status: "ARCHIVED", archivedAt: new Date(), isPublic: false },
  });
  await logAudit({
    actorUserId: req.user!.id,
    action: "eventSpeaker.archived",
    entityType: "EventParticipant",
    entityId: speaker.id,
    metadata: { eventId: event.id },
  });
  return res.status(204).send();
});

router.post("/:eventId/speakers/:speakerId/restore", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await speakersEnabled(event.id))) {
    return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });
  }

  const existing = await prisma.eventParticipant.findFirst({
    where: { id: req.params.speakerId, eventId: event.id, participantType: "SPEAKER" },
  });
  if (!existing) return res.status(404).json({ error: "Speaker not found" });
  if (!existing.archivedAt) return res.status(400).json({ error: "Speaker is not archived" });

  const speaker = await prisma.eventParticipant.update({
    where: { id: existing.id },
    data: { status: "ACTIVE", archivedAt: null },
  });
  await logAudit({
    actorUserId: req.user!.id,
    action: "eventSpeaker.restored",
    entityType: "EventParticipant",
    entityId: speaker.id,
    metadata: { eventId: event.id },
  });
  return res.json({ speaker });
});

export default router;
