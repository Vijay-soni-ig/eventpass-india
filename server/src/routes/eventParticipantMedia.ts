import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { eventMutationRateLimit, uploadRateLimit, publicSearchRateLimit } from "../middleware/rateLimit";
import { withLockedEventAccess } from "../lib/lockedEventAccess";
import { logAudit } from "../lib/audit";
import { deleteStoredFile, storedFileReference, privateStoredFileReference, getStoredObject } from "../lib/storage";
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

async function participantsEnabled(tx: Prisma.TransactionClient, eventId: string) {
  const row = await tx.eventModuleEnablement.findUnique({
    where: { eventId_moduleType: { eventId, moduleType: "PARTICIPANTS" } },
    select: { enabled: true },
  });
  return row?.enabled === true;
}

async function loadParticipant(tx: Prisma.TransactionClient, eventId: string, participantId: string) {
  return tx.eventParticipant.findFirst({
    where: { id: participantId, eventId },
    select: { id: true, eventId: true, participantType: true, status: true, isPublic: true, archivedAt: true },
  });
}

router.get("/:eventId/participants/:participantId/media", async (req, res) => {
  const result = await withLockedEventAccess(req.params.eventId, req.user!, "event:view", async (tx, event) => {
    if (!(await participantsEnabled(tx, event.id))) {
      return { status: 409 as const, error: "The PARTICIPANTS module is not enabled for this event" };
    }
    const participant = await loadParticipant(tx, event.id, req.params.participantId);
    if (!participant) return { status: 404 as const, error: "Participant not found" };
    if (participant.archivedAt) {
      return { status: 409 as const, error: "Participant is archived. Restore it before accessing media." };
    }
    const items = await tx.eventParticipantMedia.findMany({
      where: { participantId: participant.id, archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return { status: 200 as const, items };
  });
  if (!result) return res.status(404).json({ error: "Event not found" });
  if (result.status !== 200) return res.status(result.status).json({ error: result.error });
  return res.json({ items: result.items });
});

router.post(
  "/:eventId/participants/:participantId/media",
  uploadRateLimit,
  async (req, res, next) => {
    const visibility = String(req.query.visibility ?? "PUBLIC").toUpperCase();
    if (!VISIBILITIES.includes(visibility as typeof VISIBILITIES[number])) {
      return res.status(400).json({ error: "visibility must be PUBLIC or PRIVATE" });
    }
    const access = await withLockedEventAccess(req.params.eventId, req.user!, "event:update", async (tx, event) => {
      if (!(await participantsEnabled(tx, event.id))) {
        return { status: 409 as const, error: "The PARTICIPANTS module is not enabled for this event" };
      }
      const participant = await loadParticipant(tx, event.id, req.params.participantId);
      if (!participant) return { status: 404 as const, error: "Participant not found" };
      if (participant.archivedAt) {
        return { status: 409 as const, error: "Participant is archived. Restore it before managing media." };
      }
      return { status: 200 as const };
    });
    if (!access) return res.status(404).json({ error: "Event not found" });
    if (access.status !== 200) return res.status(access.status).json({ error: access.error });
    return handleUpload(
      visibility === "PRIVATE" ? uploadParticipantMediaPrivate : uploadParticipantMediaPublic,
      "file",
    )(req, res, next);
  },
  async (req, res, next) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const uploadedFile = req.file;
    const visibility = String(req.query.visibility ?? "PUBLIC").toUpperCase() as typeof VISIBILITIES[number];
    const cleanupUploadedFile = () => deleteStoredFile(
      privateStoredFileReference(
        visibility === "PRIVATE" ? "participant-media-private" : "participant-media-public",
        uploadedFile.filename,
      ),
    );

    let mediaPersisted = false;
    try {
      const parsed = metaSchema.safeParse({
        kind: req.body?.kind,
        caption: req.body?.caption || undefined,
        altText: req.body?.altText || undefined,
      });
      if (!parsed.success) {
        await cleanupUploadedFile();
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      if (parsed.data.kind === "PROFILE_IMAGE" && visibility === "PRIVATE") {
        await cleanupUploadedFile();
        return res.status(400).json({ error: "PROFILE_IMAGE media must be PUBLIC" });
      }

      const stored = visibility === "PRIVATE"
        ? privateStoredFileReference("participant-media-private", uploadedFile.filename)
        : storedFileReference(req, "participant-media-public", uploadedFile.filename);

      const result = await withLockedEventAccess(req.params.eventId, req.user!, "event:update", async (tx, event) => {
        if (!(await participantsEnabled(tx, event.id))) {
          return { status: 409 as const, error: "The PARTICIPANTS module is not enabled for this event" };
        }
        const participant = await loadParticipant(tx, event.id, req.params.participantId);
        if (!participant) return { status: 404 as const, error: "Participant not found" };
        if (participant.archivedAt) {
          return { status: 409 as const, error: "Participant is archived. Restore it before managing media." };
        }

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
        const media = await tx.eventParticipantMedia.create({
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

        if (parsed.data.kind === "PROFILE_IMAGE" && visibility === "PUBLIC") {
          await tx.eventParticipant.update({ where: { id: participant.id }, data: { photoUrl: media.fileUrl } });
        }
        return { status: 201 as const, media, eventId: event.id, participantId: participant.id };
      });

      if (!result) {
        await cleanupUploadedFile();
        return res.status(404).json({ error: "Event not found" });
      }
      if (result.status !== 201) {
        await cleanupUploadedFile();
        return res.status(result.status).json({ error: result.error });
      }

      mediaPersisted = true;
      await logAudit({
        actorUserId: req.user!.id,
        action: "eventParticipantMedia.created",
        entityType: "EventParticipantMedia",
        entityId: result.media.id,
        metadata: { eventId: result.eventId, participantId: result.participantId, kind: result.media.kind, visibility: result.media.visibility },
      });
      return res.status(201).json({ media: result.media });
    } catch (error) {
      if (!mediaPersisted) {
        try {
          await cleanupUploadedFile();
        } catch (cleanupError) {
          return next(new AggregateError([error, cleanupError], "Participant media request and upload cleanup failed"));
        }
      }
      return next(error);
    }
  },
);

router.patch("/:eventId/participants/:participantId/media/reorder", eventMutationRateLimit, async (req, res) => {
  const result = await withLockedEventAccess(req.params.eventId, req.user!, "event:update", async (tx, event) => {
    if (!(await participantsEnabled(tx, event.id))) {
      return { status: 409 as const, error: "The PARTICIPANTS module is not enabled for this event" };
    }
    const participant = await loadParticipant(tx, event.id, req.params.participantId);
    if (!participant) return { status: 404 as const, error: "Participant not found" };
    if (participant.archivedAt) {
      return { status: 409 as const, error: "Participant is archived. Restore it before managing media." };
    }
    const parsed = reorderSchema.safeParse(req.body);
    if (!parsed.success) return { status: 400 as const, error: parsed.error.issues[0].message };

    const ids = parsed.data.items.map((item) => item.id);
    const owned = await tx.eventParticipantMedia.findMany({
      where: { id: { in: ids }, participantId: participant.id, archivedAt: null },
      select: { id: true },
    });
    if (owned.length !== ids.length) {
      return { status: 403 as const, error: "One or more media items do not belong to this participant" };
    }
    for (const item of parsed.data.items) {
      await tx.eventParticipantMedia.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } });
    }
    const items = await tx.eventParticipantMedia.findMany({
      where: { participantId: participant.id, archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return { status: 200 as const, items, eventId: event.id, participantId: participant.id, count: ids.length };
  });
  if (!result) return res.status(404).json({ error: "Event not found" });
  if (result.status !== 200) return res.status(result.status).json({ error: result.error });

  await logAudit({
    actorUserId: req.user!.id,
    action: "eventParticipantMedia.reordered",
    entityType: "EventParticipant",
    entityId: result.participantId,
    metadata: { eventId: result.eventId, count: result.count },
  });
  return res.json({ items: result.items });
});

router.patch("/:eventId/participants/:participantId/media/:mediaId", eventMutationRateLimit, async (req, res) => {
  const result = await withLockedEventAccess(req.params.eventId, req.user!, "event:update", async (tx, event) => {
    if (!(await participantsEnabled(tx, event.id))) {
      return { status: 409 as const, error: "The PARTICIPANTS module is not enabled for this event" };
    }
    const participant = await loadParticipant(tx, event.id, req.params.participantId);
    if (!participant) return { status: 404 as const, error: "Participant not found" };
    if (participant.archivedAt) {
      return { status: 409 as const, error: "Participant is archived. Restore it before managing media." };
    }
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return { status: 400 as const, error: parsed.error.issues[0].message };
    const existing = await tx.eventParticipantMedia.findFirst({
      where: { id: req.params.mediaId, participantId: participant.id },
    });
    if (!existing) return { status: 404 as const, error: "Media item not found" };
    if (existing.archivedAt) return { status: 409 as const, error: "Media item is archived. Restore it before editing." };
    const media = await tx.eventParticipantMedia.update({ where: { id: existing.id }, data: parsed.data });
    return { status: 200 as const, media, eventId: event.id, participantId: participant.id, changedFields: Object.keys(parsed.data) };
  });
  if (!result) return res.status(404).json({ error: "Event not found" });
  if (result.status !== 200) return res.status(result.status).json({ error: result.error });

  await logAudit({
    actorUserId: req.user!.id,
    action: "eventParticipantMedia.updated",
    entityType: "EventParticipantMedia",
    entityId: result.media.id,
    metadata: { eventId: result.eventId, participantId: result.participantId, changedFields: result.changedFields },
  });
  return res.json({ media: result.media });
});

router.delete("/:eventId/participants/:participantId/media/:mediaId", eventMutationRateLimit, async (req, res) => {
  const result = await withLockedEventAccess(req.params.eventId, req.user!, "event:update", async (tx, event) => {
    if (!(await participantsEnabled(tx, event.id))) {
      return { status: 409 as const, error: "The PARTICIPANTS module is not enabled for this event" };
    }
    const participant = await loadParticipant(tx, event.id, req.params.participantId);
    if (!participant) return { status: 404 as const, error: "Participant not found" };
    if (participant.archivedAt) {
      return { status: 409 as const, error: "Participant is archived. Restore it before managing media." };
    }
    const existing = await tx.eventParticipantMedia.findFirst({
      where: { id: req.params.mediaId, participantId: participant.id },
    });
    if (!existing) return { status: 404 as const, error: "Media item not found" };
    if (existing.archivedAt) return { status: 204 as const, alreadyArchived: true };

    const media = await tx.eventParticipantMedia.update({
      where: { id: existing.id },
      data: { active: false, archivedAt: new Date() },
    });

    if (existing.kind === "PROFILE_IMAGE" && participant.isPublic) {
      const next = await tx.eventParticipantMedia.findFirst({
        where: {
          participantId: participant.id,
          kind: "PROFILE_IMAGE",
          visibility: "PUBLIC",
          active: true,
          archivedAt: null,
          id: { not: media.id },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        select: { fileUrl: true },
      });
      await tx.eventParticipant.update({ where: { id: participant.id }, data: { photoUrl: next?.fileUrl ?? null } });
    }
    return { status: 204 as const, id: media.id, eventId: event.id, participantId: participant.id, alreadyArchived: false };
  });
  if (!result) return res.status(404).json({ error: "Event not found" });
  if (result.status !== 204) return res.status(result.status).json({ error: result.error });
  if (result.alreadyArchived) return res.status(204).send();

  await logAudit({
    actorUserId: req.user!.id,
    action: "eventParticipantMedia.archived",
    entityType: "EventParticipantMedia",
    entityId: result.id,
    metadata: { eventId: result.eventId, participantId: result.participantId },
  });
  return res.status(204).send();
});

router.post("/:eventId/participants/:participantId/media/:mediaId/restore", eventMutationRateLimit, async (req, res) => {
  const result = await withLockedEventAccess(req.params.eventId, req.user!, "event:update", async (tx, event) => {
    if (!(await participantsEnabled(tx, event.id))) {
      return { status: 409 as const, error: "The PARTICIPANTS module is not enabled for this event" };
    }
    const participant = await loadParticipant(tx, event.id, req.params.participantId);
    if (!participant) return { status: 404 as const, error: "Participant not found" };
    if (participant.archivedAt) {
      return { status: 409 as const, error: "Participant is archived. Restore it before managing media." };
    }
    const existing = await tx.eventParticipantMedia.findFirst({
      where: { id: req.params.mediaId, participantId: participant.id },
    });
    if (!existing) return { status: 404 as const, error: "Media item not found" };
    if (!existing.archivedAt) return { status: 400 as const, error: "Media item is not archived" };

    if (existing.kind !== "GALLERY") {
      await tx.$queryRaw`SELECT id FROM event_participants WHERE id = ${participant.id} FOR UPDATE`;
      await tx.eventParticipantMedia.updateMany({
        where: { participantId: participant.id, kind: existing.kind, archivedAt: null, id: { not: existing.id } },
        data: { active: false, archivedAt: new Date() },
      });
    }
    const media = await tx.eventParticipantMedia.update({
      where: { id: existing.id },
      data: { active: true, archivedAt: null },
    });
    if (media.kind === "PROFILE_IMAGE" && media.visibility === "PUBLIC") {
      await tx.eventParticipant.update({ where: { id: participant.id }, data: { photoUrl: media.fileUrl } });
    }
    return { status: 200 as const, media, eventId: event.id, participantId: participant.id };
  });
  if (!result) return res.status(404).json({ error: "Event not found" });
  if (result.status !== 200) return res.status(result.status).json({ error: result.error });

  await logAudit({
    actorUserId: req.user!.id,
    action: "eventParticipantMedia.restored",
    entityType: "EventParticipantMedia",
    entityId: result.media.id,
    metadata: { eventId: result.eventId, participantId: result.participantId },
  });
  return res.json({ media: result.media });
});

router.get("/:eventId/participants/:participantId/media/:mediaId/file", async (req, res) => {
  const result = await withLockedEventAccess(req.params.eventId, req.user!, "event:view", async (tx, event) => {
    if (!(await participantsEnabled(tx, event.id))) {
      return { status: 409 as const, error: "The PARTICIPANTS module is not enabled for this event" };
    }
    const participant = await loadParticipant(tx, event.id, req.params.participantId);
    if (!participant) return { status: 404 as const, error: "Participant not found" };
    if (participant.archivedAt) {
      return { status: 409 as const, error: "Participant is archived. Restore it before accessing media." };
    }
    const media = await tx.eventParticipantMedia.findFirst({
      where: { id: req.params.mediaId, participantId: participant.id, archivedAt: null, active: true },
    });
    if (!media) return { status: 404 as const, error: "Media item not found" };
    return { status: 200 as const, media };
  });
  if (!result) return res.status(404).json({ error: "Event not found" });
  if (result.status !== 200) return res.status(result.status).json({ error: result.error });

  try {
    const object = await getStoredObject(result.media.fileUrl);
    res.setHeader("Content-Type", result.media.mimeType);
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


export const publicParticipantProfileRouter = Router();
publicParticipantProfileRouter.get("/events/:id/participants/:participantId/profile", publicSearchRateLimit, async (req, res) => {
  const event = await prisma.event.findFirst({
    where: { id: req.params.id, status: "PUBLISHED", visibility: "public", archivedAt: null },
    select: {
      id: true,
      title: true,
      startDate: true,
      endDate: true,
      timezone: true,
      venue: true,
      city: true,
      organizer: { select: { name: true, slug: true } },
      moduleEnablements: { where: { moduleType: "PARTICIPANTS" }, select: { enabled: true } },
    },
  });
  if (!event || event.moduleEnablements[0]?.enabled !== true) return res.status(404).json({ error: "Participant profile not found" });

  const participant = await prisma.eventParticipant.findFirst({
    where: {
      id: req.params.participantId,
      eventId: event.id,
      status: "ACTIVE",
      isPublic: true,
      archivedAt: null,
      participantType: { not: "STAFF" },
    },
    select: {
      id: true,
      participantType: true,
      customType: true,
      name: true,
      title: true,
      organization: true,
      bio: true,
      website: true,
      photoUrl: true,
      sortOrder: true,
      sponsorProfile: {
        select: {
          logoUrl: true,
          brandPrimaryColor: true,
          brandSecondaryColor: true,
          displayWebsite: true,
          benefitsOverride: true,
          deliverablesOverride: true,
          package: {
            select: {
              name: true,
              description: true,
              benefits: true,
              deliverables: true,
              status: true,
            },
          },
        },
      },
      vendorProfile: {
        select: {
          serviceArea: true,
          operatingHours: true,
          displayWebsite: true,
          services: {
            where: { service: { status: "ACTIVE" } },
            orderBy: { sortOrder: "asc" },
            select: { service: { select: { name: true, description: true, category: true } } },
          },
        },
      },
    },
  });
  if (!participant) return res.status(404).json({ error: "Participant profile not found" });

  const media = await prisma.eventParticipantMedia.findMany({
    where: { participantId: participant.id, visibility: "PUBLIC", active: true, archivedAt: null },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, kind: true, fileUrl: true, altText: true, caption: true, sortOrder: true },
  });

  const sponsorProfile = participant.participantType === "SPONSOR" && participant.sponsorProfile
    ? {
        logoUrl: participant.sponsorProfile.logoUrl,
        brandPrimaryColor: participant.sponsorProfile.brandPrimaryColor,
        brandSecondaryColor: participant.sponsorProfile.brandSecondaryColor,
        displayWebsite: participant.sponsorProfile.displayWebsite,
        benefitsOverride: participant.sponsorProfile.benefitsOverride,
        deliverablesOverride: participant.sponsorProfile.deliverablesOverride,
        package: participant.sponsorProfile.package?.status === "ACTIVE" ? participant.sponsorProfile.package : null,
      }
    : null;
  const vendorProfile = participant.participantType === "VENDOR" && participant.vendorProfile
    ? {
        serviceArea: participant.vendorProfile.serviceArea,
        operatingHours: participant.vendorProfile.operatingHours,
        displayWebsite: participant.vendorProfile.displayWebsite,
        services: participant.vendorProfile.services.map((item) => item.service),
      }
    : null;

  return res.json({
    event: {
      id: event.id,
      title: event.title,
      startDate: event.startDate,
      endDate: event.endDate,
      timezone: event.timezone,
      venue: event.venue,
      city: event.city,
      organizer: event.organizer,
    },
    participant: { ...participant, sponsorProfile, vendorProfile },
    media,
  });
});

export default router;
