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
  const res = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "sponsors-" + label },
    body: JSON.stringify({ email: "sponsors-" + label + "-" + ts + "@example.com", password: "TestPassword123!", fullName: "Sponsor " + label, userType: "exhibitor" }),
  });
  const body = await res.json();
  return { token: body.token as string };
}

async function bootstrap(label: string) {
  const { token } = await signup(label);
  const res = await fetch(baseUrl + "/api/exhibitions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ name: "Sponsor bootstrap " + label + " " + ts, status: "draft", visibility: "public", ticketTypes: [], stalls: [] }),
  });
  const body = await res.json();
  const eventId = body.exhibition.eventId as string;
  const enable = await fetch(baseUrl + "/api/events/" + eventId + "/modules/SPONSORS", {
    method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ enabled: true }),
  });
  assert.equal(enable.status, 200);
  return { token, eventId };
}

test("sponsor management: create, search, update, archive and restore", async () => {
  const { token, eventId } = await bootstrap("crud");
  const create = await fetch(baseUrl + "/api/events/" + eventId + "/sponsors", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ name: "Acme Corp", title: "Platinum Sponsor", organization: "Acme Corp", bio: "Technology partner.", email: "sponsor@example.com", website: "https://example.com", isPublic: true, sortOrder: 1 }),
  });
  assert.equal(create.status, 201);
  const created = await create.json();
  const sponsorId = created.sponsor.id as string;
  assert.equal(created.sponsor.participantType, "SPONSOR");

  const search = await fetch(baseUrl + "/api/events/" + eventId + "/sponsors?search=Acme", { headers: { Authorization: "Bearer " + token } });
  assert.equal(search.status, 200);
  assert.equal((await search.json()).total, 1);

  const update = await fetch(baseUrl + "/api/events/" + eventId + "/sponsors/" + sponsorId, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ title: "Diamond Sponsor" }),
  });
  assert.equal(update.status, 200);
  assert.equal((await update.json()).sponsor.title, "Diamond Sponsor");

  const archive = await fetch(baseUrl + "/api/events/" + eventId + "/sponsors/" + sponsorId, { method: "DELETE", headers: { Authorization: "Bearer " + token } });
  assert.equal(archive.status, 204);
  const hidden = await fetch(baseUrl + "/api/events/" + eventId + "/sponsors", { headers: { Authorization: "Bearer " + token } });
  assert.equal((await hidden.json()).total, 0);
  const restore = await fetch(baseUrl + "/api/events/" + eventId + "/sponsors/" + sponsorId + "/restore", { method: "POST", headers: { Authorization: "Bearer " + token } });
  assert.equal(restore.status, 200);
});

test("sponsor management rejects access when participant module is disabled", async () => {
  const { token } = await signup("blocked");
  const res = await fetch(baseUrl + "/api/exhibitions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ name: "Sponsor blocked " + ts, status: "draft", visibility: "public", ticketTypes: [], stalls: [] }),
  });
  const body = await res.json();
  const eventId = body.exhibition.eventId as string;
  const create = await fetch(baseUrl + "/api/events/" + eventId + "/sponsors", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ name: "Blocked Sponsor" }),
  });
  assert.equal(create.status, 409);
});

test("sponsor management keeps tenant boundary", async () => {
  const a = await bootstrap("cross-a");
  const b = await bootstrap("cross-b");
  const res = await fetch(baseUrl + "/api/events/" + a.eventId + "/sponsors", { headers: { Authorization: "Bearer " + b.token } });
  assert.equal(res.status, 404);
  await prisma.eventParticipant.deleteMany({ where: { eventId: a.eventId } });
});
