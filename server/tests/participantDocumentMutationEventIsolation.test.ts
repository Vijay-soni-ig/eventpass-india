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

async function signup(label = "owner") {
  const email = `participant-document-isolation-${label}-${ts}@example.com`;
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `participant-document-isolation-${label}-${ts}` },
    body: JSON.stringify({
      email,
      password: "TestPassword123!",
      fullName: `Participant Document Isolation ${label}`,
      userType: "organizer",
    }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  return { token: body.token as string, userId: (await prisma.user.findFirstOrThrow({ where: { email } })).id };
}

async function createEvent(token: string, label: string) {
  const res = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: `Participant Document Isolation ${label} ${ts}`,
      status: "PUBLISHED",
      visibility: "public",
      city: "Ahmedabad",
      venue: "Isolation Hall",
      startDate: "2027-11-01",
      endDate: "2027-11-02",
      modules: ["PARTICIPANTS"],
    }),
  });
  assert.equal(res.status, 201);
  return (await res.json()).event.id as string;
}

test("participant document mutations remain event-scoped for the same organizer", async () => {
  const { token, userId } = await signup();
  const eventA = await createEvent(token, "A");
  const eventB = await createEvent(token, "B");

  const participant = await prisma.eventParticipant.create({
    data: { eventId: eventA, participantType: "SPEAKER", name: "Event A Speaker", isPublic: true },
  });
  const document = await prisma.eventParticipantDocument.create({
    data: {
      participantId: participant.id,
      name: "Event A Agreement",
      kind: "AGREEMENT",
      description: "Event A document",
      fileUrl: "private://participant-documents/event-a-agreement.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 1024,
      uploadedByUserId: userId,
    },
  });

  const headers = { Authorization: `Bearer ${token}` };

  // A participant ID from Event A must be rejected before multer writes a file for Event B.
  const uploadDir = path.join(process.cwd(), "uploads", "participant-documents");
  const filesBefore = new Set(await fs.readdir(uploadDir));
  const form = new FormData();
  form.append("name", "Unauthorized Agreement");
  form.append("kind", "AGREEMENT");
  form.append("file", new Blob(["%PDF-1.4\\nunauthorized"]), "unauthorized.pdf");
  const deniedUpload = await fetch(`${baseUrl}/api/events/${eventB}/participants/${participant.id}/documents`, {
    method: "POST", headers, body: form,
  });
  assert.equal(deniedUpload.status, 404, "upload must reject a participant outside the requested event");
  const filesAfter = new Set(await fs.readdir(uploadDir));
  assert.deepEqual([...filesAfter].filter((name) => !filesBefore.has(name)), [], "unauthorized upload must not leave an orphaned file");

  // A different organizer must be rejected before the private document upload middleware persists a file.
  const attacker = await signup("attacker");
  await createEvent(attacker.token, "attacker"); // Ensure this is an active organizer, not merely an unrelated account.
  const filesBeforeCrossTenant = new Set(await fs.readdir(uploadDir));
  const crossTenantForm = new FormData();
  crossTenantForm.append("name", "Cross-tenant Agreement");
  crossTenantForm.append("kind", "AGREEMENT");
  crossTenantForm.append("file", new Blob(["%PDF-1.4\\nunauthorized"]), "cross-tenant.pdf");
  const crossTenantUpload = await fetch(`${baseUrl}/api/events/${eventA}/participants/${participant.id}/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${attacker.token}` },
    body: crossTenantForm,
  });
  assert.equal(crossTenantUpload.status, 404, "another organizer must not upload documents to this event");
  const filesAfterCrossTenant = new Set(await fs.readdir(uploadDir));
  assert.deepEqual(
    [...filesAfterCrossTenant].filter((name) => !filesBeforeCrossTenant.has(name)),
    [],
    "cross-organizer upload must be rejected before creating an orphaned file",
  );
  assert.equal(
    await prisma.eventParticipantDocument.count({ where: { participantId: participant.id, name: "Cross-tenant Agreement" } }),
    0,
    "cross-organizer upload must not create a document record",
  );

  const crossTenantDownload = await fetch(
    `${baseUrl}/api/events/${eventA}/participants/${participant.id}/documents/${document.id}/download`,
    { headers: { Authorization: `Bearer ${attacker.token}` } },
  );
  assert.equal(crossTenantDownload.status, 404, "another organizer must not download private participant documents");

  const download = await fetch(
    `${baseUrl}/api/events/${eventB}/participants/${participant.id}/documents/${document.id}/download`,
    { headers },
  );
  assert.equal(download.status, 404, "document download must not cross event boundaries");

  const remove = await fetch(
    `${baseUrl}/api/events/${eventB}/participants/${participant.id}/documents/${document.id}`,
    { method: "DELETE", headers },
  );
  assert.equal(remove.status, 404, "document deletion must not cross event boundaries");

  const restore = await fetch(
    `${baseUrl}/api/events/${eventB}/participants/${participant.id}/documents/${document.id}/restore`,
    { method: "POST", headers },
  );
  assert.equal(restore.status, 404, "document restore must not cross event boundaries");

  // Disabled module access must be rejected before Multer persists any bytes.
  const participantB = await prisma.eventParticipant.create({
    data: { eventId: eventB, participantType: "SPEAKER", name: "Event B Speaker", isPublic: true },
  });
  await prisma.eventModuleEnablement.update({
    where: { eventId_moduleType: { eventId: eventB, moduleType: "PARTICIPANTS" } },
    data: { enabled: false },
  });
  const filesBeforeDisabledModuleUpload = new Set(await fs.readdir(uploadDir));
  const disabledModuleForm = new FormData();
  disabledModuleForm.append("name", "Disabled Module Agreement");
  disabledModuleForm.append("kind", "AGREEMENT");
  disabledModuleForm.append("file", new Blob(["%PDF-1.4\\ndisabled module"], { type: "application/pdf" }), "disabled-module.pdf");
  const disabledModuleUpload = await fetch(
    `${baseUrl}/api/events/${eventB}/participants/${participantB.id}/documents`,
    { method: "POST", headers, body: disabledModuleForm },
  );
  assert.equal(disabledModuleUpload.status, 409, "disabled PARTICIPANTS module must reject uploads");
  const filesAfterDisabledModuleUpload = new Set(await fs.readdir(uploadDir));
  assert.deepEqual(
    [...filesAfterDisabledModuleUpload].filter((name) => !filesBeforeDisabledModuleUpload.has(name)),
    [],
    "disabled module upload must be rejected before Multer writes file bytes",
  );
  assert.equal(
    await prisma.eventParticipantDocument.count({ where: { participantId: participantB.id, name: "Disabled Module Agreement" } }),
    0,
    "disabled module upload must not create a document record",
  );

  const unchanged = await prisma.eventParticipantDocument.findUniqueOrThrow({ where: { id: document.id } });
  assert.equal(unchanged.archivedAt, null);
  assert.equal(unchanged.name, "Event A Agreement");
});


