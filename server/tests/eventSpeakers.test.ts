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
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "speakers-" + label },
    body: JSON.stringify({
      email: "speakers-" + label + "-" + ts + "@example.com",
      password: "TestPassword123!",
      fullName: "Speaker " + label,
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
      name: "Speaker bootstrap " + label + " " + ts,
      status: "draft",
      visibility: "public",
      ticketTypes: [],
      stalls: [],
    }),
  });
  const body = await res.json();
  const eventId = body.exhibition.eventId as string;

  const enable = await fetch(baseUrl + "/api/events/" + eventId + "/modules/SPEAKERS", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(enable.status, 200);
  return { token, eventId };
}

test("speaker management: create, search, update, archive and restore", async () => {
  const { token, eventId } = await bootstrap("crud");

  const create = await fetch(baseUrl + "/api/events/" + eventId + "/speakers", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({
      name: "Neha Shah",
      title: "Product Design Lead",
      organization: "Example Labs",
      bio: "Design systems and product strategy.",
      email: "neha@example.com",
      website: "https://example.com/neha",
      isPublic: true,
      sortOrder: 1,
    }),
  });
  assert.equal(create.status, 201);
  const created = await create.json();
  const speakerId = created.speaker.id as string;
  assert.equal(created.speaker.participantType, "SPEAKER");

  const search = await fetch(baseUrl + "/api/events/" + eventId + "/speakers?search=Neha", {
    headers: { Authorization: "Bearer " + token },
  });
  assert.equal(search.status, 200);
  assert.equal((await search.json()).total, 1);

  const update = await fetch(baseUrl + "/api/events/" + eventId + "/speakers/" + speakerId, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ title: "Principal Product Design Lead" }),
  });
  assert.equal(update.status, 200);
  assert.equal((await update.json()).speaker.title, "Principal Product Design Lead");

  const archive = await fetch(baseUrl + "/api/events/" + eventId + "/speakers/" + speakerId, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + token },
  });
  assert.equal(archive.status, 204);

  const hidden = await fetch(baseUrl + "/api/events/" + eventId + "/speakers", {
    headers: { Authorization: "Bearer " + token },
  });
  assert.equal((await hidden.json()).total, 0);

  const restore = await fetch(baseUrl + "/api/events/" + eventId + "/speakers/" + speakerId + "/restore", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
  });
  assert.equal(restore.status, 200);
});

test("speaker management rejects access when participant module is disabled", async () => {
  const { token } = await signup("blocked");
  const res = await fetch(baseUrl + "/api/exhibitions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({
      name: "Speaker blocked " + ts,
      status: "draft",
      visibility: "public",
      ticketTypes: [],
      stalls: [],
    }),
  });
  const body = await res.json();
  const eventId = body.exhibition.eventId as string;

  const create = await fetch(baseUrl + "/api/events/" + eventId + "/speakers", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ name: "Blocked Speaker" }),
  });
  assert.equal(create.status, 409);
});

test("speaker management keeps tenant boundary", async () => {
  const a = await bootstrap("cross-a");
  const b = await bootstrap("cross-b");
  const res = await fetch(baseUrl + "/api/events/" + a.eventId + "/speakers", {
    headers: { Authorization: "Bearer " + b.token },
  });
  assert.equal(res.status, 404);

  await prisma.eventParticipant.deleteMany({ where: { eventId: a.eventId } });
});


test("speaker child-resource mutations cannot cross Event tenant boundaries", async () => {
  const ownerA = await bootstrap("tenant-mutation-a");
  const ownerB = await bootstrap("tenant-mutation-b");

  const created = await fetch(baseUrl + "/api/events/" + ownerA.eventId + "/speakers", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + ownerA.token },
    body: JSON.stringify({"name":"Tenant A Protected Speaker","title":"Original Speaker Title"}),
  });
  assert.equal(created.status, 201);
  const speakerId = (await created.json()).speaker.id as string;

  // A known child ID paired with another Event ID must not permit a write.
  const wrongEventPatch = await fetch(baseUrl + "/api/events/" + ownerB.eventId + "/speakers/" + speakerId, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + ownerB.token },
    body: JSON.stringify({ title: "Unauthorized wrong-event mutation" }),
  });
  assert.equal(wrongEventPatch.status, 404);

  // The correct Event ID must not let a different tenant mutate the record.
  const crossTenantPatch = await fetch(baseUrl + "/api/events/" + ownerA.eventId + "/speakers/" + speakerId, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + ownerB.token },
    body: JSON.stringify({ title: "Unauthorized cross-tenant mutation" }),
  });
  assert.equal(crossTenantPatch.status, 404);

  const crossTenantArchive = await fetch(baseUrl + "/api/events/" + ownerA.eventId + "/speakers/" + speakerId, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + ownerB.token },
  });
  assert.equal(crossTenantArchive.status, 404);

  const crossTenantRestore = await fetch(baseUrl + "/api/events/" + ownerA.eventId + "/speakers/" + speakerId + "/restore", {
    method: "POST",
    headers: { Authorization: "Bearer " + ownerB.token },
  });
  assert.equal(crossTenantRestore.status, 404);

  const persisted = await prisma.eventParticipant.findUniqueOrThrow({ where: { id: speakerId } });
  assert.equal(persisted.name, "Tenant A Protected Speaker", "rejected writes must not change the source record");
  assert.equal(persisted.eventId, ownerA.eventId);
  assert.equal(persisted.archivedAt, null, "rejected archive must not change archive state");

  await prisma.eventParticipant.deleteMany({ where: { eventId: ownerA.eventId } });
  await prisma.eventParticipant.deleteMany({ where: { eventId: ownerB.eventId } });
});
