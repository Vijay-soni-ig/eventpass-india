import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await stop();
});

async function signup(label: string) {
  const res = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "documents-" + label },
    body: JSON.stringify({
      email: "documents-" + label + "-" + ts + "@example.com",
      password: "TestPassword123!",
      fullName: "Document " + label,
      userType: "exhibitor",
    }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.ok(body.token);

  // Exhibitor business records are provisioned by the onboarding flow, not signup.
  const onboarding = await fetch(baseUrl + "/api/onboarding", {
    headers: { Authorization: "Bearer " + body.token },
  });
  assert.equal(onboarding.status, 200);

  return { token: body.token as string, userId: body.user.id as string };
}

test("document tenant isolation: another exhibitor cannot list, download, or delete documents", async () => {
  const a = await signup("owner");
  const b = await signup("other");

  const ownerBusiness = await prisma.exhibitorBusiness.findUnique({ where: { ownerId: a.userId } });
  const otherBusiness = await prisma.exhibitorBusiness.findUnique({ where: { ownerId: b.userId } });
  assert.ok(ownerBusiness);
  assert.ok(otherBusiness);
  assert.notEqual(ownerBusiness.id, otherBusiness.id);

  const document = await prisma.document.create({
    data: {
      exhibitorBusinessId: ownerBusiness.id,
      uploadedByUserId: a.userId,
      name: "tenant-secret.pdf",
      fileUrl: "local://exhibitor-documents/tenant-secret.pdf",
    },
  });

  const ownerList = await fetch(baseUrl + "/api/documents", {
    headers: { Authorization: "Bearer " + a.token },
  });
  assert.equal(ownerList.status, 200);
  assert.equal((await ownerList.json()).documents.some((item: { id: string }) => item.id === document.id), true);

  const otherList = await fetch(baseUrl + "/api/documents", {
    headers: { Authorization: "Bearer " + b.token },
  });
  assert.equal(otherList.status, 200);
  assert.equal((await otherList.json()).documents.some((item: { id: string }) => item.id === document.id), false);

  const crossDownload = await fetch(baseUrl + "/api/documents/" + document.id + "/download", {
    headers: { Authorization: "Bearer " + b.token },
  });
  assert.equal(crossDownload.status, 404);

  const crossDelete = await fetch(baseUrl + "/api/documents/" + document.id, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + b.token },
  });
  assert.equal(crossDelete.status, 404);

  const stillExists = await prisma.document.findUnique({ where: { id: document.id } });
  assert.ok(stillExists);
  assert.equal(stillExists.exhibitorBusinessId, ownerBusiness.id);

  await prisma.document.delete({ where: { id: document.id } });
});


test("multi-business document uploads require an explicit authorized target before file processing", async () => {
  const owner = await signup("multi-business");
  const firstBusiness = await prisma.exhibitorBusiness.findUniqueOrThrow({ where: { ownerId: owner.userId } });
  // Business ownerId is unique: use a separately provisioned business, then
  // grant the primary user an active membership to exercise multi-tenant scope.
  const secondBusinessOwner = await signup("second-business-owner");
  const secondBusiness = await prisma.exhibitorBusiness.findUniqueOrThrow({
    where: { ownerId: secondBusinessOwner.userId },
  });
  await prisma.exhibitorMembership.create({
    data: {
      exhibitorBusinessId: secondBusiness.id,
      userId: owner.userId,
      invitedEmail: "documents-multi-business-" + ts + "@example.com",
      role: "owner",
      status: "active",
    },
  });

  const missingTarget = await fetch(baseUrl + "/api/documents", {
    method: "POST",
    headers: { Authorization: "Bearer " + owner.token },
  });
  assert.equal(missingTarget.status, 400);
  assert.match((await missingTarget.json()).error, /X-Exhibitor-Business-Id is required/);

  const uploadDir = path.join(process.cwd(), "uploads", "exhibitor-documents");
  await fs.mkdir(uploadDir, { recursive: true });
  const filesBeforeUnauthorizedUpload = new Set(await fs.readdir(uploadDir));
  const unauthorizedForm = new FormData();
  unauthorizedForm.append(
    "file",
    new Blob(["%PDF-1.7\\nunauthorized upload payload"], { type: "application/pdf" }),
    "unauthorized.pdf",
  );
  const unauthorizedTarget = await fetch(baseUrl + "/api/documents", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + owner.token,
      "X-Exhibitor-Business-Id": "not-a-business-the-user-can-manage",
    },
    body: unauthorizedForm,
  });
  assert.equal(unauthorizedTarget.status, 404);
  const filesAfterUnauthorizedUpload = new Set(await fs.readdir(uploadDir));
  assert.deepEqual(
    [...filesAfterUnauthorizedUpload].filter((name) => !filesBeforeUnauthorizedUpload.has(name)),
    [],
    "unauthorized upload must be rejected before Multer writes file bytes",
  );

  const authorizedTarget = await fetch(baseUrl + "/api/documents", {
    method: "POST",
    headers: { Authorization: "Bearer " + owner.token, "X-Exhibitor-Business-Id": secondBusiness.id },
  });
  assert.equal(authorizedTarget.status, 400, "authorized scope passes the guard and then correctly reports the missing file");
  assert.match((await authorizedTarget.json()).error, /No file uploaded/);

  assert.notEqual(firstBusiness.id, secondBusiness.id);
  await prisma.exhibitorMembership.deleteMany({ where: { exhibitorBusinessId: secondBusiness.id } });
  await prisma.exhibitorBusiness.delete({ where: { id: secondBusiness.id } });
});


test("failed document database creation removes the persisted upload", async () => {
  const owner = await signup("create-failure-cleanup");
  const uploadDir = path.join(process.cwd(), "uploads", "exhibitor-documents");
  await fs.mkdir(uploadDir, { recursive: true });
  const filesBefore = new Set(await fs.readdir(uploadDir));

  const documentDelegate = prisma.document as unknown as {
    create: typeof prisma.document.create;
  };
  const originalCreate = documentDelegate.create;
  documentDelegate.create = (async () => {
    throw new Error("simulated document persistence failure");
  }) as typeof documentDelegate.create;

  let response: Response;
  try {
    const form = new FormData();
    form.append(
      "file",
      new Blob(["%PDF-1.7\\nvalid test payload"], { type: "application/pdf" }),
      "persistence-failure.pdf",
    );
    response = await fetch(baseUrl + "/api/documents", {
      method: "POST",
      headers: { Authorization: "Bearer " + owner.token },
      body: form,
    });
  } finally {
    documentDelegate.create = originalCreate;
  }

  assert.notEqual(response!.status, 201, "failed persistence must not report a successful upload");
  const filesAfter = new Set(await fs.readdir(uploadDir));
  assert.deepEqual(
    [...filesAfter].filter((name) => !filesBefore.has(name)),
    [],
    "failed document persistence must not leave an orphaned upload",
  );
});
