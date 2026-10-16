import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => { ({ baseUrl, stop } = await startTestServer()); });
after(async () => { await stop(); });

async function bootstrap(label: string) {
  const signup = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "6-2-" + label },
    body: JSON.stringify({
      email: "6-2-" + label + "-" + ts + "@example.com",
      password: "TestPassword123!",
      fullName: "Phase 6.2 " + label,
      userType: "exhibitor",
    }),
  });
  const signupBody = await signup.json();
  const token = signupBody.token as string;
  const exhibition = await fetch(baseUrl + "/api/exhibitions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ name: "6.2 " + label + " " + ts, status: "draft", visibility: "public", ticketTypes: [], stalls: [] }),
  });
  const body = await exhibition.json();
  return { token, eventId: body.exhibition.eventId as string };
}

async function enable(token: string, eventId: string, moduleType: "SPEAKERS" | "SESSIONS") {
  const response = await fetch(baseUrl + "/api/events/" + eventId + "/modules/" + moduleType, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(response.status, 200);
}

test("session CRUD assigns only speakers from the same event", async () => {
  const a = await bootstrap("crud");
  await enable(a.token, a.eventId, "SPEAKERS");
  await enable(a.token, a.eventId, "SESSIONS");

  const speakerResponse = await fetch(baseUrl + "/api/events/" + a.eventId + "/speakers", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + a.token },
    body: JSON.stringify({ name: "Asha Speaker", title: "Designer", isPublic: true }),
  });
  assert.equal(speakerResponse.status, 201);
  const speakerId = (await speakerResponse.json()).speaker.id as string;

  const create = await fetch(baseUrl + "/api/events/" + a.eventId + "/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + a.token },
    body: JSON.stringify({
      title: "Design Systems at Scale",
      description: "Session description",
      date: "2026-10-10",
      startTime: "10:00",
      endTime: "11:00",
      room: "Hall A",
      status: "PUBLISHED",
      speakerIds: [speakerId],
    }),
  });
  assert.equal(create.status, 201);
  const sessionBody = await create.json();
  assert.equal(sessionBody.session.title, "Design Systems at Scale");
  assert.equal(sessionBody.session.speakers.length, 1);
  assert.equal(sessionBody.session.speakers[0].participant.name, "Asha Speaker");

  const list = await fetch(baseUrl + "/api/events/" + a.eventId + "/sessions?status=PUBLISHED", {
    headers: { Authorization: "Bearer " + a.token },
  });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).total, 1);

  const update = await fetch(baseUrl + "/api/events/" + a.eventId + "/sessions/" + sessionBody.session.id, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + a.token },
    body: JSON.stringify({ endTime: "11:30", speakerIds: [] }),
  });
  assert.equal(update.status, 200);
  assert.equal((await update.json()).session.speakers.length, 0);

  const cancel = await fetch(baseUrl + "/api/events/" + a.eventId + "/sessions/" + sessionBody.session.id, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + a.token },
  });
  assert.equal(cancel.status, 204);
});

test("session validation and module gating", async () => {
  const a = await bootstrap("validation");
  const blocked = await fetch(baseUrl + "/api/events/" + a.eventId + "/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + a.token },
    body: JSON.stringify({ title: "Blocked", date: "2026-10-10", startTime: "10:00", endTime: "11:00" }),
  });
  assert.equal(blocked.status, 409);

  await enable(a.token, a.eventId, "SESSIONS");
  const invalid = await fetch(baseUrl + "/api/events/" + a.eventId + "/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + a.token },
    body: JSON.stringify({ title: "Invalid", date: "2026-10-10", startTime: "11:00", endTime: "10:00" }),
  });
  assert.equal(invalid.status, 400);
});

