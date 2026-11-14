import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma";
import { requireAuth, requireExhibitorBusinessAccess } from "../middleware/auth";
import { uploadDocument, fileUrl, handleUpload } from "../middleware/upload";
import { exhibitorBusinessIdsWithPermission } from "../lib/access";
import { resolveActiveBusinessSelection } from "../lib/exhibitorBusinessSelection";
import { uploadRateLimit, documentDeleteRateLimit } from "../middleware/rateLimit";
import { deleteStoredFile, getStoredObject, privateStoredFileReference } from "../lib/storage";
import { logAudit } from "../lib/audit";

const router = Router();

router.use(requireAuth, requireExhibitorBusinessAccess);

const SAFE_DOCUMENT_CONTENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

function documentContentType(filename: string, storedContentType?: string): string {
  if (storedContentType && SAFE_DOCUMENT_CONTENT_TYPES.has(storedContentType.split(";")[0].trim().toLowerCase())) {
    return storedContentType.split(";")[0].trim().toLowerCase();
  }
  switch (path.extname(filename).toLowerCase()) {
    case ".pdf": return "application/pdf";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".png": return "image/png";
    case ".webp": return "image/webp";
    default: return "application/octet-stream";
  }
}

function privateDownloadUrl(req: { protocol: string; get(name: string): string | undefined }, id: string, businessId: string) {
  return `${req.protocol}://${req.get("host")}/api/documents/${id}/download?businessId=${encodeURIComponent(businessId)}`;
}

// Reject users without document-management permission before multer writes a file.
async function requireDocumentManage(req: Request, res: Response, next: NextFunction) {
  try {
    const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "document:manage");
    if (businessIds.length === 0) return res.status(403).json({ error: "You do not have permission to upload documents" });

    // A user may belong to more than one exhibitor business. Never silently
    // attach a private document to whichever membership happens to sort first.
    // Validate the explicit target before multer writes or persists any bytes.
    const requestedBusinessId = req.get("X-Exhibitor-Business-Id")?.trim();
    if (!requestedBusinessId && businessIds.length > 1) {
      return res.status(400).json({ error: "X-Exhibitor-Business-Id is required when managing multiple exhibitor businesses" });
    }
    if (requestedBusinessId && !businessIds.includes(requestedBusinessId)) {
      return res.status(404).json({ error: "Exhibitor business not found" });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

router.get("/", async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "document:view");
  const requestedBusinessId = req.get("X-Exhibitor-Business-Id")?.trim();
  const selection = resolveActiveBusinessSelection(businessIds, requestedBusinessId);
  if ("error" in selection) return res.status(selection.status).json({ error: selection.error });

  const documents = selection.businessId
    ? await prisma.document.findMany({
        where: { exhibitorBusinessId: selection.businessId, archivedAt: null },
        orderBy: { createdAt: "desc" },
      })
    : [];

  // Never expose the backing /uploads path. The returned URL is an
  // authenticated, tenant-scoped download endpoint even for legacy rows
  // whose database fileUrl still points at the old public location.
  const privateDocuments = documents.map((document) => ({
    ...document,
    fileUrl: privateDownloadUrl(req, document.id, document.exhibitorBusinessId),
  }));
  res.json({ documents: privateDocuments });
});

