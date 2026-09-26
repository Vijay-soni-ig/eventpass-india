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
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `avm03-${label}` },
    body: JSON.stringify({ email: `avm03-${label}-${ts}@example.com`, password: "TestPassword123!", fullName: `AVM03 ${label}`, userType: "exhibitor" }),
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  const exhibition = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${body.token}` },
    body: JSON.stringify({ name: `AVM03 bootstrap ${label} ${ts}`, status: "draft", visibility: "public", ticketTypes: [], stalls: [] }),
  });
  const exhibitionBody = await exhibition.json();
  assert.equal(exhibition.status, 201);
  return { token: body.token as string, organizerId: exhibitionBody.exhibition.organizerId as string };
}

async function makeFloor(token: string) {
  const venueRes = await fetch(`${baseUrl}/api/venues`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: `AVM03 Venue ${ts}` }),
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
  return { floorId: (await floorRes.json()).floor.id as string, venueId: venue.id as string };
}

test("AVM-03 zone CRUD: creates, lists, updates, archives and restores a zone", async () => {
  const { token } = await bootstrap("crud");
  const { floorId } = await makeFloor(token);
  const create = await fetch(`${baseUrl}/api/venue-zones/floors/${floorId}/zones`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Registration Area", code: "REG", type: "registration", sortOrder: 1 }),
  });
  assert.equal(create.status, 201);
  const zone = (await create.json()).zone;
  assert.equal(zone.type, "registration");

  const list = await fetch(`${baseUrl}/api/venue-zones/floors/${floorId}/zones`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).zones.length, 1);

  const patch = await fetch(`${baseUrl}/api/venue-zones/zones/${zone.id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Visitor Registration", type: "public_area" }),
  });
  assert.equal(patch.status, 200);

  const archive = await fetch(`${baseUrl}/api/venue-zones/zones/${zone.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(archive.status, 204);
  const stored = await prisma.venueZone.findUniqueOrThrow({ where: { id: zone.id } });
  assert.equal(stored.status, "archived");
  assert.ok(stored.archivedAt);

  const restore = await fetch(`${baseUrl}/api/venue-zones/zones/${zone.id}/restore`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(restore.status, 200);
  assert.equal((await restore.json()).zone.archivedAt, null);
});

test("AVM-03 tenant isolation: another organizer cannot read or mutate a zone", async () => {
  const owner = await bootstrap("owner");
  const other = await bootstrap("other");
  const { floorId } = await makeFloor(owner.token);
  const create = await fetch(`${baseUrl}/api/venue-zones/floors/${floorId}/zones`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ name: "Private Zone" }),
  });
  assert.equal(create.status, 201);
  const zoneId = (await create.json()).zone.id as string;

  const read = await fetch(`${baseUrl}/api/venue-zones/floors/${floorId}/zones`, { headers: { Authorization: `Bearer ${other.token}` } });
  assert.equal(read.status, 404);
  const patch = await fetch(`${baseUrl}/api/venue-zones/zones/${zoneId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${other.token}` },
    body: JSON.stringify({ name: "Hijacked" }),
  });
  assert.equal(patch.status, 404);
  assert.equal((await prisma.venueZone.findUniqueOrThrow({ where: { id: zoneId } })).name, "Private Zone");
});
