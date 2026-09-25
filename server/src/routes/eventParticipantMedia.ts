import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { eventMutationRateLimit, uploadRateLimit, publicSearchRateLimit } from "../middleware/rateLimit";
import { organizerIdsWithPermission } from "../lib/access";
import { logAudit } from "../lib/audit";
import { storedFileReference, privateStoredFileReference, getStoredObject } from "../lib/storage";
import { handleUpload, uploadParticipantMediaPrivate, uploadParticipantMediaPublic } from "../middleware/upload";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);

const KINDS = ["PROFILE_IMAGE", "LOGO", "GALLERY"] as const;
const VISIBILITIES = ["PUBLIC", "PRIVATE"] as const;

const metaSchema = z.object({
  kind: z.enum(KINDS),
  caption: z.string().trim().max(300).optional(),
  altText: z.string().trim().max(150).optional(),
});

const updateSchema = z.object({
  caption: z.string().trim().max(300).nullable().optional(),
  altText: z.string().trim().max(150).nullable().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});

const reorderSchema = z.object({
  items: z.array(z.object({ id: z.string().uuid(), sortOrder: z.number().int().min(0).max(100000) })).min(1).max(500),
});

type UserLike = Parameters<typeof organizerIdsWithPermission>[0];

async function loadEvent(eventId: string, user: UserLike, permission: "event:view" | "event:update") {
  const organizerIds = await organizerIdsWithPermission(user, permission);
  if (organizerIds.length === 0) return null;
  return prisma.event.findFirst({
    where: { id: eventId, organizerId: { in: organizerIds } },
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

async function loadParticipant(eventId: string, participantId: string) {
  return prisma.eventParticipant.findFirst({
    where: { id: participantId, eventId },
    select: { id: true, eventId: true, participantType: true, status: true, isPublic: true, archivedAt: true },
  });
}

router.get("/:eventId/participants/:participantId/media", async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:view");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await participantsEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });

  const participant = await loadParticipant(event.id, req.params.participantId);
  if (!participant) return res.status(404).json({ error: "Participant not found" });

  const items = await prisma.eventParticipantMedia.findMany({
    where: { participantId: participant.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return res.json({ items });
});

router.post(
  "/:eventId/participants/:participantId/media",
  uploadRateLimit,
  async (req, res, next) => {
    const event = await loadEvent(req.params.eventId, req.user!, "event:update");
    if (!event) return res.status(404).json({ error: "Event not found" });
    if (!(await participantsEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });
    const participant = await loadParticipant(event.id, req.params.participantId);
    if (!participant) return res.status(404).json({ error: "Participant not found" });
    if (participant.archivedAt) return res.status(409).json({ error: "Participant is archived. Restore it before managing media." });

    const visibility = String(req.query.visibility ?? "PUBLIC").toUpperCase();
    if (!VISIBILITIES.includes(visibility as typeof VISIBILITIES[number])) {
      return res.status(400).json({ error: "visibility must be PUBLIC or PRIVATE" });
    }
    return handleUpload(
      visibility === "PRIVATE" ? uploadParticipantMediaPrivate : uploadParticipantMediaPublic,
      "file",
    )(req, res, next);
  },
  async (req, res) => {
    const event = await loadEvent(req.params.eventId, req.user!, "event:update");
    if (!event) return res.status(404).json({ error: "Event not found" });
    if (!(await participantsEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });

    const participant = await loadParticipant(event.id, req.params.participantId);
    if (!participant) return res.status(404).json({ error: "Participant not found" });
    if (participant.archivedAt) return res.status(409).json({ error: "Participant is archived. Restore it before managing media." });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const uploadedFile = req.file;

    const parsed = metaSchema.safeParse({
      kind: req.body?.kind,
      caption: req.body?.caption || undefined,
      altText: req.body?.altText || undefined,
    });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

    const visibility = String(req.query.visibility ?? "PUBLIC").toUpperCase() as typeof VISIBILITIES[number];
    if (parsed.data.kind === "PROFILE_IMAGE" && visibility === "PRIVATE") {
      return res.status(400).json({ error: "PROFILE_IMAGE media must be PUBLIC" });
    }
    const media = await prisma.$transaction(async (tx) => {
      if (parsed.data.kind !== "GALLERY") {
        await tx.$queryRaw`SELECT id FROM event_participants WHERE id = ${participant.id} FOR UPDATE`;
        await tx.eventParticipantMedia.updateMany({
          where: { participantId: participant.id, kind: parsed.data.kind, archivedAt: null },
          data: { active: false, archivedAt: new Date() },
        });
      }

      const maxSort = await tx.eventParticipantMedia.aggregate({
        where: { participantId: participant.id, archivedAt: null },
        _max: { sortOrder: true },
      });

      const stored = visibility === "PRIVATE"
        ? privateStoredFileReference("participant-media-private", uploadedFile.filename)
        : storedFileReference(req, "participant-media-public", uploadedFile.filename);

      return tx.eventParticipantMedia.create({
        data: {
          participantId: participant.id,
          kind: parsed.data.kind,
          visibility,
          fileUrl: stored,
          mimeType: uploadedFile.mimetype,
          fileSizeBytes: uploadedFile.size,
          altText: parsed.data.altText,
          caption: parsed.data.caption,
          sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
          uploadedByUserId: req.user!.id,
        },
      });
    });

    if (parsed.data.kind === "PROFILE_IMAGE" && visibility === "PUBLIC") {
      await prisma.eventParticipant.update({ where: { id: participant.id }, data: { photoUrl: media.fileUrl } });
    }

    await logAudit({
      actorUserId: req.user!.id,
      action: "eventParticipantMedia.created",
      entityType: "EventParticipantMedia",
      entityId: media.id,
      metadata: { eventId: event.id, participantId: participant.id, kind: media.kind, visibility: media.visibility },
    });

    return res.status(201).json({ media });
  },
);

router.patch("/:eventId/participants/:participantId/media/reorder", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await participantsEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });

  const participant = await loadParticipant(event.id, req.params.participantId);
  if (!participant) return res.status(404).json({ error: "Participant not found" });
  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const ids = parsed.data.items.map((item) => item.id);
  const owned = await prisma.eventParticipantMedia.findMany({
    where: { id: { in: ids }, participantId: participant.id, archivedAt: null },
    select: { id: true },
  });
  if (owned.length !== ids.length) return res.status(403).json({ error: "One or more media items do not belong to this participant" });

  await prisma.$transaction(
    parsed.data.items.map((item) => prisma.eventParticipantMedia.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } })),
  );

  await logAudit({
    actorUserId: req.user!.id,
    action: "eventParticipantMedia.reordered",
    entityType: "EventParticipant",
    entityId: participant.id,
    metadata: { eventId: event.id, count: ids.length },
  });

  const items = await prisma.eventParticipantMedia.findMany({
    where: { participantId: participant.id, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return res.json({ items });
});

router.patch("/:eventId/participants/:participantId/media/:mediaId", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await participantsEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });

  const participant = await loadParticipant(event.id, req.params.participantId);
  if (!participant) return res.status(404).json({ error: "Participant not found" });
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const existing = await prisma.eventParticipantMedia.findFirst({
    where: { id: req.params.mediaId, participantId: participant.id },
  });
  if (!existing) return res.status(404).json({ error: "Media item not found" });
  if (existing.archivedAt) return res.status(409).json({ error: "Media item is archived. Restore it before editing." });

  const media = await prisma.eventParticipantMedia.update({ where: { id: existing.id }, data: parsed.data });
  await logAudit({
    actorUserId: req.user!.id,
    action: "eventParticipantMedia.updated",
    entityType: "EventParticipantMedia",
    entityId: media.id,
    metadata: { eventId: event.id, participantId: participant.id, changedFields: Object.keys(parsed.data) },
  });
  return res.json({ media });
});

