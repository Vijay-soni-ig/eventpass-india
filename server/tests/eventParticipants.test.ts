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
  const res = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "participants-" + label },
    body: JSON.stringify({
      email: "participants-" + label + "-" + ts + "@example.com",
      password: "TestPassword123!",
      fullName: "Participant " + label,
      userType: "exhibitor",
    }),
  });
  const body = await res.json();
  return { token: body.token as string };
}

async function bootstrap(label: string) {
  const { token } = await signup(label);
  const res = await fetch(baseUrl + "/api/exhibitions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({
      name: "Participant bootstrap " + label + " " + ts,
      status: "draft",
      visibility: "public",
      ticketTypes: [],
      stalls: [],
    }),
  });
  const body = await res.json();
  return { token, eventId: body.exhibition.eventId as string };
}

async function enableParticipants(token: string, eventId: string) {
  const res = await fetch(baseUrl + "/api/events/" + eventId + "/modules/PARTICIPANTS", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(res.status, 200);
}

test("participant CRUD: create, list, update, archive, restore", async () => {
  const { token, eventId } = await bootstrap("crud");
  await enableParticipants(token, eventId);

  const create = await fetch(baseUrl + "/api/events/" + eventId + "/participants", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({
      participantType: "SPEAKER",
      name: "Asha Patel",
      title: "Product Designer",
      organization: "Example Labs",
      bio: "Talks about product design.",
      isPublic: true,
      sortOrder: 1,
    }),
  });
  assert.equal(create.status, 201);
  const created = await create.json();
  const participantId = created.participant.id as string;

  const list = await fetch(baseUrl + "/api/events/" + eventId + "/participants?type=SPEAKER", {
    headers: { Authorization: "Bearer " + token },
  });
  const listBody = await list.json();
  assert.equal(list.status, 200);
  assert.equal(listBody.total, 1);
  assert.equal(listBody.participants[0].name, "Asha Patel");

  const update = await fetch(baseUrl + "/api/events/" + eventId + "/participants/" + participantId, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ title: "Lead Product Designer" }),
  });
  assert.equal(update.status, 200);
  assert.equal((await update.json()).participant.title, "Lead Product Designer");

  const archive = await fetch(baseUrl + "/api/events/" + eventId + "/participants/" + participantId, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + token },
  });
  assert.equal(archive.status, 204);

  const hiddenList = await fetch(baseUrl + "/api/events/" + eventId + "/participants", {
    headers: { Authorization: "Bearer " + token },
  });
  assert.equal((await hiddenList.json()).total, 0);

  const restore = await fetch(baseUrl + "/api/events/" + eventId + "/participants/" + participantId + "/restore", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
  });
  assert.equal(restore.status, 200);
});

test("participant validation and module gating", async () => {
  const { token, eventId } = await bootstrap("validation");

  const blocked = await fetch(baseUrl + "/api/events/" + eventId + "/participants", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ participantType: "CUSTOM", name: "Custom Person" }),
  });
  assert.equal(blocked.status, 409);

  await enableParticipants(token, eventId);

  const invalid = await fetch(baseUrl + "/api/events/" + eventId + "/participants", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ participantType: "CUSTOM", name: "Custom Person" }),
  });
  assert.equal(invalid.status, 400);

  const valid = await fetch(baseUrl + "/api/events/" + eventId + "/participants", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ participantType: "CUSTOM", customType: "Judge", name: "Custom Person" }),
  });
  assert.equal(valid.status, 201);
});

test("participant authorization: cross-organizer access returns 404", async () => {
  const a = await bootstrap("cross-a");
  const b = await bootstrap("cross-b");
  const res = await fetch(baseUrl + "/api/events/" + a.eventId + "/participants", {
    headers: { Authorization: "Bearer " + b.token },
  });
  assert.equal(res.status, 404);
});

test("public participants require a published event and only expose public active records", async () => {
  const { token, eventId } = await bootstrap("public");
  await enableParticipants(token, eventId);

  const create = await fetch(baseUrl + "/api/events/" + eventId + "/participants", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ participantType: "SPONSOR", name: "Private Sponsor", isPublic: false }),
  });
  assert.equal(create.status, 201);

  const draftResponse = await fetch(baseUrl + "/api/public/events/" + eventId + "/participants");
  assert.equal(draftResponse.status, 404);

  await prisma.event.update({
    where: { id: eventId },
    data: { status: "PUBLISHED", visibility: "public" },
  });

  const publicResponse = await fetch(baseUrl + "/api/public/events/" + eventId + "/participants");
  assert.equal(publicResponse.status, 200);
  assert.equal((await publicResponse.json()).participants.length, 0);
});
