import { Router } from "express";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { logAudit } from "../lib/audit";
import { platformAdminMutationRateLimit } from "../middleware/rateLimit";
import { getStoredObject, resolveLocalUploadPath } from "../lib/storage";
import { enqueueNotificationIntent } from "../lib/notificationOutboxService";

const router = Router();

const queueQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(["submitted", "under_review", "resubmission_required", "verified"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

router.get("/review-queue", async (req, res) => {
  const parsed = queueQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { search, status, page, limit } = parsed.data;
  const where = {
    ...(status ? { kycWorkflowStatus: status } : { kycWorkflowStatus: { in: ["submitted", "under_review", "resubmission_required"] as const } }),
    ...(search ? {
      OR: [
        { companyName: { contains: search, mode: "insensitive" as const } },
        { owner: { email: { contains: search, mode: "insensitive" as const } } },
        { owner: { fullName: { contains: search, mode: "insensitive" as const } } },
      ],
    } : {}),
  };
  const [total, businesses] = await prisma.$transaction([
    prisma.exhibitorBusiness.count({ where }),
    prisma.exhibitorBusiness.findMany({
      where,
      select: {
        id: true, companyName: true, kycWorkflowStatus: true, createdAt: true,
        owner: { select: { id: true, fullName: true, email: true } },
        documents: {
          where: { archivedAt: null, category: { not: "general" } },
          select: { id: true, name: true, category: true, reviewStatus: true, submittedAt: true, reviewedAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { updatedAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  res.json({ businesses, total, page, pageSize: limit });
});


router.post("/:id/kyc/start-review", platformAdminMutationRateLimit, async (req, res) => {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "exhibitor_businesses" WHERE "id" = ${req.params.id} FOR UPDATE`;
    const business = await tx.exhibitorBusiness.findUnique({
      where: { id: req.params.id },
      select: { id: true, kycWorkflowStatus: true },
    });
    if (!business) return { error: "Exhibitor not found" as const };
    if (business.kycWorkflowStatus !== "submitted") {
      return { error: "Only submitted KYC applications can be moved into review" as const };
    }
    const pendingCount = await tx.document.count({
      where: { exhibitorBusinessId: business.id, archivedAt: null, category: { not: "general" }, reviewStatus: "pending_review" },
    });
    if (pendingCount === 0) return { error: "No submitted KYC documents are awaiting review" as const };
    const changed = await tx.exhibitorBusiness.updateMany({
      where: { id: business.id, kycWorkflowStatus: "submitted" },
      data: { kycWorkflowStatus: "under_review" },
    });
    if (changed.count !== 1) return { error: "KYC review was already started; refresh and try again" as const };
    const updated = await tx.exhibitorBusiness.findUniqueOrThrow({
      where: { id: business.id },
      select: { id: true, kycWorkflowStatus: true },
    });
    return { business: updated };
  });
  if ("error" in result) return res.status(result.error === "Exhibitor not found" ? 404 : 409).json({ error: result.error });
  await logAudit({
    actorUserId: req.user!.id,
    action: "platform.exhibitor_kyc_review_started",
    entityType: "ExhibitorBusiness",
    entityId: result.business.id,
    metadata: { status: result.business.kycWorkflowStatus },
  });
  res.json({ business: result.business });
});

router.get("/:id/kyc-documents", async (req, res) => {
  const business = await prisma.exhibitorBusiness.findUnique({
    where: { id: req.params.id },
    select: {
      id: true, companyName: true, kycWorkflowStatus: true,
      owner: { select: { id: true, fullName: true, email: true, phone: true } },
      documents: {
        where: { archivedAt: null, category: { not: "general" } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, exhibitorBusinessId: true, name: true, category: true, reviewStatus: true,
          rejectionReason: true, submittedAt: true, reviewedAt: true, createdAt: true,
          reviewedByUser: { select: { id: true, fullName: true, email: true } },
        },
      },
    },
  });
  if (!business) return res.status(404).json({ error: "Exhibitor not found" });
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.json({ business });
});

router.get("/:id/kyc-documents/:documentId/download", async (req, res) => {
  const document = await prisma.document.findFirst({
    where: {
      id: req.params.documentId,
      exhibitorBusinessId: req.params.id,
      archivedAt: null,
      category: { not: "general" },
    },
    select: { id: true, name: true, fileUrl: true },
  });
  if (!document) return res.status(404).json({ error: "KYC document not found" });
  try {
    const object = document.fileUrl.startsWith("s3://") || document.fileUrl.startsWith("local://") ? await getStoredObject(document.fileUrl) : await (async () => { const filename = path.basename(new URL(document.fileUrl).pathname); return { body: await fs.promises.readFile(resolveLocalUploadPath(path.join("exhibitor-documents", filename))), contentType: undefined as string | undefined }; })();
    const safeName = document.name.replace(/[\\/"\r\n]/g, "_").slice(0, 180) || "kyc-document";
    const contentType = object.contentType && ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(object.contentType.split(";")[0].toLowerCase())
      ? object.contentType.split(";")[0].toLowerCase()
      : "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(object.body.length));
    res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    return res.send(object.body);
  } catch {
    return res.status(404).json({ error: "KYC document file is unavailable" });
  }
});

const reviewSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve") }),
  z.object({ decision: z.literal("reject"), reason: z.string().trim().min(5).max(1000) }),
]);

router.patch("/:id/kyc-documents/:documentId/review", platformAdminMutationRateLimit, async (req, res) => {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "exhibitor_businesses" WHERE "id" = ${req.params.id} FOR UPDATE`;
    const document = await tx.document.findFirst({
      where: {
        id: req.params.documentId,
        exhibitorBusinessId: req.params.id,
        archivedAt: null,
        category: { not: "general" },
      },
    });
    if (!document) return { error: "KYC document not found" as const };
    if (document.reviewStatus !== "pending_review") {
      return { error: "Only documents pending review can be approved or rejected" as const };
    }

    const reviewedAt = new Date();
    const changed = await tx.document.updateMany({
      where: { id: document.id, exhibitorBusinessId: req.params.id, archivedAt: null, reviewStatus: "pending_review" },
      data: {
        reviewStatus: parsed.data.decision === "approve" ? "approved" : "rejected",
        reviewedByUserId: req.user!.id,
        reviewedAt,
        rejectionReason: parsed.data.decision === "reject" ? parsed.data.reason : null,
      },
    });
    if (changed.count !== 1) return { error: "KYC document was already reviewed; refresh and try again" as const };
    const updatedDocument = await tx.document.findUniqueOrThrow({
      where: { id: document.id },
      select: { id: true, reviewStatus: true, rejectionReason: true, reviewedAt: true },
    });

    const activeDocuments = await tx.document.findMany({
      where: { exhibitorBusinessId: req.params.id, archivedAt: null, category: { not: "general" } },
      select: { reviewStatus: true },
    });
    const aggregateStatus = activeDocuments.some((item) => item.reviewStatus === "rejected")
      ? "resubmission_required"
      : activeDocuments.length > 0 && activeDocuments.every((item) => item.reviewStatus === "approved")
        ? "verified"
        : "under_review";
    const business = await tx.exhibitorBusiness.update({
      where: { id: req.params.id },
      data: {
        kycWorkflowStatus: aggregateStatus,
        kycStatus: aggregateStatus === "verified" ? "verified" : "pending",
      },
      select: { id: true, kycWorkflowStatus: true, kycStatus: true },
    });
    return { document: updatedDocument, business };
  });

  if ("error" in result) {
    const status = result.error === "KYC document not found" ? 404 : 409;
    return res.status(status).json({ error: result.error });
  }

  await logAudit({
    actorUserId: req.user!.id,
    action: parsed.data.decision === "approve" ? "platform.exhibitor_kyc_document_approved" : "platform.exhibitor_kyc_document_rejected",
    entityType: "Document",
    entityId: result.document.id,
    metadata: {
      exhibitorBusinessId: result.business.id,
      decision: parsed.data.decision,
      reason: parsed.data.decision === "reject" ? parsed.data.reason : null,
      aggregateStatus: result.business.kycWorkflowStatus,
    },
  });
  const notificationType = parsed.data.decision === "reject"
    ? "EXHIBITOR_KYC_RESUBMISSION_REQUIRED"
    : result.business.kycWorkflowStatus === "verified" ? "EXHIBITOR_KYC_VERIFIED" : null;
  if (notificationType) {
    const idempotencyKey = `exhibitor-kyc:${notificationType}:${result.business.id}:${result.document.id}`;
    try {
      await enqueueNotificationIntent({
        eventKey: idempotencyKey,
        idempotencyKey,
        eventType: notificationType,
        entityType: "ExhibitorBusiness",
        entityId: result.business.id,
        actorUserId: req.user!.id,
        payload: {
          title: notificationType === "EXHIBITOR_KYC_VERIFIED" ? "Exhibitor KYC verified" : "KYC documents need attention",
          message: notificationType === "EXHIBITOR_KYC_VERIFIED" ? "Your submitted KYC documents have been approved." : "A KYC document was rejected. Review the feedback and submit a replacement.",
          actionUrl: "/exhibitor-dashboard/documents",
        },
      });
    } catch (error) {
      await logAudit({
        actorUserId: req.user!.id,
        action: "platform.exhibitor_kyc_notification_enqueue_failed",
        entityType: "ExhibitorBusiness",
        entityId: result.business.id,
        metadata: { notificationType, error: error instanceof Error ? error.message : String(error) },
      });
    }
  }
  res.json(result);
});

export default router;
