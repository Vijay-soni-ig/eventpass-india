import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { deleteStoredFile } from "../src/lib/storage";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
let adminToken: string;
let exhibitorToken: string;
let exhibitorUserId: string;
let businessId: string;
const uploadedDocumentIds: string[] = [];
const uploadedFileRefs: string[] = [];
const ts = Date.now();

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
  const adminResponse = await fetch(baseUrl + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "kyc-admin-" + ts },
    body: JSON.stringify({ email: "platform.admin@eventpass.test", password: "DevPassword123!" }),
  });
  const admin = await adminResponse.json() as { token: string };
  assert.ok(admin.token);
  adminToken = admin.token;

  const signupResponse = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "kyc-workflow-" + ts },
    body: JSON.stringify({ email: "kyc-workflow-" + ts + "@example.com", password: "TestPassword123!", fullName: "KYC Workflow", userType: "exhibitor" }),
  });
  assert.equal(signupResponse.status, 201);
  const signup = await signupResponse.json() as { token: string; user: { id: string } };
  exhibitorToken = signup.token;
  exhibitorUserId = signup.user.id;
  const onboarding = await fetch(baseUrl + "/api/onboarding", { headers: { Authorization: "Bearer " + exhibitorToken } });
  assert.equal(onboarding.status, 200);
  const business = await prisma.exhibitorBusiness.findUniqueOrThrow({ where: { ownerId: exhibitorUserId } });
  businessId = business.id;
});

after(async () => {
  for (const reference of uploadedFileRefs) await deleteStoredFile(reference).catch(() => undefined);
  if (businessId) await prisma.exhibitorBusiness.deleteMany({ where: { id: businessId } });
  if (exhibitorUserId) await prisma.user.deleteMany({ where: { id: exhibitorUserId } });
  await stop();
});

async function uploadKycDocument(name: string, category: "gst_certificate" | "pan_card" = "gst_certificate") {
  const form = new FormData();
  form.append("file", new Blob(["%PDF-1.7\nKYC test document"], { type: "application/pdf" }), name);
  form.append("name", name);
  form.append("category", category);
  const response = await fetch(baseUrl + "/api/documents", {
    method: "POST",
    headers: { Authorization: "Bearer " + exhibitorToken },
    body: form,
  });
  assert.equal(response.status, 201, await response.clone().text());
  const body = await response.json() as { document: { id: string; fileUrl: string } };
  uploadedDocumentIds.push(body.document.id);
  const document = await prisma.document.findUniqueOrThrow({ where: { id: body.document.id } });
  uploadedFileRefs.push(document.fileUrl);
  return body.document;
}

