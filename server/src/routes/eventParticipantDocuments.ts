import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { withLockedEventAccess } from "../lib/lockedEventAccess";
import { uploadRateLimit, eventMutationRateLimit } from "../middleware/rateLimit";
import { uploadParticipantDocument, handleUpload } from "../middleware/upload";
import { deleteStoredFile, getStoredObject, privateStoredFileReference } from "../lib/storage";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);

const KINDS = ["IDENTITY", "CERTIFICATE", "AGREEMENT", "OTHER"] as const;
const metaSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(KINDS),
  description: z.string().trim().max(500).optional(),
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
    select: { id: true, archivedAt: true },
  });
}

// Keep the inexpensive preflight before Multer writes the object. The upload
// handler repeats the same locked authorization immediately before DB create.
async function requireParticipantDocumentUploadAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await withLockedEventAccess(req.params.eventId, req.user!, "event:update", async (tx, event) => {
      if (!(await participantsEnabled(tx, event.id))) {
        return { status: 409 as const, error: "The PARTICIPANTS module is not enabled for this event" };
      }
      const participant = await loadParticipant(tx, event.id, req.params.participantId);
      if (!participant) return { status: 404 as const, error: "Participant not found" };
      if (participant.archivedAt) {
        return { status: 409 as const, error: "Participant is archived. Restore it before managing documents." };
      }
      return { status: 200 as const };
    });
    if (!result) return res.status(404).json({ error: "Event not found" });
    if (result.status !== 200) return res.status(result.status).json({ error: result.error });
    return next();
  } catch (error) {
    return next(error);
  }
}

router.get("/:eventId/participants/:participantId/documents", async (req, res) => {
  const result = await withLockedEventAccess(req.params.eventId, req.user!, "event:view", async (tx, event) => {
    if (!(await participantsEnabled(tx, event.id))) {
      return { status: 409 as const, error: "The PARTICIPANTS module is not enabled for this event" };
    }
    const participant = await loadParticipant(tx, event.id, req.params.participantId);
    if (!participant) return { status: 404 as const, error: "Participant not found" };
    if (participant.archivedAt) {
      return { status: 409 as const, error: "Participant is archived. Restore it before accessing documents." };
    }

    const documents = await tx.eventParticipantDocument.findMany({
      where: { participantId: participant.id, archivedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, kind: true, description: true, mimeType: true, fileSizeBytes: true, createdAt: true, updatedAt: true },
    });
    return { status: 200 as const, documents };
  });
  if (!result) return res.status(404).json({ error: "Event not found" });
  if (result.status !== 200) return res.status(result.status).json({ error: result.error });
  return res.json({ documents: result.documents });
});

router.post(
  "/:eventId/participants/:participantId/documents",
  requireParticipantDocumentUploadAccess,
  uploadRateLimit,
  handleUpload(uploadParticipantDocument, "file"),
  async (req, res, next) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    // The upload middleware has persisted this private object. Any rejection
    // before the document row exists must remove it from local or S3 storage.
    const fileReference = privateStoredFileReference("participant-documents", req.file.filename);
    const cleanupUploadedFile = () => deleteStoredFile(fileReference);
    let documentPersisted = false;

    try {
      const parsed = metaSchema.safeParse({
        name: req.body?.name,
        kind: req.body?.kind,
        description: req.body?.description || undefined,
      });
      if (!parsed.success) {
        await cleanupUploadedFile();
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }

      const result = await withLockedEventAccess(req.params.eventId, req.user!, "event:update", async (tx, event) => {
        if (!(await participantsEnabled(tx, event.id))) {
          return { status: 409 as const, error: "The PARTICIPANTS module is not enabled for this event" };
        }
        const participant = await loadParticipant(tx, event.id, req.params.participantId);
        if (!participant) return { status: 404 as const, error: "Participant not found" };
        if (participant.archivedAt) {
          return { status: 409 as const, error: "Participant is archived. Restore it before managing documents." };
        }

        const document = await tx.eventParticipantDocument.create({
          data: {
            participantId: participant.id,
            name: parsed.data.name,
            kind: parsed.data.kind,
            description: parsed.data.description,
            fileUrl: fileReference,
            mimeType: req.file!.mimetype,
            fileSizeBytes: req.file!.size,
            uploadedByUserId: req.user!.id,
          },
          select: { id: true, name: true, kind: true, description: true, mimeType: true, fileSizeBytes: true, createdAt: true, updatedAt: true },
        });
        return { status: 201 as const, document, eventId: event.id, participantId: participant.id };
      });

      if (!result) {
        await cleanupUploadedFile();
        return res.status(404).json({ error: "Event not found" });
      }
      if (result.status !== 201) {
        await cleanupUploadedFile();
        return res.status(result.status).json({ error: result.error });
      }

      documentPersisted = true;
      // Once the row exists, retain its file even if audit logging fails.
      await logAudit({
        actorUserId: req.user!.id,
        action: "eventParticipantDocument.created",
        entityType: "EventParticipantDocument",
        entityId: result.document.id,
        metadata: { eventId: result.eventId, participantId: result.participantId, kind: result.document.kind },
      });
      return res.status(201).json({ document: result.document });
    } catch (error) {
      // If creation failed, no document row was persisted and the upload is orphaned.
      // If audit logging failed after creation, keep the object linked to its row.
      if (!documentPersisted) {
        try {
          await cleanupUploadedFile();
        } catch (cleanupError) {
          return next(new AggregateError([error, cleanupError], "Participant document request and upload cleanup failed"));
        }
      }
      return next(error);
    }
  },
);

