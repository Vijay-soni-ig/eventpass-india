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
  const signup = await fetch(baseUrl + "/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "avm-p1-" + label + "-" + ts }, body: JSON.stringify({ email: "avm-p1-" + label + "-" + ts + "@example.com", password: "TestPassword123!", fullName: "AVM P1 " + label, userType: "exhibitor" }) });
  const body = await signup.json(); assert.equal(signup.status, 201);
  const exhibition = await fetch(baseUrl + "/api/exhibitions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + body.token }, body: JSON.stringify({ name: "AVM P1 Bootstrap " + label + " " + ts, status: "draft", visibility: "public", ticketTypes: [], stalls: [] }) });
  assert.equal(exhibition.status, 201); return body.token as string;
}
async function venue(token: string, label: string) {
  const r = await fetch(baseUrl + "/api/venues", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ name: "AVM P1 Venue " + label + " " + ts, address: "1 AVM P1 Road", city: "Ahmedabad", state: "Gujarat", country: "India" }) });
  assert.equal(r.status, 201); return (await r.json()).venue.id as string;
}
async function event(token: string, venueId: string, label: string) {
  const r = await fetch(baseUrl + "/api/events", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ eventType: "CONFERENCE", title: "AVM P1 Event " + label + " " + ts, startDate: "2026-11-10", endDate: "2026-11-12", venue: "Legacy Venue", city: "Ahmedabad", venueId }) });
  assert.equal(r.status, 201); return (await r.json()).event.id as string;
}

test("AVM P1 venue allocation supports venue/building scopes", async () => {
  const token = await bootstrap("scopes"); const venueId = await venue(token, "scopes"); const eventId = await event(token, venueId, "scopes");
  const venueAllocation = await fetch(baseUrl + "/api/events/" + eventId + "/venue-allocations", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ scopeType: "venue", label: "Main event footprint" }) });
  assert.equal(venueAllocation.status, 201);
  const building = await fetch(baseUrl + "/api/venues/" + venueId + "/buildings", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ name: "Hall A" }) });
  assert.equal(building.status, 201); const buildingId = (await building.json()).building.id;
  const buildingAllocation = await fetch(baseUrl + "/api/events/" + eventId + "/venue-allocations", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ scopeType: "building", buildingId, label: "Hall A usage" }) });
  assert.equal(buildingAllocation.status, 201);
  const duplicate = await fetch(baseUrl + "/api/events/" + eventId + "/venue-allocations", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ scopeType: "building", buildingId }) });
  assert.equal(duplicate.status, 409);
  const list = await fetch(baseUrl + "/api/events/" + eventId + "/venue-allocations", { headers: { Authorization: "Bearer " + token } });
  assert.equal(list.status, 200); assert.equal((await list.json()).allocations.length, 2);
});

test("AVM P1 allocation API rejects cross-tenant Event access", async () => {
  const owner = await bootstrap("owner"); const other = await bootstrap("other"); const venueId = await venue(owner, "tenant"); const eventId = await event(owner, venueId, "tenant");
  const read = await fetch(baseUrl + "/api/events/" + eventId + "/venue-allocations", { headers: { Authorization: "Bearer " + other } });
  assert.equal(read.status, 404);
  const create = await fetch(baseUrl + "/api/events/" + eventId + "/venue-allocations", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + other }, body: JSON.stringify({ scopeType: "venue" }) });
  assert.equal(create.status, 404);
});

test("AVM P1 allocation duplicate protection is concurrency-safe", async () => {
  const token = await bootstrap("concurrency"); const venueId = await venue(token, "concurrency"); const eventId = await event(token, venueId, "concurrency");
  const building = await fetch(baseUrl + "/api/venues/" + venueId + "/buildings", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ name: "Concurrent Hall" }) });
  assert.equal(building.status, 201); const buildingId = (await building.json()).building.id;
  const results = await Promise.all([1, 2].map(() => fetch(baseUrl + "/api/events/" + eventId + "/venue-allocations", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ scopeType: "building", buildingId }) })));
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
});

test("AVM P1 restore rejects a duplicate active allocation and preserves archived state", async () => {
  const token = await bootstrap("restore-duplicate");
  const venueId = await venue(token, "restore-duplicate");
  const eventId = await event(token, venueId, "restore-duplicate");
  const create = () => fetch(baseUrl + "/api/events/" + eventId + "/venue-allocations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ scopeType: "venue", label: "Main footprint" }),
  });

  const first = await create();
  assert.equal(first.status, 201);
  const firstId = (await first.json()).allocation.id as string;
  const archive = await fetch(baseUrl + "/api/events/" + eventId + "/venue-allocations/" + firstId, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + token },
  });
  assert.equal(archive.status, 204);

  const second = await create();
  assert.equal(second.status, 201);
  const secondId = (await second.json()).allocation.id as string;

  const restore = await fetch(baseUrl + "/api/events/" + eventId + "/venue-allocations/" + firstId + "/restore", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
  });
  assert.equal(restore.status, 409);

  const rows = await prisma.eventVenueAllocation.findMany({
    where: { eventId },
    orderBy: { createdAt: "asc" },
  });
  assert.equal(rows.filter((row) => row.status !== "archived").length, 1);
  assert.equal(rows.find((row) => row.id === firstId)?.status, "archived");
  assert.equal(rows.find((row) => row.id === secondId)?.status, "active");
});

test("AVM P1 concurrent restore and create cannot produce duplicate active allocations", async () => {
  const token = await bootstrap("restore-create-race");
  const venueId = await venue(token, "restore-create-race");
  const eventId = await event(token, venueId, "restore-create-race");
  const create = () => fetch(baseUrl + "/api/events/" + eventId + "/venue-allocations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ scopeType: "venue", label: "Concurrent footprint" }),
  });

  const initial = await create();
  assert.equal(initial.status, 201);
  const initialId = (await initial.json()).allocation.id as string;
  const archive = await fetch(baseUrl + "/api/events/" + eventId + "/venue-allocations/" + initialId, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + token },
  });
  assert.equal(archive.status, 204);

  const results = await Promise.all([
    fetch(baseUrl + "/api/events/" + eventId + "/venue-allocations/" + initialId + "/restore", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
    }),
    create(),
  ]);
  const statuses = results.map((response) => response.status).sort((a, b) => a - b);
  // Either restore wins (200) and create conflicts (409), or create wins (201)
  // and restore conflicts (409). Both are valid serialized outcomes.
  assert.ok(
    (statuses[0] === 200 && statuses[1] === 409) || (statuses[0] === 201 && statuses[1] === 409),
    `expected one successful mutation and one conflict, received ${statuses.join(", ")}`,
  );

  const rows = await prisma.eventVenueAllocation.findMany({
    where: { eventId, status: { not: "archived" } },
  });
  assert.equal(rows.length, 1, "restore/create race must leave exactly one active allocation");
});
