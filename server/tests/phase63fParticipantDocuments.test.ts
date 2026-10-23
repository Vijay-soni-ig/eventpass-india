import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
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
  const listForArchivedParticipant = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/documents`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  assert.equal(listForArchivedParticipant.status, 409, "document metadata must not be returned for an archived participant");
  const downloadForArchivedParticipant = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/documents/${uploadedBody.document.id}/download`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  assert.equal(downloadForArchivedParticipant.status, 409);
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

test("6.3F participant documents: nested resource IDs cannot cross participant boundaries", async () => {
  const ctx = await bootstrap("nested-isolation");
  const documentForm = new FormData();
  documentForm.append("name", "Private agreement");
  documentForm.append("kind", "AGREEMENT");
  documentForm.append("file", pdfBlob(), "private-agreement.pdf");
  const uploaded = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ctx.token}` },
    body: documentForm,
  });
  assert.equal(uploaded.status, 201);
  const document = (await uploaded.json()).document as { id: string };

  const otherParticipant = await prisma.eventParticipant.create({
    data: { eventId: ctx.eventId, participantType: "SPEAKER", name: "Different Speaker", isPublic: true },
  });
  const otherRoot = `${baseUrl}/api/events/${ctx.eventId}/participants/${otherParticipant.id}/documents`;
  const headers = { Authorization: `Bearer ${ctx.token}` };

  const download = await fetch(`${otherRoot}/${document.id}/download`, { headers });
  assert.equal(download.status, 404, "document download must be scoped to the nested participant");

  const archive = await fetch(`${otherRoot}/${document.id}`, { method: "DELETE", headers });
  assert.equal(archive.status, 404, "document archive must be scoped to the nested participant");

  const stored = await prisma.eventParticipantDocument.findUniqueOrThrow({
    where: { id: document.id },
    select: { participantId: true, archivedAt: true },
  });
  assert.equal(stored.participantId, ctx.participantId);
  assert.equal(stored.archivedAt, null, "cross-participant request must not mutate the original document");
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

  const uploadDir = path.join(process.cwd(), "uploads", "participant-documents");
  await fs.mkdir(uploadDir, { recursive: true });
  const filesBeforeInvalidMetadata = new Set(await fs.readdir(uploadDir));

  const form2 = new FormData();
  form2.append("name", "");
  form2.append("kind", "NOPE");
  form2.append("file", pdfBlob(), "agreement.pdf");
  const badMetadata = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/documents`, {
    method: "POST", headers: { Authorization: `Bearer ${ctx.token}` }, body: form2,
  });
  assert.equal(badMetadata.status, 400);
  assert.deepEqual(
    [...(await fs.readdir(uploadDir))].filter(name => !filesBeforeInvalidMetadata.has(name)),
    [],
    "invalid document metadata must not leave the uploaded private file behind",
  );
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


test("6.3F participant documents: disabled PARTICIPANTS blocks download, upload, archive, restore, and listing", async () => {
  const ctx = await bootstrap("module-disabled");
  async function uploadDocument(name: string) {
    const form = new FormData();
    form.append("name", name);
    form.append("kind", "AGREEMENT");
    form.append("file", pdfBlob(), `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`);
    const response = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.token}` },
      body: form,
    });
    const body = await response.json();
    assert.equal(response.status, 201, JSON.stringify(body));
    return body.document as { id: string; name: string };
  }

  const active = await uploadDocument("Active agreement");
  const archived = await uploadDocument("Archived agreement");
  const archiveBeforeDisable = await fetch(
    `${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/documents/${archived.id}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${ctx.token}` } },
  );
  assert.equal(archiveBeforeDisable.status, 204);

  await prisma.eventModuleEnablement.update({
    where: { eventId_moduleType: { eventId: ctx.eventId, moduleType: "PARTICIPANTS" } },
    data: { enabled: false },
  });

  const headers = { Authorization: `Bearer ${ctx.token}` };
  const root = `${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/documents`;
  assert.equal((await fetch(root, { headers })).status, 409, "disabled module must block document listing");
  assert.equal((await fetch(`${root}/${active.id}/download`, { headers })).status, 409, "disabled module must block downloads");

  const remove = await fetch(`${root}/${active.id}`, { method: "DELETE", headers });
  assert.equal(remove.status, 409, "disabled module must block archiving");
  const restore = await fetch(`${root}/${archived.id}/restore`, { method: "POST", headers });
  assert.equal(restore.status, 409, "disabled module must block restoring");

  const form = new FormData();
  form.append("name", "Must not be created");
  form.append("kind", "AGREEMENT");
  form.append("file", pdfBlob(), "blocked.pdf");
  const upload = await fetch(root, { method: "POST", headers, body: form });
  assert.equal(upload.status, 409, "disabled module must block upload");

  const [storedActive, storedArchived, total] = await Promise.all([
    prisma.eventParticipantDocument.findUniqueOrThrow({ where: { id: active.id }, select: { name: true, archivedAt: true } }),
    prisma.eventParticipantDocument.findUniqueOrThrow({ where: { id: archived.id }, select: { name: true, archivedAt: true } }),
    prisma.eventParticipantDocument.count({ where: { participantId: ctx.participantId } }),
  ]);
  assert.deepEqual(storedActive, { name: "Active agreement", archivedAt: null });
  assert.equal(storedArchived.name, "Archived agreement");
  assert.ok(storedArchived.archivedAt, "blocked restore must leave document archived");
  assert.equal(total, 2, "blocked upload must not persist another document");
});
