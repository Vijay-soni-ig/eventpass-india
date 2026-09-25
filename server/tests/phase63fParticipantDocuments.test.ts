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
