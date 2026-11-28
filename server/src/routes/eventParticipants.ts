import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { eventMutationRateLimit } from "../middleware/rateLimit";
import { lockedEventRoute, moduleEnabled, reply } from "../lib/lockedEventRoute";
import { logAudit } from "../lib/audit";
import { enqueueNotificationIntent } from "../lib/notificationOutboxService";
import { httpUrl } from "../lib/httpUrl";

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
  website: httpUrl(500).optional(),
  photoUrl: httpUrl(1000).optional(),
  sortOrder: z.number().int().min(0).max(100000).default(0),
  isPublic: z.boolean().default(true),
});

const updateSchema = participantSchema.extend({ customType: z.string().trim().min(1).max(100).nullable().optional(), status: z.enum(["ACTIVE", "INACTIVE"]).optional() }).partial();

const MODULE_DISABLED = "The PARTICIPANTS module is not enabled for this event";

function validateCustomType(type: typeof TYPES[number], customType: string | undefined) {
  if (type === "CUSTOM" && !customType) return "customType is required for CUSTOM participants";
  if (type !== "CUSTOM" && customType) return "customType is only valid for CUSTOM participants";
  return null;
}

function validatePublicVisibility(type: typeof TYPES[number], isPublic: boolean | undefined) {
  if (type === "STAFF" && isPublic === true) return "STAFF participants cannot be public";
  return null;
}

// Every handler runs under the organizer row lock with membership/permission
// re-read inside it (see lib/lockedEventRoute.ts). Notification intents and
// audit rows are written after the transaction commits.

router.get("/:eventId/participants", lockedEventRoute("event:view", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "PARTICIPANTS"))) return reply(409, { error: MODULE_DISABLED });

  const type = req.query.type ? String(req.query.type) : undefined;
  const status = req.query.status ? String(req.query.status) : undefined;
  const search = req.query.search ? String(req.query.search).trim() : undefined;
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 50);
  const sortBy = String(req.query.sortBy ?? "sortOrder");
  const sortDir = String(req.query.sortDir ?? "asc");
  const allowedSorts = ["sortOrder", "name", "organization", "createdAt"] as const;
  if (!allowedSorts.includes(sortBy as typeof allowedSorts[number])) return reply(400, { error: "Invalid sortBy" });
  if (sortDir !== "asc" && sortDir !== "desc") return reply(400, { error: "Invalid sortDir" });

  if (type && !TYPES.includes(type as typeof TYPES[number])) return reply(400, { error: "Invalid participant type" });
  if (status && !STATUSES.includes(status as typeof STATUSES[number])) return reply(400, { error: "Invalid participant status" });
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return reply(400, { error: "page must be >= 1 and limit must be 1-100" });
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
    tx.eventParticipant.findMany({ where, orderBy: [{ [sortBy]: sortDir as "asc" | "desc" }], skip: (page - 1) * limit, take: limit }),
    tx.eventParticipant.count({ where }),
  ]);

  return reply(200, { participants, total, page, pageSize: limit });
}));

router.post("/:eventId/participants", eventMutationRateLimit, lockedEventRoute("event:update", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "PARTICIPANTS"))) return reply(409, { error: MODULE_DISABLED });

  const parsed = participantSchema.safeParse(req.body);
  if (!parsed.success) return reply(400, { error: parsed.error.issues[0].message });
  const customTypeError = validateCustomType(parsed.data.participantType, parsed.data.customType);
  if (customTypeError) return reply(400, { error: customTypeError });
  const publicVisibilityError = validatePublicVisibility(parsed.data.participantType, parsed.data.isPublic);
  if (publicVisibilityError) return reply(400, { error: publicVisibilityError });

  const participant = await tx.eventParticipant.create({ data: { ...parsed.data, eventId: event.id } });
  return reply(201, { participant }, async () => {
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
  });
}));

router.patch("/:eventId/participants/:participantId", eventMutationRateLimit, lockedEventRoute("event:update", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "PARTICIPANTS"))) return reply(409, { error: MODULE_DISABLED });

  const existing = await tx.eventParticipant.findFirst({ where: { id: req.params.participantId, eventId: event.id } });
  if (!existing) return reply(404, { error: "Participant not found" });
  if (existing.archivedAt) return reply(409, { error: "Participant is archived. Restore it before editing." });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return reply(400, { error: parsed.error.issues[0].message });

  const participantType = parsed.data.participantType ?? existing.participantType;
  const customType = parsed.data.customType !== undefined ? (parsed.data.customType ?? undefined) : (existing.customType ?? undefined);
  const customTypeError = validateCustomType(participantType, customType);
  if (customTypeError) return reply(400, { error: customTypeError });
  const publicVisibilityError = validatePublicVisibility(participantType, parsed.data.isPublic ?? existing.isPublic);
  if (publicVisibilityError) return reply(400, { error: publicVisibilityError });

  const participant = await tx.eventParticipant.update({ where: { id: existing.id }, data: parsed.data });
  return reply(200, { participant }, async () => {
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
  });
}));

router.delete("/:eventId/participants/:participantId", eventMutationRateLimit, lockedEventRoute("event:update", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "PARTICIPANTS"))) return reply(409, { error: MODULE_DISABLED });

  const existing = await tx.eventParticipant.findFirst({ where: { id: req.params.participantId, eventId: event.id } });
  if (!existing) return reply(404, { error: "Participant not found" });
  if (existing.archivedAt) return reply(204);

  const participant = await tx.eventParticipant.update({
    where: { id: existing.id },
    data: { status: "ARCHIVED", archivedAt: new Date(), isPublic: false },
  });
  return reply(204, undefined, () => logAudit({
    actorUserId: req.user!.id,
    action: "eventParticipant.archived",
    entityType: "EventParticipant",
    entityId: participant.id,
    metadata: { eventId: event.id },
  }));
}));

router.post("/:eventId/participants/:participantId/restore", eventMutationRateLimit, lockedEventRoute("event:update", async ({ tx, event, req }) => {
  if (!(await moduleEnabled(tx, event.id, "PARTICIPANTS"))) return reply(409, { error: MODULE_DISABLED });

  const existing = await tx.eventParticipant.findFirst({ where: { id: req.params.participantId, eventId: event.id } });
  if (!existing) return reply(404, { error: "Participant not found" });
  if (!existing.archivedAt) return reply(400, { error: "Participant is not archived" });

  const participant = await tx.eventParticipant.update({ where: { id: existing.id }, data: { status: "ACTIVE", archivedAt: null } });
  return reply(200, { participant }, () => logAudit({
    actorUserId: req.user!.id,
    action: "eventParticipant.restored",
    entityType: "EventParticipant",
    entityId: participant.id,
    metadata: { eventId: event.id },
  }));
}));

export default router;
