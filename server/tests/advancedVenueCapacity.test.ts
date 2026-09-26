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
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `avm05-${label}` },
    body: JSON.stringify({ email: `avm05-${label}-${ts}@example.com`, password: "TestPassword123!", fullName: `AVM05 ${label}`, userType: "exhibitor" }),
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${body.token}` },
    body: JSON.stringify({ name: `AVM05 bootstrap ${label} ${ts}`, status: "draft", visibility: "public", ticketTypes: [], stalls: [] }),
  });
  return body.token as string;
}

async function makeSpace(token: string, label: string) {
  const venue = (await (await fetch(`${baseUrl}/api/venues`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: `AVM05 Venue ${label} ${ts}` }) })).json()).venue;
  const building = (await (await fetch(`${baseUrl}/api/venues/${venue.id}/buildings`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: "Main" }) })).json()).building;
  const floor = (await (await fetch(`${baseUrl}/api/venues/buildings/${building.id}/floors`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: "Ground", level: 0 }) })).json()).floor;
  const zone = (await (await fetch(`${baseUrl}/api/venue-zones/floors/${floor.id}/zones`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: "Event Zone" }) })).json()).zone;
  const space = (await (await fetch(`${baseUrl}/api/venue-spaces/zones/${zone.id}/spaces`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: "Hall A", type: "hall" }) })).json()).space;
  return space.id as string;
}

test("AVM-05 capacity rules: create, validate, update, archive and restore", async () => {
  const token = await bootstrap("crud");
  const spaceId = await makeSpace(token, "crud");

  const invalid = await fetch(`${baseUrl}/api/venue-capacity/spaces/${spaceId}/rules`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Theatre", maxOccupancy: 100, seatedCapacity: 90, standingCapacity: 20 }),
  });
  assert.equal(invalid.status, 400);

  const create = await fetch(`${baseUrl}/api/venue-capacity/spaces/${spaceId}/rules`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Theatre", maxOccupancy: 100, seatedCapacity: 90, standingCapacity: 10, wheelchairCapacity: 4 }),
  });
  assert.equal(create.status, 201);
  const rule = (await create.json()).rule;
  assert.equal(rule.maxOccupancy, 100);

  const list = await fetch(`${baseUrl}/api/venue-capacity/spaces/${spaceId}/rules`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).rules.length, 1);

  const patch = await fetch(`${baseUrl}/api/venue-capacity/rules/${rule.id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ maxOccupancy: 120, seatedCapacity: 100, standingCapacity: 20 }),
  });
  assert.equal(patch.status, 200);

  const archive = await fetch(`${baseUrl}/api/venue-capacity/rules/${rule.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(archive.status, 204);
  assert.equal((await prisma.venueCapacityRule.findUniqueOrThrow({ where: { id: rule.id } })).status, "archived");

  const restore = await fetch(`${baseUrl}/api/venue-capacity/rules/${rule.id}/restore`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(restore.status, 200);
});

test("AVM-05 tenant isolation: another organizer cannot access capacity rules", async () => {
  const owner = await bootstrap("owner");
  const other = await bootstrap("other");
  const spaceId = await makeSpace(owner, "owner");

  const create = await fetch(`${baseUrl}/api/venue-capacity/spaces/${spaceId}/rules`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner}` },
    body: JSON.stringify({ name: "Standing", maxOccupancy: 500, standingCapacity: 500 }),
  });
  assert.equal(create.status, 201);
  const ruleId = (await create.json()).rule.id as string;

  const read = await fetch(`${baseUrl}/api/venue-capacity/spaces/${spaceId}/rules`, { headers: { Authorization: `Bearer ${other}` } });
  assert.equal(read.status, 404);
  const patch = await fetch(`${baseUrl}/api/venue-capacity/rules/${ruleId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${other}` },
    body: JSON.stringify({ maxOccupancy: 1 }),
  });
  assert.equal(patch.status, 404);
});