router.get("/:eventId/participants/:participantId/documents/:documentId/download", async (req, res) => {
  const result = await withLockedEventAccess(req.params.eventId, req.user!, "event:view", async (tx, event) => {
    if (!(await participantsEnabled(tx, event.id))) {
      return { status: 409 as const, error: "The PARTICIPANTS module is not enabled for this event" };
    }
    const participant = await loadParticipant(tx, event.id, req.params.participantId);
    if (!participant) return { status: 404 as const, error: "Participant not found" };
    if (participant.archivedAt) {
      return { status: 409 as const, error: "Participant is archived. Restore it before managing documents." };
    }

    const document = await tx.eventParticipantDocument.findFirst({
      where: { id: req.params.documentId, participantId: participant.id, archivedAt: null },
    });
    if (!document) return { status: 404 as const, error: "Document not found" };

    try {
      // Keep the organizer lock until the private object has been read. A
      // concurrent membership revocation therefore cannot interleave between
      // authorization and the protected object read.
      const object = await getStoredObject(document.fileUrl);
      return { status: 200 as const, document, body: object.body };
    } catch {
      return { status: 404 as const, error: "Document file not found" };
    }
  });
  if (!result) return res.status(404).json({ error: "Event not found" });
  if (result.status !== 200) return res.status(result.status).json({ error: result.error });

  res.setHeader("Content-Type", result.document.mimeType);
  res.setHeader("Content-Length", String(result.body.length));
  res.setHeader("Content-Disposition", `attachment; filename="${result.document.name.replace(/["\\\\\\r\\n]/g, "_")}"`);
  res.setHeader("Cache-Control", "private, no-store");
  return res.send(result.body);
});

router.delete("/:eventId/participants/:participantId/documents/:documentId", eventMutationRateLimit, async (req, res) => {
  const result = await withLockedEventAccess(req.params.eventId, req.user!, "event:update", async (tx, event) => {
    if (!(await participantsEnabled(tx, event.id))) {
      return { status: 409 as const, error: "The PARTICIPANTS module is not enabled for this event" };
    }
    const participant = await loadParticipant(tx, event.id, req.params.participantId);
    if (!participant) return { status: 404 as const, error: "Participant not found" };
    if (participant.archivedAt) {
      return { status: 409 as const, error: "Participant is archived. Restore it before managing documents." };
    }
    const document = await tx.eventParticipantDocument.findFirst({
      where: { id: req.params.documentId, participantId: participant.id, archivedAt: null },
      select: { id: true },
    });
    if (!document) return { status: 404 as const, error: "Document not found" };
    const archived = await tx.eventParticipantDocument.update({
      where: { id: document.id },
      data: { archivedAt: new Date() },
      select: { id: true },
    });
    return { status: 204 as const, id: archived.id, eventId: event.id, participantId: participant.id };
  });
  if (!result) return res.status(404).json({ error: "Event not found" });
  if (result.status !== 204) return res.status(result.status).json({ error: result.error });

  await logAudit({
    actorUserId: req.user!.id,
    action: "eventParticipantDocument.archived",
    entityType: "EventParticipantDocument",
    entityId: result.id,
    metadata: { eventId: result.eventId, participantId: result.participantId },
  });
  return res.status(204).send();
});

router.post("/:eventId/participants/:participantId/documents/:documentId/restore", eventMutationRateLimit, async (req, res) => {
  const result = await withLockedEventAccess(req.params.eventId, req.user!, "event:update", async (tx, event) => {
    if (!(await participantsEnabled(tx, event.id))) {
      return { status: 409 as const, error: "The PARTICIPANTS module is not enabled for this event" };
    }
    const participant = await loadParticipant(tx, event.id, req.params.participantId);
    if (!participant) return { status: 404 as const, error: "Participant not found" };
    if (participant.archivedAt) {
      return { status: 409 as const, error: "Participant is archived. Restore it before managing documents." };
    }
    const document = await tx.eventParticipantDocument.findFirst({
      where: { id: req.params.documentId, participantId: participant.id, archivedAt: { not: null } },
      select: { id: true },
    });
    if (!document) return { status: 404 as const, error: "Archived document not found" };
    const restored = await tx.eventParticipantDocument.update({
      where: { id: document.id },
      data: { archivedAt: null },
      select: { id: true, name: true, kind: true, description: true, mimeType: true, fileSizeBytes: true, createdAt: true, updatedAt: true },
    });
    return { status: 200 as const, document: restored, eventId: event.id, participantId: participant.id };
  });
  if (!result) return res.status(404).json({ error: "Event not found" });
  if (result.status !== 200) return res.status(result.status).json({ error: result.error });

  await logAudit({
    actorUserId: req.user!.id,
    action: "eventParticipantDocument.restored",
    entityType: "EventParticipantDocument",
    entityId: result.document.id,
    metadata: { eventId: result.eventId, participantId: result.participantId },
  });
  return res.json({ document: result.document });
});

export default router;