router.delete("/:eventId/participants/:participantId/media/:mediaId", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await participantsEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });

  const participant = await loadParticipant(event.id, req.params.participantId);
  if (!participant) return res.status(404).json({ error: "Participant not found" });
  const existing = await prisma.eventParticipantMedia.findFirst({ where: { id: req.params.mediaId, participantId: participant.id } });
  if (!existing) return res.status(404).json({ error: "Media item not found" });
  if (existing.archivedAt) return res.status(204).send();

  const media = await prisma.eventParticipantMedia.update({
    where: { id: existing.id },
    data: { active: false, archivedAt: new Date() },
  });

  if (existing.kind === "PROFILE_IMAGE" && participant.isPublic) {
    const next = await prisma.eventParticipantMedia.findFirst({
      where: { participantId: participant.id, kind: "PROFILE_IMAGE", visibility: "PUBLIC", active: true, archivedAt: null, id: { not: media.id } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      select: { fileUrl: true },
    });
    await prisma.eventParticipant.update({ where: { id: participant.id }, data: { photoUrl: next?.fileUrl ?? null } });
  }

  await logAudit({
    actorUserId: req.user!.id,
    action: "eventParticipantMedia.archived",
    entityType: "EventParticipantMedia",
    entityId: media.id,
    metadata: { eventId: event.id, participantId: participant.id },
  });
  return res.status(204).send();
});

