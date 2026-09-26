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
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `avm04-${label}` },
    body: JSON.stringify({ email: `avm04-${label}-${ts}@example.com`, password: "TestPassword123!", fullName: `AVM04 ${label}`, userType: "exhibitor" }),
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  const exhibition = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${body.token}` },
    body: JSON.stringify({ name: `AVM04 bootstrap ${label} ${ts}`, status: "draft", visibility: "public", ticketTypes: [], stalls: [] }),
  });
  const exhibitionBody = await exhibition.json();
  assert.equal(exhibition.status, 201);
  return { token: body.token as string };
}

async function makeZone(token: string) {
  const venueRes = await fetch(`${baseUrl}/api/venues`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: `AVM04 Venue ${ts}` }),
  });
  assert.equal(venueRes.status, 201);
  const venue = (await venueRes.json()).venue;
  const buildingRes = await fetch(`${baseUrl}/api/venues/${venue.id}/buildings`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Main Building" }),
  });
  assert.equal(buildingRes.status, 201);
  const building = (await buildingRes.json()).building;
  const floorRes = await fetch(`${baseUrl}/api/venues/buildings/${building.id}/floors`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Ground Floor", level: 0 }),
  });
  assert.equal(floorRes.status, 201);
  const floor = (await floorRes.json()).floor;
  const zoneRes = await fetch(`${baseUrl}/api/venue-zones/floors/${floor.id}/zones`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Meeting Zone", type: "meeting" }),
  });
  assert.equal(zoneRes.status, 201);
  return { zoneId: (await zoneRes.json()).zone.id as string };
}

test("AVM-04 space CRUD: creates, searches, updates, archives and restores", async () => {
  const { token } = await bootstrap("crud");
  const { zoneId } = await makeZone(token);

  const create = await fetch(`${baseUrl}/api/venue-spaces/zones/${zoneId}/spaces`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Conference Room A", code: "CRA", type: "conference_room", sortOrder: 2 }),
  });
  assert.equal(create.status, 201);
  const space = (await create.json()).space;
  assert.equal(space.type, "conference_room");

  const list = await fetch(`${baseUrl}/api/venue-spaces/zones/${zoneId}/spaces?q=conference`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).spaces.length, 1);

  const patch = await fetch(`${baseUrl}/api/venue-spaces/spaces/${space.id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Conference Room B", type: "meeting_room" }),
  });
  assert.equal(patch.status, 200);

  const archive = await fetch(`${baseUrl}/api/venue-spaces/spaces/${space.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(archive.status, 204);
  const stored = await prisma.venueSpace.findUniqueOrThrow({ where: { id: space.id } });
  assert.equal(stored.status, "archived");
  assert.ok(stored.archivedAt);

  const restore = await fetch(`${baseUrl}/api/venue-spaces/spaces/${space.id}/restore`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(restore.status, 200);
  assert.equal((await restore.json()).space.archivedAt, null);
});

test("AVM-04 tenant isolation: another organizer cannot read or mutate a space", async () => {
  const owner = await bootstrap("owner");
  const other = await bootstrap("other");
  const { zoneId } = await makeZone(owner.token);

  const create = await fetch(`${baseUrl}/api/venue-spaces/zones/${zoneId}/spaces`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ name: "Private Room" }),
  });
  assert.equal(create.status, 201);
  const spaceId = (await create.json()).space.id as string;

  const read = await fetch(`${baseUrl}/api/venue-spaces/spaces/${spaceId}`, { headers: { Authorization: `Bearer ${other.token}` } });
  assert.equal(read.status, 404);
  const patch = await fetch(`${baseUrl}/api/venue-spaces/spaces/${spaceId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${other.token}` },
    body: JSON.stringify({ name: "Hijacked" }),
  });
  assert.equal(patch.status, 404);
  assert.equal((await prisma.venueSpace.findUniqueOrThrow({ where: { id: spaceId } })).name, "Private Room");
});

test("AVM-04 uniqueness and archived-parent protection", async () => {
  const { token } = await bootstrap("rules");
  const { zoneId } = await makeZone(token);
  const first = await fetch(`${baseUrl}/api/venue-spaces/zones/${zoneId}/spaces`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Duplicate Room", code: "DUP" }),
  });
  assert.equal(first.status, 201);
  const duplicate = await fetch(`${baseUrl}/api/venue-spaces/zones/${zoneId}/spaces`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Duplicate Room", code: "OTHER" }),
  });
  assert.equal(duplicate.status, 409);

  const archiveZone = await fetch(`${baseUrl}/api/venue-zones/zones/${zoneId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(archiveZone.status, 204);
  const blocked = await fetch(`${baseUrl}/api/venue-spaces/zones/${zoneId}/spaces`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Blocked Room" }),
  });
  assert.equal(blocked.status, 409);
});
