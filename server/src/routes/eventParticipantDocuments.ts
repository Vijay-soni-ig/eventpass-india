import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { organizerIdsWithPermission } from "../lib/access";
import { uploadRateLimit, eventMutationRateLimit } from "../middleware/rateLimit";
import { uploadParticipantDocument, handleUpload } from "../middleware/upload";
import { getStoredObject, privateStoredFileReference } from "../lib/storage";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);

const KINDS = ["IDENTITY", "CERTIFICATE", "AGREEMENT", "OTHER"] as const;
const metaSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(KINDS),
  description: z.string().trim().max(500).optional(),
});

async function loadEvent(eventId: string, user: Parameters<typeof organizerIdsWithPermission>[0], permission: "event:view" | "event:update") {
  const organizerIds = await organizerIdsWithPermission(user, permission);
  if (organizerIds.length === 0) return null;
  return prisma.event.findFirst({
    where: { id: eventId, organizerId: { in: organizerIds } },
    select: { id: true },
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
    select: { id: true, archivedAt: true },
  });
}

router.get("/:eventId/participants/:participantId/documents", async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:view");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await participantsEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });
  const participant = await loadParticipant(event.id, req.params.participantId);
  if (!participant) return res.status(404).json({ error: "Participant not found" });

  const documents = await prisma.eventParticipantDocument.findMany({
    where: { participantId: participant.id, archivedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, kind: true, description: true, mimeType: true, fileSizeBytes: true, createdAt: true, updatedAt: true },
  });
  return res.json({ documents });
});

router.post(
  "/:eventId/participants/:participantId/documents",
  uploadRateLimit,
  handleUpload(uploadParticipantDocument, "file"),
  async (req, res) => {
    const event = await loadEvent(req.params.eventId, req.user!, "event:update");
    if (!event) return res.status(404).json({ error: "Event not found" });
    if (!(await participantsEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });
    const participant = await loadParticipant(event.id, req.params.participantId);
    if (!participant) return res.status(404).json({ error: "Participant not found" });
    if (participant.archivedAt) return res.status(409).json({ error: "Participant is archived. Restore it before managing documents." });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const parsed = metaSchema.safeParse({
      name: req.body?.name,
      kind: req.body?.kind,
      description: req.body?.description || undefined,
    });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

    const document = await prisma.eventParticipantDocument.create({
      data: {
        participantId: participant.id,
        name: parsed.data.name,
        kind: parsed.data.kind,
        description: parsed.data.description,
        fileUrl: privateStoredFileReference("participant-documents", req.file.filename),
        mimeType: req.file.mimetype,
        fileSizeBytes: req.file.size,
        uploadedByUserId: req.user!.id,
      },
      select: { id: true, name: true, kind: true, description: true, mimeType: true, fileSizeBytes: true, createdAt: true, updatedAt: true },
    });

    await logAudit({
      actorUserId: req.user!.id,
      action: "eventParticipantDocument.created",
      entityType: "EventParticipantDocument",
      entityId: document.id,
      metadata: { eventId: event.id, participantId: participant.id, kind: document.kind },
    });
    return res.status(201).json({ document });
  },
);

router.get("/:eventId/participants/:participantId/documents/:documentId/download", async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:view");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await participantsEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });
  const participant = await loadParticipant(event.id, req.params.participantId);
  if (!participant) return res.status(404).json({ error: "Participant not found" });

  const document = await prisma.eventParticipantDocument.findFirst({
    where: { id: req.params.documentId, participantId: participant.id, archivedAt: null },
  });
  if (!document) return res.status(404).json({ error: "Document not found" });

  try {
    const object = await getStoredObject(document.fileUrl);
    res.setHeader("Content-Type", document.mimeType);
    res.setHeader("Content-Length", String(object.body.length));
    res.setHeader("Content-Disposition", `attachment; filename="${document.name.replace(/["\\\r\n]/g, "_")}"`);
    res.setHeader("Cache-Control", "private, no-store");
    return res.send(object.body);
  } catch {
    return res.status(404).json({ error: "Document file not found" });
  }
});

router.delete("/:eventId/participants/:participantId/documents/:documentId", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await participantsEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });
  const participant = await loadParticipant(event.id, req.params.participantId);
  if (!participant) return res.status(404).json({ error: "Participant not found" });

  const document = await prisma.eventParticipantDocument.findFirst({
    where: { id: req.params.documentId, participantId: participant.id, archivedAt: null },
  });
  if (!document) return res.status(404).json({ error: "Document not found" });

  const archived = await prisma.eventParticipantDocument.update({
    where: { id: document.id },
    data: { archivedAt: new Date() },
    select: { id: true },
  });
  await logAudit({
    actorUserId: req.user!.id,
    action: "eventParticipantDocument.archived",
    entityType: "EventParticipantDocument",
    entityId: archived.id,
    metadata: { eventId: event.id, participantId: participant.id },
  });
  return res.status(204).send();
});

router.post("/:eventId/participants/:participantId/documents/:documentId/restore", eventMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req.user!, "event:update");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (!(await participantsEnabled(event.id))) return res.status(409).json({ error: "The PARTICIPANTS module is not enabled for this event" });
  const participant = await loadParticipant(event.id, req.params.participantId);
  if (!participant) return res.status(404).json({ error: "Participant not found" });

  const document = await prisma.eventParticipantDocument.findFirst({
    where: { id: req.params.documentId, participantId: participant.id, archivedAt: { not: null } },
  });
  if (!document) return res.status(404).json({ error: "Archived document not found" });

  const restored = await prisma.eventParticipantDocument.update({
    where: { id: document.id },
    data: { archivedAt: null },
    select: { id: true, name: true, kind: true, description: true, mimeType: true, fileSizeBytes: true, createdAt: true, updatedAt: true },
  });
  await logAudit({
    actorUserId: req.user!.id,
    action: "eventParticipantDocument.restored",
    entityType: "EventParticipantDocument",
    entityId: restored.id,
    metadata: { eventId: event.id, participantId: participant.id },
  });
  return res.json({ document: restored });
});

export default router;
