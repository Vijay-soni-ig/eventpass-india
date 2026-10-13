import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => { ({ baseUrl, stop } = await startTestServer()); });
after(async () => { await stop(); });

async function signup(label: string) {
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `participant-doc-${label}` },
    body: JSON.stringify({ email: `participant-doc-${label}-${ts}@example.com`, password: "TestPassword123!", fullName: `Participant Doc ${label}`, userType: "organizer" }),
  });
  const body = await res.json();
  return { token: body.token as string };
}

async function bootstrap(label: string) {
  const { token } = await signup(label);
  const eventRes = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      eventType: "CONFERENCE", title: `Document Event ${label} ${ts}`, status: "PUBLISHED",
      visibility: "public", city: "Ahmedabad", venue: "Document Hall",
      startDate: "2027-07-01", endDate: "2027-07-02", modules: ["PARTICIPANTS"],
    }),
  });
  const body = await eventRes.json();
  const participant = await prisma.eventParticipant.create({
    data: { eventId: body.event.id, participantType: "SPEAKER", name: `Speaker ${label}`, isPublic: true },
  });
  return { token, eventId: body.event.id as string, participantId: participant.id };
}

function pdfBlob() {
  return new Blob(["%PDF-1.4\n%test participant document\n"], { type: "application/pdf" });
}

test("6.3F participant documents: private upload/list/download lifecycle and archive/restore", async () => {
  const ctx = await bootstrap("lifecycle");
  const form = new FormData();
  form.append("name", "Speaker Agreement");
  form.append("kind", "AGREEMENT");
  form.append("description", "Signed agreement");
  form.append("file", pdfBlob(), "agreement.pdf");

  const uploaded = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/documents`, {
    method: "POST", headers: { Authorization: `Bearer ${ctx.token}` }, body: form,
  });
  assert.equal(uploaded.status, 201);
  const uploadedBody = await uploaded.json();
  assert.equal(uploadedBody.document.name, "Speaker Agreement");
  assert.equal(uploadedBody.document.kind, "AGREEMENT");

  // Archived participants must not permit document mutations through nested routes.
  await prisma.eventParticipant.update({ where: { id: ctx.participantId }, data: { archivedAt: new Date() } });
  const deleteForArchivedParticipant = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/documents/${uploadedBody.document.id}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${ctx.token}` },
  });
  assert.equal(deleteForArchivedParticipant.status, 409);
  const restoreForArchivedParticipant = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/documents/${uploadedBody.document.id}/restore`, {
    method: "POST", headers: { Authorization: `Bearer ${ctx.token}` },
  });
  assert.equal(restoreForArchivedParticipant.status, 409);
  await prisma.eventParticipant.update({ where: { id: ctx.participantId }, data: { archivedAt: null } });

  const list = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/documents`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).documents.length, 1);

  const download = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/documents/${uploadedBody.document.id}/download`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-type"), "application/pdf");

  const archive = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/documents/${uploadedBody.document.id}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${ctx.token}` },
  });
  assert.equal(archive.status, 204);

  const hidden = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/documents`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  assert.equal((await hidden.json()).documents.length, 0);

  const restore = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/documents/${uploadedBody.document.id}/restore`, {
    method: "POST", headers: { Authorization: `Bearer ${ctx.token}` },
  });
  assert.equal(restore.status, 200);

  const other = await signup("other");
  const cross = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/documents`, {
    headers: { Authorization: `Bearer ${other.token}` },
  });
  assert.equal(cross.status, 404);
});

test("6.3F participant documents: invalid type and invalid metadata are rejected", async () => {
  const ctx = await bootstrap("validation");
  const form = new FormData();
  form.append("name", "Bad file");
  form.append("kind", "AGREEMENT");
  form.append("file", new Blob(["not a pdf"], { type: "text/plain" }), "bad.txt");
  const badFile = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/documents`, {
    method: "POST", headers: { Authorization: `Bearer ${ctx.token}` }, body: form,
  });
  assert.equal(badFile.status, 400);

  const form2 = new FormData();
  form2.append("name", "");
  form2.append("kind", "NOPE");
  form2.append("file", pdfBlob(), "agreement.pdf");
  const badMetadata = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/documents`, {
    method: "POST", headers: { Authorization: `Bearer ${ctx.token}` }, body: form2,
  });
  assert.equal(badMetadata.status, 400);
});


test("participant media mutations are blocked when the parent participant is archived", async () => {
  const ctx = await bootstrap("archived-media");
  const media = await prisma.eventParticipantMedia.create({
    data: {
      participantId: ctx.participantId,
      kind: "GALLERY",
      visibility: "PUBLIC",
      fileUrl: "https://example.com/test-media.png",
      mimeType: "image/png",
      fileSizeBytes: 8,
      uploadedByUserId: null,
    },
  });
  await prisma.eventParticipant.update({ where: { id: ctx.participantId }, data: { archivedAt: new Date() } });

  const headers = { Authorization: `Bearer ${ctx.token}`, "Content-Type": "application/json" };
  const reorder = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/media/reorder`, {
    method: "PATCH", headers, body: JSON.stringify({ items: [{ id: media.id, sortOrder: 2 }] }),
  });
  assert.equal(reorder.status, 409);

  const update = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/media/${media.id}`, {
    method: "PATCH", headers, body: JSON.stringify({ caption: "Should not update" }),
  });
  assert.equal(update.status, 409);

  const archive = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/media/${media.id}`, {
    method: "DELETE", headers,
  });
  assert.equal(archive.status, 409);

  await prisma.eventParticipantMedia.update({ where: { id: media.id }, data: { archivedAt: new Date(), active: false } });
  const restore = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/media/${media.id}/restore`, {
    method: "POST", headers,
  });
  assert.equal(restore.status, 409);

  const unchanged = await prisma.eventParticipantMedia.findUniqueOrThrow({ where: { id: media.id } });
  assert.equal(unchanged.caption, null);
  assert.ok(unchanged.archivedAt);
  await prisma.eventParticipant.update({ where: { id: ctx.participantId }, data: { archivedAt: null } });
});
