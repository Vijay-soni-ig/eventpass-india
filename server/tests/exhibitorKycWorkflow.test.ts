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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "platform.admin@eventpass.test", password: "DevPassword123!" }),
  });
  const admin = await adminResponse.json() as { token: string };
  assert.ok(admin.token);
  adminToken = admin.token;

  const signupResponse = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

async function uploadKycDocument(name: string) {
  const form = new FormData();
  form.append("file", new Blob(["%PDF-1.7\nKYC test document"], { type: "application/pdf" }), name);
  form.append("name", name);
  form.append("category", "gst_certificate");
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

  const queue = await fetch(baseUrl + "/api/platform/exhibitors/review-queue?search=KYC%20Workflow", {
    headers: { Authorization: "Bearer " + adminToken },
  });
  assert.equal(queue.status, 200);
  const queueBody = await queue.json() as { businesses: Array<{ id: string }> };
  assert.equal(queueBody.businesses.some((item) => item.id === businessId), true);

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
  assert.equal((await prisma.exhibitorBusiness.findUniqueOrThrow({ where: { id: businessId } })).kycWorkflowStatus, "resubmission_required");

  const archived = await fetch(baseUrl + "/api/documents/" + first.id, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + exhibitorToken },
  });
  assert.equal(archived.status, 204);
  const replacement = await uploadKycDocument("gst-replacement.pdf");
  const resubmit = await fetch(baseUrl + "/api/documents/kyc/submit", {
    method: "POST",
    headers: { Authorization: "Bearer " + exhibitorToken, "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(resubmit.status, 200, await resubmit.clone().text());

  const approve = await fetch(baseUrl + "/api/platform/exhibitors/" + businessId + "/kyc-documents/" + replacement.id + "/review", {
    method: "PATCH",
    headers: { Authorization: "Bearer " + adminToken, "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "approve" }),
  });
  assert.equal(approve.status, 200, await approve.clone().text());
  const finalBusiness = await prisma.exhibitorBusiness.findUniqueOrThrow({ where: { id: businessId } });
  assert.equal(finalBusiness.kycWorkflowStatus, "verified");
  assert.equal(finalBusiness.kycStatus, "verified");

  const finalAudit = await prisma.auditLog.findMany({
    where: { entityType: "Document", entityId: { in: [first.id, replacement.id] } },
  });
  assert.equal(finalAudit.some((row) => row.action === "platform.exhibitor_kyc_document_rejected"), true);
  assert.equal(finalAudit.some((row) => row.action === "platform.exhibitor_kyc_document_approved"), true);
});
