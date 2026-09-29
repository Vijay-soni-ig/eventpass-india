import { Router } from "express";
import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma";
import { requireAuth, requireExhibitorBusinessAccess } from "../middleware/auth";
import { uploadDocument, fileUrl, handleUpload } from "../middleware/upload";
import { exhibitorBusinessIdsWithPermission } from "../lib/access";
import { uploadRateLimit, documentDeleteRateLimit } from "../middleware/rateLimit";
import { getStoredObject, privateStoredFileReference } from "../lib/storage";

const router = Router();

router.use(requireAuth, requireExhibitorBusinessAccess);

function privateDownloadUrl(req: { protocol: string; get(name: string): string | undefined }, id: string) {
  return `${req.protocol}://${req.get("host")}/api/documents/${id}/download`;
}

router.get("/", async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "document:view");
  const documents = businessIds.length
    ? await prisma.document.findMany({
        where: { exhibitorBusinessId: { in: businessIds }, archivedAt: null },
        orderBy: { createdAt: "desc" },
      })
    : [];

  // Never expose the backing /uploads path. The returned URL is an
  // authenticated, tenant-scoped download endpoint even for legacy rows
  // whose database fileUrl still points at the old public location.
  const privateDocuments = documents.map((document) => ({
    ...document,
    fileUrl: privateDownloadUrl(req, document.id),
  }));
  res.json({ documents: privateDocuments });
});

router.get("/:id/download", async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "document:view");
  if (businessIds.length === 0) return res.status(404).json({ error: "Document not found" });

  const document = await prisma.document.findFirst({
    where: { id: req.params.id, exhibitorBusinessId: { in: businessIds }, archivedAt: null },
  });
  if (!document) return res.status(404).json({ error: "Document not found" });

  // Private documents are never exposed through the public storage route.
  // New object-storage references are fetched server-side after the same
  // tenant authorization check above. Legacy local URLs remain supported.
  try {
    if (document.fileUrl.startsWith("s3://") || document.fileUrl.startsWith("local://")) {
      const object = await getStoredObject(document.fileUrl);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${document.name.replace(/["\\\r\n]/g, "_")}"`);
      return res.send(object.body);
    }

    const filename = path.basename(new URL(document.fileUrl).pathname);
    const filePath = path.join(__dirname, "..", "..", "uploads", "exhibitor-documents", filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Document file not found" });
    return res.download(filePath, document.name);
  } catch {
    return res.status(404).json({ error: "Document file not found" });
  }
});

router.post("/", uploadRateLimit, handleUpload(uploadDocument, "file"), async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "document:manage");
  if (businessIds.length === 0) {
    return res.status(403).json({ error: "You do not have permission to upload documents" });
  }
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const name = (req.body.name as string | undefined)?.trim() || req.file.originalname;
  const fileUrlValue = privateStoredFileReference("exhibitor-documents", req.file.filename);
  const document = await prisma.document.create({
    data: {
      exhibitorBusinessId: businessIds[0],
      uploadedByUserId: req.user!.id,
      name,
      fileUrl: fileUrlValue,
    },
  });
  res.status(201).json({ document: { ...document, fileUrl: privateDownloadUrl(req, document.id) } });
});

router.delete("/:id", documentDeleteRateLimit, async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "document:manage");
  const document = businessIds.length
    ? await prisma.document.findFirst({ where: { id: req.params.id, exhibitorBusinessId: { in: businessIds } } })
    : null;
  if (!document) return res.status(404).json({ error: "Document not found" });

  const archived = await prisma.document.update({
    where: { id: document.id },
    data: { archivedAt: new Date() },
  });
  await logAudit({
    actorUserId: req.user!.id,
    action: "document.archived",
    entityType: "Document",
    entityId: archived.id,
    metadata: { exhibitorBusinessId: archived.exhibitorBusinessId },
  });
  // Keep the stored object so archive/restore preserves the record and its
  // audit trail. Physical retention/deletion belongs to a later retention
  // policy, not the user-facing archive action.
  res.status(204).end();
});

router.post("/:id/restore", documentDeleteRateLimit, async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "document:manage");
  const document = businessIds.length
    ? await prisma.document.findFirst({ where: { id: req.params.id, exhibitorBusinessId: { in: businessIds }, archivedAt: { not: null } } })
    : null;
  if (!document) return res.status(404).json({ error: "Archived document not found" });

  const restored = await prisma.document.update({
    where: { id: document.id },
    data: { archivedAt: null },
  });
  await logAudit({
    actorUserId: req.user!.id,
    action: "document.restored",
    entityType: "Document",
    entityId: restored.id,
    metadata: { exhibitorBusinessId: restored.exhibitorBusinessId },
  });
  res.json({ document: { ...restored, fileUrl: privateDownloadUrl(req, restored.id) } });
});

export default router;
