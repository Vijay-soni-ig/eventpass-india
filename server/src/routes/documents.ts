import { Router } from "express";
import { z } from "zod";
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

const KYC_REVIEW_IN_PROGRESS = "Your KYC submission is already submitted or under review. Wait for the current review to finish before uploading more KYC evidence.";
const documentCategorySchema = z.enum(["gst_certificate", "pan_card", "identity_proof", "authorization_letter", "bank_proof", "general"]);
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

function privateDownloadUrl(req: { protocol: string; get(name: string): string | undefined }, id: string, businessId: string, includeArchived = false) {
  const archivedQuery = includeArchived ? "&includeArchived=true" : "";
  return `${req.protocol}://${req.get("host")}/api/documents/${id}/download?businessId=${encodeURIComponent(businessId)}${archivedQuery}`;
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
  const includeArchivedParam = req.query.includeArchived;
  if (includeArchivedParam !== undefined && includeArchivedParam !== "true" && includeArchivedParam !== "false") {
    return res.status(400).json({ error: "includeArchived must be true or false" });
  }
  const includeArchived = includeArchivedParam === "true";
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "document:view");
  const requestedBusinessId = req.get("X-Exhibitor-Business-Id")?.trim();
  const selection = resolveActiveBusinessSelection(businessIds, requestedBusinessId);
  if ("error" in selection) return res.status(selection.status).json({ error: selection.error });

  const documents = selection.businessId
    ? await withDocumentViewPermission(req.user!, selection.businessId, (tx) =>
        tx.document.findMany({
          where: { exhibitorBusinessId: selection.businessId!, archivedAt: includeArchived ? { not: null } : null },
          orderBy: { createdAt: "desc" },
        }),
      )
    : [];
  if (documents === null) return res.status(404).json({ error: "Exhibitor business not found" });

  // Never expose the backing /uploads path. The returned URL is an
  // authenticated, tenant-scoped download endpoint even for legacy rows
  // whose database fileUrl still points at the old public location.
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  const privateDocuments = documents.map((document) => ({
    ...document,
    fileUrl: privateDownloadUrl(req, document.id, document.exhibitorBusinessId, includeArchived),
  }));
  res.json({ documents: privateDocuments });
});

router.get("/:id/download", async (req, res) => {
  const includeArchived = req.query.includeArchived === "true";
  if (req.query.includeArchived !== undefined && req.query.includeArchived !== "true" && req.query.includeArchived !== "false") {
    return res.status(400).json({ error: "includeArchived must be true or false" });
  }
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "document:view");
  const requestedBusinessId = typeof req.query.businessId === "string" ? req.query.businessId.trim() : undefined;
  const selection = resolveActiveBusinessSelection(businessIds, requestedBusinessId);
  if ("error" in selection || !selection.businessId) return res.status(404).json({ error: "Document not found" });

  // Keep the tenant lock through the private file read. Membership mutations
  // acquire this same business-row lock, so a revocation that wins first is
  // denied and a download that wins first completes its authorized read before
  // the revocation can commit. Release the lock once the bytes are in memory;
  // never hold a database transaction while streaming the response to client.
  const downloaded = await withDocumentViewPermission(req.user!, selection.businessId, async (tx) => {
    const document = await tx.document.findFirst({
      where: { id: req.params.id, exhibitorBusinessId: selection.businessId!, archivedAt: includeArchived ? { not: null } : null },
    });
    if (!document) return null;

    // Private documents are never exposed through the public storage route.
    // New object-storage references are fetched server-side; legacy local URLs
    // remain supported. The complete object is read before releasing the lock.
    try {
      let body: Buffer;
      let storedContentType: string | undefined;
      let filename: string;
      if (document.fileUrl.startsWith("s3://") || document.fileUrl.startsWith("local://")) {
        const object = await getStoredObject(document.fileUrl);
        body = object.body;
        storedContentType = object.contentType;
        filename = document.fileUrl.split("/").pop() || document.name;
      } else {
        filename = path.basename(new URL(document.fileUrl).pathname);
        const filePath = path.join(__dirname, "..", "..", "uploads", "exhibitor-documents", filename);
        if (!fs.existsSync(filePath)) return null;
        body = await fs.promises.readFile(filePath);
      }
      return { document, body, storedContentType, filename };
    } catch {
      return null;
    }
  });
  if (!downloaded) return res.status(404).json({ error: "Document not found" });

  const { document, body, storedContentType, filename } = downloaded;
  const safeName = document.name
    .replaceAll(String.fromCharCode(92), "_")
    .replaceAll('"', "_")
    .replaceAll(String.fromCharCode(13), "_")
    .replaceAll(String.fromCharCode(10), "_");
  res.setHeader("Content-Type", documentContentType(filename, storedContentType));
  res.setHeader("Content-Length", String(body.length));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  return res.send(body);
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
  const categoryResult = documentCategorySchema.safeParse(req.body.category ?? "general");
  if (!categoryResult.success) {
    try { await cleanupUploadedFile(); } catch (error) { return next(error); }
    return res.status(400).json({ error: "Invalid document category" });
  }
  const category = categoryResult.data;
  try {
    const document = await withDocumentManagePermission(req.user!, targetBusinessId, async (tx) => {
      if (category !== "general") {
        const business = await tx.exhibitorBusiness.findUnique({
          where: { id: targetBusinessId },
          select: { kycWorkflowStatus: true },
        });
        if (business?.kycWorkflowStatus === "submitted" || business?.kycWorkflowStatus === "under_review") throw new Error(KYC_REVIEW_IN_PROGRESS);
      }
      return tx.document.create({
        data: {
          exhibitorBusinessId: targetBusinessId,
          uploadedByUserId: req.user!.id,
          name,
          fileUrl: fileUrlValue,
          category,
          reviewStatus: category === "general" ? "not_required" : "not_submitted",
        },
      });
    });
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
    if (error instanceof Error && error.message === KYC_REVIEW_IN_PROGRESS) {
      return res.status(409).json({ error: error.message });
    }
    return next(error);
  }
});