test("exhibitor KYC requires submission and Super Admin document decisions; rejection can be replaced and resubmitted", async () => {
  const unauthorizedQueue = await fetch(baseUrl + "/api/platform/exhibitors/review-queue", {
    headers: { Authorization: "Bearer " + exhibitorToken },
  });
  assert.equal(unauthorizedQueue.status, 403);

  const first = await uploadKycDocument("gst-original.pdf");
  const second = await uploadKycDocument("pan-card.pdf", "pan_card");
  const firstRecord = await prisma.document.findUniqueOrThrow({ where: { id: first.id } });
  assert.equal(firstRecord.category, "gst_certificate");
  assert.equal(firstRecord.reviewStatus, "not_submitted");

  const submit = await fetch(baseUrl + "/api/documents/kyc/submit", {
    method: "POST",
    headers: { Authorization: "Bearer " + exhibitorToken, "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(submit.status, 200, await submit.clone().text());
  const submittedRecord = await prisma.document.findUniqueOrThrow({ where: { id: first.id } });
  assert.equal(submittedRecord.reviewStatus, "pending_review");
  assert.equal((await prisma.exhibitorBusiness.findUniqueOrThrow({ where: { id: businessId } })).kycWorkflowStatus, "submitted");

  const lateUploadFormBeforeReview = new FormData();
  lateUploadFormBeforeReview.append("file", new Blob(["%PDF-1.7\\nLate before review"], { type: "application/pdf" }), "late-before-review.pdf");
  lateUploadFormBeforeReview.append("name", "late-before-review.pdf");
  lateUploadFormBeforeReview.append("category", "pan_card");
  const lateUploadBeforeReview = await fetch(baseUrl + "/api/documents", {
    method: "POST",
    headers: { Authorization: "Bearer " + exhibitorToken },
    body: lateUploadFormBeforeReview,
  });
  assert.equal(lateUploadBeforeReview.status, 409, await lateUploadBeforeReview.clone().text());

  const queue = await fetch(baseUrl + "/api/platform/exhibitors/review-queue?search=KYC%20Workflow", {
    headers: { Authorization: "Bearer " + adminToken },
  });
  assert.equal(queue.status, 200);
  const queueBody = await queue.json() as { businesses: Array<{ id: string }> };
  assert.equal(queueBody.businesses.some((item) => item.id === businessId), true);

  const earlyDecision = await fetch(baseUrl + "/api/platform/exhibitors/" + businessId + "/kyc-documents/" + first.id + "/review", {
    method: "PATCH",
    headers: { Authorization: "Bearer " + adminToken, "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "approve" }),
  });
  assert.equal(earlyDecision.status, 409, await earlyDecision.clone().text());

  const startReview = await fetch(baseUrl + "/api/platform/exhibitors/" + businessId + "/kyc/start-review", {
    method: "POST",
    headers: { Authorization: "Bearer " + adminToken },
  });
  assert.equal(startReview.status, 200, await startReview.clone().text());
  assert.equal((await prisma.exhibitorBusiness.findUniqueOrThrow({ where: { id: businessId } })).kycWorkflowStatus, "under_review");

  const lateUploadForm = new FormData();
  lateUploadForm.append("file", new Blob(["%PDF-1.7\\nLate upload"], { type: "application/pdf" }), "late-upload.pdf");
  lateUploadForm.append("name", "late-upload.pdf");
  lateUploadForm.append("category", "pan_card");
  const lateUpload = await fetch(baseUrl + "/api/documents", {
    method: "POST",
    headers: { Authorization: "Bearer " + exhibitorToken },
    body: lateUploadForm,
  });
  assert.equal(lateUpload.status, 409, await lateUpload.clone().text());

  const missingReason = await fetch(baseUrl + "/api/platform/exhibitors/" + businessId + "/kyc-documents/" + first.id + "/review", {
    method: "PATCH",
    headers: { Authorization: "Bearer " + adminToken, "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "reject", reason: " " }),
  });
  assert.equal(missingReason.status, 400);

  const reject = await fetch(baseUrl + "/api/platform/exhibitors/" + businessId + "/kyc-documents/" + first.id + "/review", {
    method: "PATCH",
    headers: { Authorization: "Bearer " + adminToken, "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "reject", reason: "GST certificate is not readable" }),
  });
  assert.equal(reject.status, 200, await reject.clone().text());
  assert.equal((await prisma.exhibitorBusiness.findUniqueOrThrow({ where: { id: businessId } })).kycWorkflowStatus, "under_review");
  const earlyResubmissionIntents = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM notification_intents
    WHERE idempotency_key LIKE ${`exhibitor-kyc:EXHIBITOR_KYC_RESUBMISSION_REQUIRED:${businessId}:%`}
  `;
  assert.equal(Number(earlyResubmissionIntents[0].count), 0);

  // A rejection must not close the review while other submitted documents
  // are still awaiting a decision.
  const approveSecond = await fetch(baseUrl + "/api/platform/exhibitors/" + businessId + "/kyc-documents/" + second.id + "/review", {
    method: "PATCH",
    headers: { Authorization: "Bearer " + adminToken, "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "approve" }),
  });
  assert.equal(approveSecond.status, 200, await approveSecond.clone().text());
  assert.equal((await prisma.exhibitorBusiness.findUniqueOrThrow({ where: { id: businessId } })).kycWorkflowStatus, "resubmission_required");
  const finalResubmissionIntents = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM notification_intents
    WHERE idempotency_key LIKE ${`exhibitor-kyc:EXHIBITOR_KYC_RESUBMISSION_REQUIRED:${businessId}:%`}
  `;
  assert.equal(Number(finalResubmissionIntents[0].count), 1);

  const archived = await fetch(baseUrl + "/api/documents/" + first.id, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + exhibitorToken },
  });
  assert.equal(archived.status, 204);
  const restoreRejected = await fetch(baseUrl + "/api/documents/" + first.id + "/restore", {
    method: "POST",
    headers: { Authorization: "Bearer " + exhibitorToken },
  });
  assert.equal(restoreRejected.status, 409, await restoreRejected.clone().text());
  assert.equal((await prisma.document.findUniqueOrThrow({ where: { id: first.id } })).archivedAt instanceof Date, true);

  const replacement = await uploadKycDocument("gst-replacement.pdf");
  const resubmit = await fetch(baseUrl + "/api/documents/kyc/submit", {
    method: "POST",
    headers: { Authorization: "Bearer " + exhibitorToken, "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(resubmit.status, 200, await resubmit.clone().text());

  const startReplacementReview = await fetch(baseUrl + "/api/platform/exhibitors/" + businessId + "/kyc/start-review", {
    method: "POST",
    headers: { Authorization: "Bearer " + adminToken },
  });
  assert.equal(startReplacementReview.status, 200, await startReplacementReview.clone().text());

  const approve = await fetch(baseUrl + "/api/platform/exhibitors/" + businessId + "/kyc-documents/" + replacement.id + "/review", {
    method: "PATCH",
    headers: { Authorization: "Bearer " + adminToken, "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "approve" }),
  });
  assert.equal(approve.status, 200, await approve.clone().text());
  const finalBusiness = await prisma.exhibitorBusiness.findUniqueOrThrow({ where: { id: businessId } });
  assert.equal(finalBusiness.kycWorkflowStatus, "verified");
  assert.equal(finalBusiness.kycStatus, "verified");

  const archiveApproved = await fetch(baseUrl + "/api/documents/" + replacement.id, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + exhibitorToken },
  });
  assert.equal(archiveApproved.status, 409, await archiveApproved.clone().text());

  const finalAudit = await prisma.auditLog.findMany({
    where: { entityType: "Document", entityId: { in: [first.id, replacement.id] } },
  });
  assert.equal(finalAudit.some((row) => row.action === "platform.exhibitor_kyc_document_rejected"), true);
  assert.equal(finalAudit.some((row) => row.action === "platform.exhibitor_kyc_document_approved"), true);
});