test("public sessions require published event and expose only active public speakers", async () => {
  const a = await bootstrap("public");
  await enable(a.token, a.eventId, "SPEAKERS");
  await enable(a.token, a.eventId, "SESSIONS");

  const speakerResponse = await fetch(baseUrl + "/api/events/" + a.eventId + "/speakers", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + a.token },
    body: JSON.stringify({ name: "Public Speaker", isPublic: true }),
  });
  const speakerId = (await speakerResponse.json()).speaker.id as string;

  const sessionResponse = await fetch(baseUrl + "/api/events/" + a.eventId + "/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + a.token },
    body: JSON.stringify({ title: "Public Session", date: "2026-10-10", startTime: "12:00", endTime: "13:00", status: "PUBLISHED", speakerIds: [speakerId] }),
  });
  assert.equal(sessionResponse.status, 201);

  let publicResponse = await fetch(baseUrl + "/api/public/events/" + a.eventId + "/sessions");
  assert.equal(publicResponse.status, 404);

  await prisma.event.update({ where: { id: a.eventId }, data: { status: "PUBLISHED", visibility: "public" } });
  publicResponse = await fetch(baseUrl + "/api/public/events/" + a.eventId + "/sessions");
  assert.equal(publicResponse.status, 200);
  const body = await publicResponse.json();
  assert.equal(body.sessions.length, 1);
  assert.equal(body.sessions[0].speakers[0].participant.name, "Public Speaker");

  await prisma.eventParticipant.update({ where: { id: speakerId }, data: { isPublic: false } });
  publicResponse = await fetch(baseUrl + "/api/public/events/" + a.eventId + "/sessions");
  assert.equal(publicResponse.status, 200);
  assert.equal((await publicResponse.json()).sessions[0].speakers.length, 0);
});

test("session APIs reject speaker links while the SPEAKERS module is disabled", async () => {
  const a = await bootstrap("speaker-module-disabled");
  await enable(a.token, a.eventId, "SESSIONS");

  const speaker = await prisma.eventParticipant.create({
    data: {
      eventId: a.eventId,
      participantType: "SPEAKER",
      name: "Disabled Module Speaker",
      status: "ACTIVE",
      isPublic: true,
    },
  });

  const createWithSpeaker = await fetch(baseUrl + "/api/events/" + a.eventId + "/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + a.token },
    body: JSON.stringify({
      title: "Must not link speaker",
      date: "2026-10-10",
      startTime: "10:00",
      endTime: "11:00",
      speakerIds: [speaker.id],
    }),
  });
  assert.equal(createWithSpeaker.status, 409);

  const createWithoutSpeaker = await fetch(baseUrl + "/api/events/" + a.eventId + "/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + a.token },
    body: JSON.stringify({
      title: "Session without speakers",
      date: "2026-10-10",
      startTime: "10:00",
      endTime: "11:00",
    }),
  });
  assert.equal(createWithoutSpeaker.status, 201);
  const session = (await createWithoutSpeaker.json()).session;

  const updateWithSpeaker = await fetch(baseUrl + "/api/events/" + a.eventId + "/sessions/" + session.id, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + a.token },
    body: JSON.stringify({ speakerIds: [speaker.id] }),
  });
  assert.equal(updateWithSpeaker.status, 409);

  const list = await fetch(baseUrl + "/api/events/" + a.eventId + "/sessions", {
    headers: { Authorization: "Bearer " + a.token },
  });
  assert.equal(list.status, 200);
  const sessions = await list.json();
  assert.equal(sessions.total, 1);
  assert.equal(sessions.sessions[0].speakers.length, 0);
});



test("session mutations reject cross-tenant and wrong-event IDs without changing owner data", async () => {
  const owner = await bootstrap("tenant-owner");
  const other = await bootstrap("tenant-other");
  await enable(owner.token, owner.eventId, "SESSIONS");
  await enable(other.token, other.eventId, "SESSIONS");

  const created = await fetch(baseUrl + "/api/events/" + owner.eventId + "/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + owner.token },
    body: JSON.stringify({
      title: "Owner-only session",
      date: "2026-10-17",
      startTime: "10:00",
      endTime: "11:00",
      room: "Hall A",
      status: "PUBLISHED",
    }),
  });
  assert.equal(created.status, 201);
  const sessionId = (await created.json()).session.id as string;

  const wrongEventPatch = await fetch(baseUrl + "/api/events/" + other.eventId + "/sessions/" + sessionId, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + other.token },
    body: JSON.stringify({ title: "Wrong event overwrite" }),
  });
  assert.equal(wrongEventPatch.status, 404);

  const crossTenantPatch = await fetch(baseUrl + "/api/events/" + owner.eventId + "/sessions/" + sessionId, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + other.token },
    body: JSON.stringify({ title: "Unauthorized overwrite" }),
  });
  assert.equal(crossTenantPatch.status, 404);

  const crossTenantCancel = await fetch(baseUrl + "/api/events/" + owner.eventId + "/sessions/" + sessionId, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(crossTenantCancel.status, 404);

  const persisted = await prisma.eventSession.findUniqueOrThrow({ where: { id: sessionId } });
  assert.equal(persisted.title, "Owner-only session");
  assert.equal(persisted.eventId, owner.eventId);
  assert.equal(persisted.status, "PUBLISHED");
});
