import assert from "node:assert/strict";
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
  const email = `media-${label}-${ts}@example.com`;
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `media-${label}` },
    body: JSON.stringify({ email, password: "TestPassword123!", fullName: `Media ${label}`, userType: "exhibitor" }),
  });
  const body = await res.json();
  return { token: body.token as string, userId: body.user.id as string };
}

async function bootstrapEvent(label: string) {
  const { token, userId } = await signup(label);
  const exhibition = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: `Media bootstrap ${label} ${ts}`, status: "draft", visibility: "public", ticketTypes: [], stalls: [] }),
  }).then((r) => r.json());

  const eventRes = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: `Media Event ${label} ${ts}`,
      status: "PUBLISHED",
      visibility: "public",
      city: "Ahmedabad",
      venue: "Media Hall",
      startDate: "2027-06-01",
      endDate: "2027-06-02",
      modules: ["PARTICIPANTS"],
    }),
  });
  const eventBody = await eventRes.json();
  const participant = await prisma.eventParticipant.create({
    data: { eventId: eventBody.event.id, participantType: "SPEAKER", name: `Speaker ${label}`, isPublic: true },
  });
  return { token, userId, organizerId: exhibition.exhibition.organizerId as string, eventId: eventBody.event.id as string, participantId: participant.id };
}

function pngBlob() {
  return new Blob([
    Uint8Array.from([
      0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,
      0x00,0x00,0x00,0x0d,0x49,0x48,0x44,0x52,
      0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,
      0x08,0x06,0x00,0x00,0x00,0x1f,0x15,0xc4,
      0x89,0x00,0x00,0x00,0x0a,0x49,0x44,0x41,0x54,
      0x78,0x9c,0x63,0x00,0x01,0x00,0x00,0x05,0x00,0x01,
      0x0d,0x0a,0x2d,0xb4,0x00,0x00,0x00,0x00,0x49,0x45,0x4e,0x44,0xae,0x42,0x60,0x82,
    ]),
  ], { type: "image/png" });
}

async function upload(token: string, eventId: string, participantId: string, kind: string, visibility = "PUBLIC") {
  const form = new FormData();
  form.append("kind", kind);
  form.append("caption", `${kind} caption`);
  form.append("altText", `${kind} alt`);
  form.append("file", pngBlob(), "participant.png");
  const res = await fetch(
    `${baseUrl}/api/events/${eventId}/participants/${participantId}/media?visibility=${visibility}`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form },
  );
  return { status: res.status, body: await res.json() };
}

