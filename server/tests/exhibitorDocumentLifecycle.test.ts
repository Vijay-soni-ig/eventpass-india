import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => { ({ baseUrl, stop } = await startTestServer()); });
after(async () => { await stop(); });

test("exhibitor document archive and restore is visible only in the matching lifecycle view", async () => {
  const signup = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "document-lifecycle-" + ts },
    body: JSON.stringify({
      email: "document-lifecycle-" + ts + "@example.com",
      password: "TestPassword123!",
      fullName: "Document Lifecycle",
      userType: "exhibitor",
    }),
  });
  assert.equal(signup.status, 201);
  const account = await signup.json() as { token: string; user: { id: string } };
  const onboarding = await fetch(baseUrl + "/api/onboarding", {
    headers: { Authorization: "Bearer " + account.token },
  });
  assert.equal(onboarding.status, 200);
  const business = await prisma.exhibitorBusiness.findUniqueOrThrow({ where: { ownerId: account.user.id } });
  const document = await prisma.document.create({
    data: {
      exhibitorBusinessId: business.id,
      uploadedByUserId: account.user.id,
      name: "GST certificate",
      fileUrl: "local://exhibitor-documents/lifecycle-" + ts + ".pdf",
    },
  });
  const headers = { Authorization: "Bearer " + account.token };
  try {
    const activeBefore = await fetch(baseUrl + "/api/documents", { headers });
    assert.equal(activeBefore.status, 200);
    assert.equal((await activeBefore.json() as { documents: Array<{ id: string }> }).documents.some((item) => item.id === document.id), true);

    const archive = await fetch(baseUrl + "/api/documents/" + document.id, { method: "DELETE", headers });
    assert.equal(archive.status, 204);

    const activeAfter = await fetch(baseUrl + "/api/documents", { headers });
    assert.equal((await activeAfter.json() as { documents: Array<{ id: string }> }).documents.some((item) => item.id === document.id), false);
    const archived = await fetch(baseUrl + "/api/documents?includeArchived=true", { headers });
    assert.equal(archived.status, 200);
    assert.equal((await archived.json() as { documents: Array<{ id: string; archivedAt: string | null }> }).documents.some((item) => item.id === document.id), true);

    const invalidFilter = await fetch(baseUrl + "/api/documents?includeArchived=maybe", { headers });
    assert.equal(invalidFilter.status, 400);

    const restore = await fetch(baseUrl + "/api/documents/" + document.id + "/restore", { method: "POST", headers });
    assert.equal(restore.status, 200);
    const activeRestored = await fetch(baseUrl + "/api/documents", { headers });
    assert.equal((await activeRestored.json() as { documents: Array<{ id: string }> }).documents.some((item) => item.id === document.id), true);
    const archivedAfter = await fetch(baseUrl + "/api/documents?includeArchived=true", { headers });
    assert.equal((await archivedAfter.json() as { documents: Array<{ id: string }> }).documents.some((item) => item.id === document.id), false);
  } finally {
    await prisma.document.delete({ where: { id: document.id } });
  }
});