test("participant document private download revalidates organizer membership under the organizer lock", async () => {
  const owner = await signup("revoked-download");
  const eventId = await createEvent(owner.token, "revoked-download");
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { organizerId: true },
  });
  const participant = await prisma.eventParticipant.create({
    data: { eventId, participantType: "SPEAKER", name: "Revoked Download Speaker", isPublic: true },
  });
  const document = await prisma.eventParticipantDocument.create({
    data: {
      participantId: participant.id,
      name: "Private Agreement",
      kind: "AGREEMENT",
      fileUrl: "private://participant-documents/revoked-download.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 128,
      uploadedByUserId: owner.userId,
    },
  });
  const membership = await prisma.organizerMembership.findFirstOrThrow({
    where: { organizerId: event.organizerId, userId: owner.userId, status: "active" },
  });

  const client = prisma as unknown as { $transaction: typeof prisma.$transaction };
  const originalTransaction = client.$transaction;
  try {
    client.$transaction = (async (...args: unknown[]) => {
      // Revoke after the authenticated request reaches the locked route
      // operation but before its transaction performs authorization.
      await prisma.organizerMembership.delete({ where: { id: membership.id } });
      return (originalTransaction as (...inner: unknown[]) => Promise<unknown>).apply(prisma, args);
    }) as typeof prisma.$transaction;

    const response = await fetch(
      `${baseUrl}/api/events/${eventId}/participants/${participant.id}/documents/${document.id}/download`,
      { headers: { Authorization: `Bearer ${owner.token}` } },
    );
    assert.equal(response.status, 404, "revoked membership must not read a private participant document");
  } finally {
    client.$transaction = originalTransaction;
  }
});