test("6.3A media lifecycle: validated upload creates ordered profile/gallery media and profile image updates photoUrl", async () => {
  const ctx = await bootstrapEvent("lifecycle");
  const profile = await upload(ctx.token, ctx.eventId, ctx.participantId, "PROFILE_IMAGE");
  assert.equal(profile.status, 201);
  assert.equal(profile.body.media.kind, "PROFILE_IMAGE");
  assert.equal(profile.body.media.mimeType, "image/png");
  assert.ok(profile.body.media.fileSizeBytes > 0);

  const gallery = await upload(ctx.token, ctx.eventId, ctx.participantId, "GALLERY");
  assert.equal(gallery.status, 201);
  assert.equal(gallery.body.media.sortOrder, profile.body.media.sortOrder + 1);

  const participant = await prisma.eventParticipant.findUniqueOrThrow({ where: { id: ctx.participantId } });
  assert.equal(participant.photoUrl, profile.body.media.fileUrl);

  const list = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/media`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  }).then((r) => r.json());
  assert.equal(list.items.length, 2);
});

test("6.3A media security: private media is never returned by public endpoint and is readable only through authenticated event-scoped access", async () => {
  const ctx = await bootstrapEvent("privacy");
  const privateUpload = await upload(ctx.token, ctx.eventId, ctx.participantId, "GALLERY", "PRIVATE");
  assert.equal(privateUpload.status, 201);
  assert.equal(privateUpload.body.media.visibility, "PRIVATE");
  assert.match(privateUpload.body.media.fileUrl, /^local:\/\/participant-media-private\//);

  const publicRes = await fetch(`${baseUrl}/api/public/events/${ctx.eventId}/participants/${ctx.participantId}/media`);
  assert.equal(publicRes.status, 200);
  const publicBody = await publicRes.json();
  assert.equal(publicBody.items.length, 0);

  const privateFile = await fetch(
    `${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/media/${privateUpload.body.media.id}/file`,
    { headers: { Authorization: `Bearer ${ctx.token}` } },
  );
  assert.equal(privateFile.status, 200);
  assert.equal(privateFile.headers.get("content-type"), "image/png");

  const directPrivateUrl = privateUpload.body.media.fileUrl.replace(/^local:\/\//, "/uploads/");
  const directRes = await fetch(`${baseUrl}${directPrivateUrl}`);
  assert.equal(directRes.status, 404, "private local storage must not be directly served by the static uploads mount");
});

test("6.3A media isolation: another organizer cannot list or mutate participant media", async () => {
  const owner = await bootstrapEvent("owner");
  const other = await bootstrapEvent("other");
  const uploaded = await upload(owner.token, owner.eventId, owner.participantId, "GALLERY");
  assert.equal(uploaded.status, 201);

  const listAsOther = await fetch(
    `${baseUrl}/api/events/${owner.eventId}/participants/${owner.participantId}/media`,
    { headers: { Authorization: `Bearer ${other.token}` } },
  );
  assert.equal(listAsOther.status, 404);

  const deleteAsOther = await fetch(
    `${baseUrl}/api/events/${owner.eventId}/participants/${owner.participantId}/media/${uploaded.body.media.id}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${other.token}` } },
  );
  assert.equal(deleteAsOther.status, 404);

  const crossUpload = await upload(other.token, owner.eventId, owner.participantId, "GALLERY");
  assert.equal(crossUpload.status, 404, "cross-organizer upload must be rejected before the file is persisted");
});

test("6.3A media validation: unsupported file types and invalid visibility are rejected", async () => {
  const ctx = await bootstrapEvent("validation");
  const form = new FormData();
  form.append("kind", "GALLERY");
  form.append("file", new Blob(["not an image"], { type: "text/plain" }), "bad.txt");

  const badFile = await fetch(
    `${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/media?visibility=PUBLIC`,
    { method: "POST", headers: { Authorization: `Bearer ${ctx.token}` }, body: form },
  );
  assert.equal(badFile.status, 400);

  const badVisibility = await upload(ctx.token, ctx.eventId, ctx.participantId, "GALLERY", "SIDEWAYS");
  assert.equal(badVisibility.status, 400);

  const privateProfile = await upload(ctx.token, ctx.eventId, ctx.participantId, "PROFILE_IMAGE", "PRIVATE");
  assert.equal(privateProfile.status, 400);
});

test("6.3A public media: only published/public active participants expose public media", async () => {
  const ctx = await bootstrapEvent("public");
  const uploaded = await upload(ctx.token, ctx.eventId, ctx.participantId, "GALLERY");
  assert.equal(uploaded.status, 201);

  const publicRes = await fetch(`${baseUrl}/api/public/events/${ctx.eventId}/participants/${ctx.participantId}/media`);
  assert.equal(publicRes.status, 200);
  const body = await publicRes.json();
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].visibility, undefined, "public projection must not expose internal visibility");
  assert.equal(body.items[0].fileUrl, uploaded.body.media.fileUrl);

  await prisma.eventParticipant.update({ where: { id: ctx.participantId }, data: { isPublic: false } });
  const hiddenRes = await fetch(`${baseUrl}/api/public/events/${ctx.eventId}/participants/${ctx.participantId}/media`);
  assert.equal(hiddenRes.status, 404);
});

test("6.3B public profile: published public participant exposes safe profile fields and public media only", async () => {
  const ctx = await bootstrapEvent("profile");
  await prisma.eventParticipant.update({
    where: { id: ctx.participantId },
    data: { title: "Keynote Speaker", organization: "ExhibitTix Labs", bio: "A public speaker bio.", website: "https://example.com" },
  });
  const uploaded = await upload(ctx.token, ctx.eventId, ctx.participantId, "GALLERY");

  const response = await fetch(`${baseUrl}/api/public/events/${ctx.eventId}/participants/${ctx.participantId}/profile`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.participant.name.startsWith("Speaker "), true);
  assert.equal(body.participant.title, "Keynote Speaker");
  assert.equal(body.participant.organization, "ExhibitTix Labs");
  assert.equal(body.participant.bio, "A public speaker bio.");
  assert.equal(body.participant.website, "https://example.com");
  assert.equal(body.participant.email, undefined);
  assert.equal(body.participant.phone, undefined);
  assert.equal(body.media.length, 1);
  assert.equal(body.media[0].id, uploaded.body.media.id);

  await prisma.eventParticipant.update({ where: { id: ctx.participantId }, data: { isPublic: false } });
  const hidden = await fetch(`${baseUrl}/api/public/events/${ctx.eventId}/participants/${ctx.participantId}/profile`);
  assert.equal(hidden.status, 404);
});
