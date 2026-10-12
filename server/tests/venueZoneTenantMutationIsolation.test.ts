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

async function bootstrap(label: string) {
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Test-Rate-Limit-Key": `venue-zone-mutation-${label}`,
    },
    body: JSON.stringify({
      email: `venue-zone-mutation-${label}-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: `Venue zone mutation ${label}`,
      userType: "exhibitor",
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 201);

  const exhibitionResponse = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${body.token}`,
    },
    body: JSON.stringify({
      name: `Venue zone mutation bootstrap ${label} ${ts}`,
      status: "draft",
      visibility: "public",
      ticketTypes: [],
      stalls: [],
    }),
  });
  assert.equal(exhibitionResponse.status, 201);
  return body.token as string;
}

async function makeFloor(token: string, label: string) {
  const venueResponse = await fetch(`${baseUrl}/api/venues`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: `Private zone venue ${label} ${ts}`,
      address: "1 Private Zone Road",
      city: "Ahmedabad",
      state: "Gujarat",
      country: "India",
    }),
  });
  assert.equal(venueResponse.status, 201);
  const venueId = (await venueResponse.json()).venue.id as string;

  const buildingResponse = await fetch(`${baseUrl}/api/venues/${venueId}/buildings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name: "Main Building" }),
  });
  assert.equal(buildingResponse.status, 201);
  const buildingId = (await buildingResponse.json()).building.id as string;

  const floorResponse = await fetch(`${baseUrl}/api/venues/buildings/${buildingId}/floors`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name: "Ground Floor", level: 0 }),
  });
  assert.equal(floorResponse.status, 201);
  return (await floorResponse.json()).floor.id as string;
}

async function createZone(token: string, floorId: string, name: string) {
  const response = await fetch(`${baseUrl}/api/venue-zones/floors/${floorId}/zones`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name, type: "public_area" }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).zone.id as string;
}

test("foreign organizer cannot archive or restore another tenant's venue zones", async () => {
  const owner = await bootstrap("owner");
  const other = await bootstrap("other");
  const floorId = await makeFloor(owner, "owner");

  const activeZoneId = await createZone(owner, floorId, `Active zone ${ts}`);
  const archivedZoneId = await createZone(owner, floorId, `Archived zone ${ts}`);

  const ownerArchive = await fetch(
    `${baseUrl}/api/venue-zones/zones/${archivedZoneId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${owner}` } },
  );
  assert.equal(ownerArchive.status, 204);

  const foreignArchive = await fetch(
    `${baseUrl}/api/venue-zones/zones/${activeZoneId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${other}` } },
  );
  assert.equal(foreignArchive.status, 404);

  const foreignRestore = await fetch(
    `${baseUrl}/api/venue-zones/zones/${archivedZoneId}/restore`,
    { method: "POST", headers: { Authorization: `Bearer ${other}` } },
  );
  assert.equal(foreignRestore.status, 404);

  const [activeAfterAttempt, archivedAfterAttempt] = await Promise.all([
    prisma.venueZone.findUniqueOrThrow({ where: { id: activeZoneId } }),
    prisma.venueZone.findUniqueOrThrow({ where: { id: archivedZoneId } }),
  ]);
  assert.equal(activeAfterAttempt.status, "active");
  assert.equal(activeAfterAttempt.archivedAt, null, "foreign organizer must not archive another tenant's zone");
  assert.equal(archivedAfterAttempt.status, "archived");
  assert.ok(archivedAfterAttempt.archivedAt, "foreign organizer must not restore another tenant's zone");

  const ownerRestore = await fetch(
    `${baseUrl}/api/venue-zones/zones/${archivedZoneId}/restore`,
    { method: "POST", headers: { Authorization: `Bearer ${owner}` } },
  );
  assert.equal(ownerRestore.status, 200);

  const restored = await prisma.venueZone.findUniqueOrThrow({ where: { id: archivedZoneId } });
  assert.equal(restored.status, "active");
  assert.equal(restored.archivedAt, null);
});
