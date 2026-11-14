import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { Prisma, User } from "@prisma/client";
import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma";
import { requireAuth, requireExhibitorBusinessAccess } from "../middleware/auth";
import { uploadDocument, fileUrl, handleUpload } from "../middleware/upload";
import { exhibitorBusinessIdsWithPermission, isPlatformAdmin } from "../lib/access";
import { can, exhibitorRoleToRole } from "../lib/permissions";
import { resolveActiveBusinessSelection } from "../lib/exhibitorBusinessSelection";
import { uploadRateLimit, documentDeleteRateLimit } from "../middleware/rateLimit";
import { deleteStoredFile, getStoredObject, privateStoredFileReference } from "../lib/storage";
import { logAudit } from "../lib/audit";

const router = Router();

router.use(requireAuth, requireExhibitorBusinessAccess);

const SAFE_DOCUMENT_CONTENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const DOCUMENT_PERMISSION_CHANGED = "Document management permission changed; refresh and try again";

/**
 * Serialize document mutations against exhibitor membership changes. All
 * membership mutation routes lock the same business row before changing a
 * membership, so this lock + fresh role lookup closes the authorization
 * check/write race for upload, archive and restore.
 */
async function withDocumentManagePermission<T>(
  user: User,
  businessId: string,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "exhibitor_businesses" WHERE "id" = ${businessId} FOR UPDATE`;

    if (!isPlatformAdmin(user)) {
      const membership = await tx.exhibitorMembership.findFirst({
        where: {
          exhibitorBusinessId: businessId,
          userId: user.id,
          status: "active",
          business: { suspended: false },
        },
        select: { role: true },
      });
      if (!membership || !can(exhibitorRoleToRole(membership.role), "document:manage")) {
        throw new Error(DOCUMENT_PERMISSION_CHANGED);
      }
    }

    return operation(tx);
  });
}

/**
 * Serialize private document reads against exhibitor membership changes.
 * Membership mutations lock the same business row; rechecking permission
 * under that lock prevents a revoked/suspended member from continuing a read
 * based only on a stale preflight membership snapshot.
 */
async function withDocumentViewPermission<T>(
  user: User,
  businessId: string,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "exhibitor_businesses" WHERE "id" = ${businessId} FOR UPDATE`;

    if (!isPlatformAdmin(user)) {
      const membership = await tx.exhibitorMembership.findFirst({
        where: {
          exhibitorBusinessId: businessId,
          userId: user.id,
          status: "active",
          business: { suspended: false },
        },
        select: { role: true },
      });
      if (!membership || !can(exhibitorRoleToRole(membership.role), "document:view")) return null;
    }

    return operation(tx);
  });
}

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
    ? await withDocumentViewPermission(req.user!, selection.businessId, (tx) =>
        tx.document.findMany({
          where: { exhibitorBusinessId: selection.businessId!, archivedAt: null },
          orderBy: { createdAt: "desc" },
        }),
      )
    : [];
  if (documents === null) return res.status(404).json({ error: "Exhibitor business not found" });

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

  try {
    // Keep the tenant lock until the private object has been read into memory.
    // A concurrent membership revocation/suspension therefore serializes
    // before or after this read, rather than racing between auth and storage.
    const result = await withDocumentViewPermission(req.user!, selection.businessId, async (tx) => {
      const document = await tx.document.findFirst({
        where: { id: req.params.id, exhibitorBusinessId: selection.businessId!, archivedAt: null },
      });
      if (!document) return null;

      let body: Buffer;
      let storedContentType: string | undefined;
      let filename: string;
      if (document.fileUrl.startsWith("s3://") || document.fileUrl.startsWith("local://")) {
        const object = await getStoredObject(document.fileUrl);
        body = object.body;
        storedContentType = object.contentType;
        filename = document.fileUrl.split("/").pop() || document.name;
      } else {
        // Legacy public URLs remain supported, but only their basename is
        // resolved under the private exhibitor-documents directory.
        filename = path.basename(new URL(document.fileUrl).pathname);
        const filePath = path.join(__dirname, "..", "..", "uploads", "exhibitor-documents", filename);
        if (!fs.existsSync(filePath)) return null;
        body = await fs.promises.readFile(filePath);
      }
      return { document, body, storedContentType, filename };
    });

    if (!result) return res.status(404).json({ error: "Document not found" });
    res.setHeader("Content-Type", documentContentType(result.filename, result.storedContentType));
    res.setHeader("Content-Length", String(result.body.length));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `attachment; filename="${result.document.name.replace(/["\\\\\\r\\n]/g, "_")}"`);
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    return res.send(result.body);
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
    const document = await withDocumentManagePermission(req.user!, targetBusinessId, (tx) =>
      tx.document.create({
        data: {
          exhibitorBusinessId: targetBusinessId,
          uploadedByUserId: req.user!.id,
          name,
          fileUrl: fileUrlValue,
        },
      }),
    );
    return res.status(201).json({ document: { ...document, fileUrl: privateDownloadUrl(req, document.id, document.exhibitorBusinessId) } });
  } catch (error) {
    try {
      await cleanupUploadedFile();
    } catch (cleanupError) {
      return next(new AggregateError([error, cleanupError], "Document creation and upload cleanup failed"));
    }
    if (error instanceof Error && error.message === DOCUMENT_PERMISSION_CHANGED) {
      return res.status(403).json({ error: error.message });
    }
    return next(error);
  }
});

router.delete("/:id", documentDeleteRateLimit, async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "document:manage");
  const selection = resolveActiveBusinessSelection(businessIds, req.get("X-Exhibitor-Business-Id")?.trim());
  if ("error" in selection || !selection.businessId) return res.status(404).json({ error: "Document not found" });
  const businessId = selection.businessId;
  const document = await prisma.document.findFirst({
    where: { id: req.params.id, exhibitorBusinessId: businessId, archivedAt: null },
  });
  if (!document) return res.status(404).json({ error: "Document not found" });

  let archived;
  try {
    archived = await withDocumentManagePermission(req.user!, businessId, async (tx) => {
      const current = await tx.document.findFirst({
        where: { id: req.params.id, exhibitorBusinessId: businessId, archivedAt: null },
      });
      if (!current) return null;
      return tx.document.update({
        where: { id: current.id },
        data: { archivedAt: new Date() },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === DOCUMENT_PERMISSION_CHANGED) {
      return res.status(403).json({ error: error.message });
    }
    throw error;
  }
  if (!archived) return res.status(404).json({ error: "Document not found" });
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
  const businessId = selection.businessId;
  const document = await prisma.document.findFirst({
    where: { id: req.params.id, exhibitorBusinessId: businessId, archivedAt: { not: null } },
  });
  if (!document) return res.status(404).json({ error: "Archived document not found" });

  let restored;
  try {
    restored = await withDocumentManagePermission(req.user!, businessId, async (tx) => {
      const current = await tx.document.findFirst({
        where: { id: req.params.id, exhibitorBusinessId: businessId, archivedAt: { not: null } },
      });
      if (!current) return null;
      return tx.document.update({
        where: { id: current.id },
        data: { archivedAt: null },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === DOCUMENT_PERMISSION_CHANGED) {
      return res.status(403).json({ error: error.message });
    }
    throw error;
  }
  if (!restored) return res.status(404).json({ error: "Archived document not found" });
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