router.post("/:eventId/participants/:participantId/media/:mediaId/restore", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await participantsEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });

  const participant = await loadParticipant(event.id, req.params.participantId);
  if (!participant) return res.status(404).json({ error: "Participant not found" });
  const existing = await prisma.eventParticipantMedia.findFirst({ where: { id: req.params.mediaId, participantId: participant.id } });
  if (!existing) return res.status(404).json({ error: "Media item not found" });
  if (!existing.archivedAt) return res.status(400).json({ error: "Media item is not archived" });

  const media = await prisma.$transaction(async (tx) => {
    if (existing.kind !== "GALLERY") {
      await tx.$queryRaw`SELECT id FROM event_participants WHERE id = ${participant.id} FOR UPDATE`;
      await tx.eventParticipantMedia.updateMany({
        where: { participantId: participant.id, kind: existing.kind, archivedAt: null, id: { not: existing.id } },
        data: { active: false, archivedAt: new Date() },
      });
    }
    return tx.eventParticipantMedia.update({ where: { id: existing.id }, data: { active: true, archivedAt: null } });
  });

  if (media.kind === "PROFILE_IMAGE" && media.visibility === "PUBLIC") {
    await prisma.eventParticipant.update({ where: { id: participant.id }, data: { photoUrl: media.fileUrl } });
  }

  await logAudit({
    actorUserId: req.user!.id,
    action: "eventParticipantMedia.restored",
    entityType: "EventParticipantMedia",
    entityId: media.id,
    metadata: { eventId: event.id, participantId: participant.id },
  });
  return res.json({ media });
});

router.get("/:eventId/participants/:participantId/media/:mediaId/file", async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:view");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await participantsEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });

  const participant = await loadParticipant(event.id, req.params.participantId);
  if (!participant) return res.status(404).json({ error: "Participant not found" });
  const media = await prisma.eventParticipantMedia.findFirst({ where: { id: req.params.mediaId, participantId: participant.id, archivedAt: null, active: true } });
  if (!media) return res.status(404).json({ error: "Media item not found" });

  try {
    const object = await getStoredObject(media.fileUrl);
    res.setHeader("Content-Type", media.mimeType);
    res.setHeader("Content-Length", String(object.body.length));
    res.setHeader("Cache-Control", "private, no-store");
    return res.send(object.body);
  } catch {
    return res.status(404).json({ error: "Media object not found" });
  }
});

export const publicParticipantMediaRouter = Router();
publicParticipantMediaRouter.get("/events/:id/participants/:participantId/media", publicSearchRateLimit, async (req, res) => {
  const event = await prisma.event.findFirst({
    where: { id: req.params.id, status: "PUBLISHED", visibility: "public", archivedAt: null },
    select: { id: true },
  });
  if (!event) return res.status(404).json({ error: "Event not found" });

  const module = await prisma.eventModuleEnablement.findUnique({
    where: { eventId_moduleType: { eventId: event.id, moduleType: "PARTICIPANTS" } },
    select: { enabled: true },
  });
  if (!module?.enabled) return res.status(404).json({ error: "Participant directory not available" });

  const participant = await prisma.eventParticipant.findFirst({
    where: { id: req.params.participantId, eventId: event.id, status: "ACTIVE", isPublic: true, archivedAt: null },
    select: { id: true },
  });
  if (!participant) return res.status(404).json({ error: "Participant not found" });

  const items = await prisma.eventParticipantMedia.findMany({
    where: { participantId: participant.id, visibility: "PUBLIC", active: true, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, kind: true, fileUrl: true, altText: true, caption: true, sortOrder: true },
  });
  return res.json({ items });
});

export default router;
