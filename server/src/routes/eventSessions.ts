import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { eventMutationRateLimit } from "../middleware/rateLimit";
import { organizerIdsWithPermission } from "../lib/access";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must use YYYY-MM-DD");
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time must use HH:mm");
const sessionFields = {
  title: z.string().trim().min(1).max(250),
  description: z.string().trim().max(10000).optional(),
  date: dateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  timezone: z.string().trim().min(1).max(100).default("Asia/Kolkata"),
  room: z.string().trim().max(200).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED"]).default("DRAFT"),
  sortOrder: z.number().int().min(0).max(100000).default(0),
  speakerIds: z.array(z.string().uuid()).max(50).default([]),
};
const sessionSchema = z.object(sessionFields).superRefine((value, ctx) => {
  if (value.startTime >= value.endTime) ctx.addIssue({ code: "custom", path: ["endTime"], message: "endTime must be after startTime" });
});
const updateSchema = z.object(sessionFields).partial().superRefine((value, ctx) => {
  if (value.startTime !== undefined && value.endTime !== undefined && value.startTime >= value.endTime) {
    ctx.addIssue({ code: "custom", path: ["endTime"], message: "endTime must be after startTime" });
  }
});

type UserLike = Parameters<typeof organizerIdsWithPermission>[0];

async function loadEvent(eventId: string, user: UserLike, permission: "event:view" | "event:update") {
  const organizerIds = await organizerIdsWithPermission(user, permission);
  if (organizerIds.length === 0) return null;
  return prisma.event.findFirst({ where: { id: eventId, organizerId: { in: organizerIds }, archivedAt: null }, select: { id: true, organizerId: true } });
}

async function sessionsEnabled(eventId: string) {
  const row = await prisma.eventModuleEnablement.findUnique({
    where: { eventId_moduleType: { eventId, moduleType: "SESSIONS" } },
    select: { enabled: true },
  });
  return row?.enabled === true;
}

async function validateSpeakers(eventId: string, speakerIds: string[]): Promise<{ ids: string[]; error?: string }> {
  const uniqueIds = [...new Set(speakerIds)];
  if (uniqueIds.length !== speakerIds.length) return { ids: [], error: "speakerIds must not contain duplicates" };
  if (uniqueIds.length === 0) return { ids: [] };
  const speakers = await prisma.eventParticipant.findMany({
    where: { id: { in: uniqueIds }, eventId, participantType: "SPEAKER", status: { in: ["ACTIVE", "INACTIVE"] }, archivedAt: null },
    select: { id: true },
  });
  if (speakers.length !== uniqueIds.length) return { ids: [], error: "All speakerIds must reference non-archived speakers belonging to this event" };
  return { ids: uniqueIds };
}

function sessionInclude() {
  return {
    speakers: {
      orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
      include: {
        participant: {
          select: { id: true, name: true, title: true, organization: true, bio: true, photoUrl: true, isPublic: true, status: true },
        },
      },
    },
  };
}

router.get("/:eventId/sessions", async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:view");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await sessionsEnabled(event.id))) return res.status(409).json({ error: "The SESSIONS module is not enabled for this event" });

  const status = req.query.status ? String(req.query.status) : undefined;
  const search = req.query.search ? String(req.query.search).trim() : undefined;
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 50);
  const sortDir = String(req.query.sortDir ?? "asc");
  if (status && !["DRAFT", "PUBLISHED", "CANCELLED"].includes(status)) return res.status(400).json({ error: "Invalid session status" });
  if (sortDir !== "asc" && sortDir !== "desc") return res.status(400).json({ error: "Invalid sortDir" });
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) return res.status(400).json({ error: "page must be >= 1 and limit must be 1-100" });

  const where = {
    eventId: event.id,
    ...(status ? { status: status as "DRAFT" | "PUBLISHED" | "CANCELLED" } : {}),
    ...(search ? { title: { contains: search, mode: "insensitive" as const } } : {}),
  };
  const [sessions, total] = await Promise.all([
    prisma.eventSession.findMany({ where, orderBy: [{ date: sortDir as "asc" | "desc" }, { startTime: sortDir as "asc" | "desc" }, { sortOrder: sortDir as "asc" | "desc" }], skip: (page - 1) * limit, take: limit, include: sessionInclude() }),
    prisma.eventSession.count({ where }),
  ]);
  return res.json({ sessions, total, page, pageSize: limit });
});