// Submit the active business's categorized KYC documents for platform review.
// Generic documents remain outside the KYC workflow.
router.post("/kyc/submit", documentDeleteRateLimit, async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "document:manage");
  const selection = resolveActiveBusinessSelection(businessIds, req.get("X-Exhibitor-Business-Id")?.trim());
  if ("error" in selection || !selection.businessId) return res.status(404).json({ error: "Exhibitor business not found" });

  try {
    const result = await withDocumentManagePermission(req.user!, selection.businessId, async (tx) => {
      const workflowBusiness = await tx.exhibitorBusiness.findUnique({ where: { id: selection.businessId! }, select: { kycWorkflowStatus: true } });
      if (workflowBusiness?.kycWorkflowStatus === "submitted" || workflowBusiness?.kycWorkflowStatus === "under_review") return { error: KYC_REVIEW_IN_PROGRESS };
      const documents = await tx.document.findMany({
        where: { exhibitorBusinessId: selection.businessId!, archivedAt: null, category: { not: "general" } },
        select: { id: true, reviewStatus: true },
      });
      if (documents.length === 0) return { error: "Upload at least one categorized KYC document before submitting" as const };
      if (documents.some((document) => document.reviewStatus === "rejected")) {
        return { error: "Archive rejected documents before submitting replacement files" as const };
      }
      const submittable = documents.filter((document) => document.reviewStatus === "not_submitted");
      if (submittable.length === 0) {
        if (documents.some((document) => document.reviewStatus === "pending_review")) {
          return { error: "Your KYC submission is already under review" as const };
        }
        if (documents.every((document) => document.reviewStatus === "approved")) {
          return { error: "All active KYC documents are already approved" as const };
        }
        return { error: "Archive rejected documents and upload replacements before resubmitting" as const };
      }
      const now = new Date();
      await tx.document.updateMany({
        where: { id: { in: submittable.map((document) => document.id) }, exhibitorBusinessId: selection.businessId!, archivedAt: null, reviewStatus: "not_submitted" },
        data: { reviewStatus: "pending_review", submittedAt: now, rejectionReason: null, reviewedByUserId: null, reviewedAt: null },
      });
      const business = await tx.exhibitorBusiness.update({
        where: { id: selection.businessId! },
        data: { kycWorkflowStatus: "submitted" },
        select: { id: true, kycWorkflowStatus: true },
      });
      return { business, submittedCount: submittable.length };
    });
    if ("error" in result) return res.status(result.error === KYC_REVIEW_IN_PROGRESS ? 409 : 400).json({ error: result.error });
    await logAudit({
      actorUserId: req.user!.id,
      action: "exhibitor.kyc_submitted",
      entityType: "ExhibitorBusiness",
      entityId: result.business.id,
      metadata: { submittedDocumentCount: result.submittedCount },
    });
    return res.json({ status: result.business.kycWorkflowStatus, submittedCount: result.submittedCount });
  } catch (error) {
    if (error instanceof Error && error.message === DOCUMENT_PERMISSION_CHANGED) return res.status(403).json({ error: error.message });
    throw error;
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
      if (current.category !== "general" && current.reviewStatus !== "rejected" && current.reviewStatus !== "not_submitted") {
        return { blocked: true as const };
      }
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
  if ("blocked" in archived) return res.status(409).json({ error: "Submitted or approved KYC documents cannot be archived" });
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