test("participant document archive revalidates update permission under the organizer lock", async () => {
  const owner = await signup("revoked-archive");
  const eventId = await createEvent(owner.token, "revoked-archive");
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { organizerId: true },
  });
  const participant = await prisma.eventParticipant.create({
    data: { eventId, participantType: "SPEAKER", name: "Revoked Archive Speaker", isPublic: true },
  });
  const document = await prisma.eventParticipantDocument.create({
    data: {
      participantId: participant.id,
      name: "Protected Agreement",
      kind: "AGREEMENT",
      fileUrl: "private://participant-documents/revoked-archive.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 128,
      uploadedByUserId: owner.userId,
    },
  });
  const membership = await prisma.organizerMembership.findFirstOrThrow({
    where: { organizerId: event.organizerId, userId: owner.userId, status: "active" },
  });

  const client = prisma as unknown as { $transaction: typeof prisma.$transaction };
  const originalTransaction = client.$transaction;
  try {
    client.$transaction = (async (...args: unknown[]) => {
      await prisma.organizerMembership.delete({ where: { id: membership.id } });
      return (originalTransaction as (...inner: unknown[]) => Promise<unknown>).apply(prisma, args);
    }) as typeof prisma.$transaction;

    const response = await fetch(
      `${baseUrl}/api/events/${eventId}/participants/${participant.id}/documents/${document.id}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${owner.token}` } },
    );
    assert.equal(response.status, 404, "revoked membership must not archive a participant document");
  } finally {
    client.$transaction = originalTransaction;
  }

  const unchanged = await prisma.eventParticipantDocument.findUniqueOrThrow({ where: { id: document.id } });
  assert.equal(unchanged.archivedAt, null, "revoked request must not change the document");
});


test("participant document upload removes the stored object when membership is revoked after upload preflight", async () => {
  const owner = await signup("revoked-upload");
  const eventId = await createEvent(owner.token, "revoked-upload");
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { organizerId: true },
  });
  const participant = await prisma.eventParticipant.create({
    data: { eventId, participantType: "SPEAKER", name: "Revoked Upload Speaker", isPublic: true },
  });
  const membership = await prisma.organizerMembership.findFirstOrThrow({
    where: { organizerId: event.organizerId, userId: owner.userId, status: "active" },
  });

  const uploadDir = path.join(process.cwd(), "uploads", "participant-documents");
  const filesBefore = new Set(await fs.readdir(uploadDir));
  const client = prisma as unknown as { $transaction: typeof prisma.$transaction };
  const originalTransaction = client.$transaction;
  let transactionCount = 0;
  try {
    client.$transaction = (async (...args: unknown[]) => {
      transactionCount += 1;
      if (transactionCount === 2) {
        // The first locked transaction is upload preflight. Revoke after the
        // object is uploaded but before the post-upload persistence transaction.
        await prisma.organizerMembership.delete({ where: { id: membership.id } });
      }
      return (originalTransaction as (...inner: unknown[]) => Promise<unknown>).apply(prisma, args);
    }) as typeof prisma.$transaction;

    const form = new FormData();
    form.append("name", "Revoked Upload Agreement");
    form.append("kind", "AGREEMENT");
    form.append("file", new Blob(["%PDF-1.4\\nrevoked upload"], { type: "application/pdf" }), "revoked-upload.pdf");
    const response = await fetch(
      `${baseUrl}/api/events/${eventId}/participants/${participant.id}/documents`,
      { method: "POST", headers: { Authorization: `Bearer ${owner.token}` }, body: form },
    );
    assert.equal(response.status, 404, "membership revoked after upload must deny document persistence");
  } finally {
    client.$transaction = originalTransaction;
  }

  assert.equal(transactionCount, 2, "upload should perform preflight and post-upload locked authorization");
  const filesAfter = new Set(await fs.readdir(uploadDir));
  assert.deepEqual(
    [...filesAfter].filter((name) => !filesBefore.has(name)),
    [],
    "revoked post-upload request must remove the stored object",
  );
  assert.equal(
    await prisma.eventParticipantDocument.count({ where: { participantId: participant.id, name: "Revoked Upload Agreement" } }),
    0,
    "revoked post-upload request must not create a document record",
  );
});