router.get("/:id/download", async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "document:view");
  const requestedBusinessId = typeof req.query.businessId === "string" ? req.query.businessId.trim() : undefined;
  const selection = resolveActiveBusinessSelection(businessIds, requestedBusinessId);
  if ("error" in selection || !selection.businessId) return res.status(404).json({ error: "Document not found" });

  const document = await prisma.document.findFirst({
    where: { id: req.params.id, exhibitorBusinessId: selection.businessId, archivedAt: null },
  });
  if (!document) return res.status(404).json({ error: "Document not found" });

  // Private documents are never exposed through the public storage route.
  // New object-storage references are fetched server-side after the same
  // tenant authorization check above. Legacy local URLs remain supported.
  try {
    if (document.fileUrl.startsWith("s3://") || document.fileUrl.startsWith("local://")) {
      const object = await getStoredObject(document.fileUrl);
      res.setHeader("Content-Type", documentContentType(document.name, object.contentType));
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Disposition", `attachment; filename="${document.name.replace(/["\\\r\n]/g, "_")}"`);
      return res.send(object.body);
    }

    const filename = path.basename(new URL(document.fileUrl).pathname);
    const filePath = path.join(__dirname, "..", "..", "uploads", "exhibitor-documents", filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Document file not found" });
    res.setHeader("Content-Type", documentContentType(document.name));
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.download(filePath, document.name);
  } catch {
    return res.status(404).json({ error: "Document file not found" });
  }
});

router.post("/", requireDocumentManage, uploadRateLimit, handleUpload(uploadDocument, "file"), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  // The upload middleware has persisted the file. If authorization changes
  // between the pre-upload guard and this handler, remove it before rejecting.
  const fileUrlValue = privateStoredFileReference("exhibitor-documents", req.file.filename);
  const cleanupUploadedFile = async () => {
    try {
      await deleteStoredFile(fileUrlValue);
    } catch (cleanupError) {
      // Preserve both failures so storage cleanup problems are observable.
      throw new AggregateError([cleanupError], "Failed to clean up rejected document upload");
    }
  };

  let businessIds: string[];
  try {
    businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "document:manage");
  } catch (error) {
    try { await cleanupUploadedFile(); } catch (cleanupError) {
      return next(new AggregateError([error, cleanupError], "Document authorization and upload cleanup failed"));
    }
    return next(error);
  }
  if (businessIds.length === 0) {
    try { await cleanupUploadedFile(); } catch (error) { return next(error); }
    return res.status(403).json({ error: "You do not have permission to upload documents" });
  }

  const requestedBusinessId = req.get("X-Exhibitor-Business-Id")?.trim();
  const targetBusinessId = requestedBusinessId || businessIds[0];
  if (!businessIds.includes(targetBusinessId)) {
    try { await cleanupUploadedFile(); } catch (error) { return next(error); }
    return res.status(403).json({ error: "You do not have permission to upload documents" });
  }

  const name = (req.body.name as string | undefined)?.trim() || req.file.originalname;
  try {
    const document = await prisma.document.create({
      data: {
        exhibitorBusinessId: targetBusinessId,
        uploadedByUserId: req.user!.id,
        name,
        fileUrl: fileUrlValue,
      },
    });
    return res.status(201).json({ document: { ...document, fileUrl: privateDownloadUrl(req, document.id, document.exhibitorBusinessId) } });
  } catch (error) {
    try {
      await cleanupUploadedFile();
    } catch (cleanupError) {
      return next(new AggregateError([error, cleanupError], "Document creation and upload cleanup failed"));
    }
    return next(error);
  }
});

router.delete("/:id", documentDeleteRateLimit, async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "document:manage");
  const selection = resolveActiveBusinessSelection(businessIds, req.get("X-Exhibitor-Business-Id")?.trim());
  if ("error" in selection || !selection.businessId) return res.status(404).json({ error: "Document not found" });
  const document = await prisma.document.findFirst({
    where: { id: req.params.id, exhibitorBusinessId: selection.businessId, archivedAt: null },
  });
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
  const selection = resolveActiveBusinessSelection(businessIds, req.get("X-Exhibitor-Business-Id")?.trim());
  if ("error" in selection || !selection.businessId) return res.status(404).json({ error: "Archived document not found" });
  const document = await prisma.document.findFirst({
    where: { id: req.params.id, exhibitorBusinessId: selection.businessId, archivedAt: { not: null } },
  });
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
  res.json({ document: { ...restored, fileUrl: privateDownloadUrl(req, restored.id, restored.exhibitorBusinessId) } });
});

export default router;