router.post("/:eventId/sessions", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await sessionsEnabled(event.id))) return res.status(409).json({ error: "The SESSIONS module is not enabled for this event" });

  const parsed = sessionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { speakerIds, ...data } = parsed.data;
  const speakerValidation = await validateSpeakers(event.id, speakerIds);
  if (speakerValidation.error) return res.status(400).json({ error: speakerValidation.error });

  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.eventSession.create({ data: { ...data, date: new Date(data.date + "T00:00:00.000Z"), eventId: event.id } });
    if (speakerValidation.ids.length) {
      await tx.eventSessionSpeaker.createMany({ data: speakerValidation.ids.map((participantId, index) => ({ sessionId: created.id, participantId, sortOrder: index })) });
    }
    return tx.eventSession.findUniqueOrThrow({ where: { id: created.id }, include: sessionInclude() });
  });
  await logAudit({ actorUserId: req.user!.id, action: "eventSession.created", entityType: "EventSession", entityId: session.id, metadata: { eventId: event.id, speakerIds: speakerValidation.ids } });
  return res.status(201).json({ session });
});

router.patch("/:eventId/sessions/:sessionId", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await sessionsEnabled(event.id))) return res.status(409).json({ error: "The SESSIONS module is not enabled for this event" });

  const existing = await prisma.eventSession.findFirst({ where: { id: req.params.sessionId, eventId: event.id } });
  if (!existing) return res.status(404).json({ error: "Session not found" });
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { speakerIds, date, ...rest } = parsed.data;
  const nextData = date === undefined ? rest : { ...rest, date: new Date(date + "T00:00:00.000Z") };
  const nextStart = parsed.data.startTime ?? existing.startTime;
  const nextEnd = parsed.data.endTime ?? existing.endTime;
  if (nextStart >= nextEnd) return res.status(400).json({ error: "endTime must be after startTime" });

  let speakerValidation: { ids: string[]; error?: string } = { ids: [] };
  if (speakerIds !== undefined) {
    speakerValidation = await validateSpeakers(event.id, speakerIds);
    if (speakerValidation.error) return res.status(400).json({ error: speakerValidation.error });
  }

  const session = await prisma.$transaction(async (tx) => {
    await tx.eventSession.update({ where: { id: existing.id }, data: nextData });
    if (speakerIds !== undefined) {
      await tx.eventSessionSpeaker.deleteMany({ where: { sessionId: existing.id } });
      if (speakerValidation.ids.length) await tx.eventSessionSpeaker.createMany({ data: speakerValidation.ids.map((participantId, index) => ({ sessionId: existing.id, participantId, sortOrder: index })) });
    }
    return tx.eventSession.findUniqueOrThrow({ where: { id: existing.id }, include: sessionInclude() });
  });
  await logAudit({ actorUserId: req.user!.id, action: "eventSession.updated", entityType: "EventSession", entityId: session.id, metadata: { eventId: event.id, changedFields: Object.keys(parsed.data), speakerIds: speakerIds ?? undefined } });
  return res.json({ session });
});

router.delete("/:eventId/sessions/:sessionId", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await sessionsEnabled(event.id))) return res.status(409).json({ error: "The SESSIONS module is not enabled for this event" });
  const existing = await prisma.eventSession.findFirst({ where: { id: req.params.sessionId, eventId: event.id } });
  if (!existing) return res.status(404).json({ error: "Session not found" });
  if (existing.status === "CANCELLED") return res.status(204).send();
  const session = await prisma.eventSession.update({ where: { id: existing.id }, data: { status: "CANCELLED" } });
  await logAudit({ actorUserId: req.user!.id, action: "eventSession.cancelled", entityType: "EventSession", entityId: session.id, metadata: { eventId: event.id } });
  return res.status(204).send();
});

export default router;