test("participant document archive revalidates update permission after an organizer role downgrade", async () => {
  const owner = await signup("role-downgrade-archive");
  const eventId = await createEvent(owner.token, "role-downgrade-archive");
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { organizerId: true },
  });
  const participant = await prisma.eventParticipant.create({
    data: { eventId, participantType: "SPEAKER", name: "Role Downgrade Document", isPublic: true },
  });
  const document = await prisma.eventParticipantDocument.create({
    data: {
      participantId: participant.id,
      name: "Role Downgrade Agreement",
      kind: "AGREEMENT",
      fileUrl: `private://participant-documents/role-downgrade-${ts}.pdf`,
      mimeType: "application/pdf",
      fileSizeBytes: 128,
      uploadedByUserId: owner.userId,
    },
  });
  const membership = await prisma.organizerMembership.findFirstOrThrow({
    where: { organizerId: event.organizerId, userId: owner.userId, status: "active" },
  });

  const client = prisma as unknown as { $transaction: typeof prisma.$transaction };
  const originalTransaction = client.$transaction;
  try {
    client.$transaction = (async (...args: unknown[]) => {
      // Marketing retains event:view but does not have event:update. Change the
      // role immediately before the protected transaction revalidates access.
      await prisma.organizerMembership.update({
        where: { id: membership.id },
        data: { role: "marketing" },
      });
      return (originalTransaction as (...inner: unknown[]) => Promise<unknown>).apply(prisma, args);
    }) as typeof client.$transaction;

    const response = await fetch(
      `${baseUrl}/api/events/${eventId}/participants/${participant.id}/documents/${document.id}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${owner.token}` } },
    );
    assert.equal(response.status, 404, "a downgraded member without event:update must not archive documents");
  } finally {
    client.$transaction = originalTransaction;
  }

  const unchanged = await prisma.eventParticipantDocument.findUniqueOrThrow({ where: { id: document.id } });
  assert.equal(unchanged.archivedAt, null, "role downgrade must leave the document unchanged");
});


test("private participant document download serializes behind concurrent organizer membership revocation", async () => {
  const owner = await signup("concurrent-revoked-download");
  const eventId = await createEvent(owner.token, "concurrent-revoked-download");
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { organizerId: true } });
  const participant = await prisma.eventParticipant.create({
    data: { eventId, participantType: "SPEAKER", name: "Concurrent Revocation Speaker", isPublic: true },
  });
  const document = await prisma.eventParticipantDocument.create({
    data: {
      participantId: participant.id,
      name: "Concurrent Private Agreement",
      kind: "AGREEMENT",
      fileUrl: `private://participant-documents/concurrent-revocation-${ts}.pdf`,
      mimeType: "application/pdf",
      fileSizeBytes: 128,
      uploadedByUserId: owner.userId,
    },
  });
  const membership = await prisma.organizerMembership.findFirstOrThrow({
    where: { organizerId: event.organizerId, userId: owner.userId, status: "active" },
  });

  const held = await holdOrganizerMembershipChange(event.organizerId, membership.id, "revoke");
  const responsePromise = fetch(
    `${baseUrl}/api/events/${eventId}/participants/${participant.id}/documents/${document.id}/download`,
    { headers: { Authorization: `Bearer ${owner.token}` } },
  );
  try {
    await waitForBlockedOrganizerAccess(held.blockerPid);
  } finally {
    held.release();
    await held.transaction;
  }

  const response = await responsePromise;
  assert.equal(response.status, 404, await response.text());
  const body = await response.json();
  assert.equal(body.error, "Event not found",
    "the request must be denied at the locked membership check before private object storage is read");
});
