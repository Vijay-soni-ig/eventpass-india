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

  const unchanged = await prisma.eventParticipantDocument.findUniqueOrThrow({ where: { id: document.id } });
  assert.equal(unchanged.archivedAt, null);
  assert.equal(unchanged.name, "Event A Agreement");
});
