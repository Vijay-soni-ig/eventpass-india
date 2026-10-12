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
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `venue-subresource-${label}` },
    body: JSON.stringify({
      email: `venue-subresource-${label}-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: `Venue subresource ${label}`,
      userType: "exhibitor",
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 201);

  const exhibition = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${body.token}` },
    body: JSON.stringify({
      name: `Venue subresource bootstrap ${label} ${ts}`,
      status: "draft",
      visibility: "public",
      ticketTypes: [],
      stalls: [],
    }),
  });
  assert.equal(exhibition.status, 201);
  return body.token as string;
}

async function makeVenue(token: string, label: string) {
  const response = await fetch(`${baseUrl}/api/venues`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: `Subresource Venue ${label} ${ts}`,
      address: "1 Subresource Road",
      city: "Ahmedabad",
      state: "Gujarat",
      country: "India",
    }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).venue.id as string;
}

async function makeSpace(token: string, label: string) {
  const venueId = await makeVenue(token, label);
  const buildingResponse = await fetch(`${baseUrl}/api/venues/${venueId}/buildings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Main Building" }),
  });
  assert.equal(buildingResponse.status, 201);
  const buildingId = (await buildingResponse.json()).building.id as string;

  const floorResponse = await fetch(`${baseUrl}/api/venues/buildings/${buildingId}/floors`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Ground Floor", level: 0 }),
  });
  assert.equal(floorResponse.status, 201);
  const floorId = (await floorResponse.json()).floor.id as string;

  const zoneResponse = await fetch(`${baseUrl}/api/venue-zones/floors/${floorId}/zones`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Main Zone", type: "public_area" }),
  });
  assert.equal(zoneResponse.status, 201);
  const zoneId = (await zoneResponse.json()).zone.id as string;

  const spaceResponse = await fetch(`${baseUrl}/api/venue-spaces/zones/${zoneId}/spaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Private Room" }),
  });
  assert.equal(spaceResponse.status, 201);
  return { venueId, floorId, zoneId, spaceId: (await spaceResponse.json()).space.id as string };
}

function headers(token: string) {
  return { Authorization: `Bearer ${token}` };
}
function jsonHeaders(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}
function range() {
  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
  return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
}

test("venue spaces reject cross-tenant archive and restore without changing persisted state", async () => {
  const owner = await bootstrap("space-owner");
  const other = await bootstrap("space-other");
  const { spaceId: activeSpaceId, zoneId } = await makeSpace(owner, "space");
  const create = await fetch(`${baseUrl}/api/venue-spaces/zones/${zoneId}/spaces`, {
    method: "POST", headers: jsonHeaders(owner),
    body: JSON.stringify({ name: "Archived Room" }),
  });
  assert.equal(create.status, 201);
  const archivedSpaceId = (await create.json()).space.id as string;
  const ownerArchive = await fetch(`${baseUrl}/api/venue-spaces/spaces/${archivedSpaceId}`, {
    method: "DELETE", headers: headers(owner),
  });
  assert.equal(ownerArchive.status, 204);

  const foreignArchive = await fetch(`${baseUrl}/api/venue-spaces/spaces/${activeSpaceId}`, {
    method: "DELETE", headers: headers(other),
  });
  assert.equal(foreignArchive.status, 404);
  const foreignRestore = await fetch(`${baseUrl}/api/venue-spaces/spaces/${archivedSpaceId}/restore`, {
    method: "POST", headers: headers(other),
  });
  assert.equal(foreignRestore.status, 404);

  const [active, archived] = await Promise.all([
    prisma.venueSpace.findUniqueOrThrow({ where: { id: activeSpaceId } }),
    prisma.venueSpace.findUniqueOrThrow({ where: { id: archivedSpaceId } }),
  ]);
  assert.equal(active.status, "active");
  assert.equal(active.archivedAt, null);
  assert.equal(archived.status, "archived");
  assert.ok(archived.archivedAt);

  const ownerRestore = await fetch(`${baseUrl}/api/venue-spaces/spaces/${archivedSpaceId}/restore`, {
    method: "POST", headers: headers(owner),
  });
  assert.equal(ownerRestore.status, 200);
  const restored = await prisma.venueSpace.findUniqueOrThrow({ where: { id: archivedSpaceId } });
  assert.equal(restored.status, "active");
  assert.equal(restored.archivedAt, null);
});

test("venue maps and map objects reject cross-tenant mutations without changing persisted state", async () => {
  const owner = await bootstrap("map-owner");
  const other = await bootstrap("map-other");
  const venueId = await makeVenue(owner, "map");
  const create = await fetch(`${baseUrl}/api/venue-maps/venues/${venueId}/maps`, {
    method: "POST", headers: jsonHeaders(owner),
    body: JSON.stringify({ name: "Private Map", canvasWidth: 1200, canvasHeight: 800 }),
  });
  assert.equal(create.status, 201);
  const mapId = (await create.json()).map.id as string;
  const objectCreate = await fetch(`${baseUrl}/api/venue-maps/maps/${mapId}/objects`, {
    method: "POST", headers: jsonHeaders(owner),
    body: JSON.stringify({ type: "custom", label: "Registration", x: 10, y: 20, width: 120, height: 60 }),
  });
  assert.equal(objectCreate.status, 201);
  const objectId = (await objectCreate.json()).object.id as string;

  const foreignPatch = await fetch(`${baseUrl}/api/venue-maps/maps/${mapId}`, {
    method: "PATCH", headers: jsonHeaders(other), body: JSON.stringify({ name: "Hijacked Map" }),
  });
  assert.equal(foreignPatch.status, 404);
  const foreignArchive = await fetch(`${baseUrl}/api/venue-maps/maps/${mapId}`, {
    method: "DELETE", headers: headers(other),
  });
  assert.equal(foreignArchive.status, 404);
  const foreignRestore = await fetch(`${baseUrl}/api/venue-maps/maps/${mapId}/restore`, {
    method: "POST", headers: headers(other),
  });
  assert.equal(foreignRestore.status, 404);
  const foreignObjectPatch = await fetch(`${baseUrl}/api/venue-maps/objects/${objectId}`, {
    method: "PATCH", headers: jsonHeaders(other), body: JSON.stringify({ label: "Hijacked Object" }),
  });
  assert.equal(foreignObjectPatch.status, 404);
  const foreignObjectDelete = await fetch(`${baseUrl}/api/venue-maps/objects/${objectId}`, {
    method: "DELETE", headers: headers(other),
  });
  assert.equal(foreignObjectDelete.status, 404);

  const [map, object] = await Promise.all([
    prisma.venueMap.findUniqueOrThrow({ where: { id: mapId } }),
    prisma.venueMapObject.findUniqueOrThrow({ where: { id: objectId } }),
  ]);
  assert.equal(map.name, "Private Map");
  assert.equal(map.status, "draft");
  assert.equal(map.archivedAt, null);
  assert.equal(object.label, "Registration");
  assert.equal(object.venueMapId, mapId);

  const ownerArchive = await fetch(`${baseUrl}/api/venue-maps/maps/${mapId}`, {
    method: "DELETE", headers: headers(owner),
  });
  assert.equal(ownerArchive.status, 200);
  const ownerRestore = await fetch(`${baseUrl}/api/venue-maps/maps/${mapId}/restore`, {
    method: "POST", headers: headers(owner),
  });
  assert.equal(ownerRestore.status, 200);
  const restored = await prisma.venueMap.findUniqueOrThrow({ where: { id: mapId } });
  assert.equal(restored.status, "draft");
  assert.equal(restored.archivedAt, null);
});

test("venue availability blocks reject cross-tenant archive and restore", async () => {
  const owner = await bootstrap("availability-owner");
  const other = await bootstrap("availability-other");
  const venueId = await makeVenue(owner, "availability");
  const create = await fetch(`${baseUrl}/api/venue-availability-maintenance/availability/venues/${venueId}`, {
    method: "POST", headers: jsonHeaders(owner),
    body: JSON.stringify({ name: "Owner active block", type: "closed", ...range() }),
  });
  assert.equal(create.status, 201);
  const activeId = (await create.json()).block.id as string;
  const archivedCreate = await fetch(`${baseUrl}/api/venue-availability-maintenance/availability/venues/${venueId}`, {
    method: "POST", headers: jsonHeaders(owner),
    body: JSON.stringify({ name: "Owner archived block", type: "reserved", ...range() }),
  });
  assert.equal(archivedCreate.status, 201);
  const archivedId = (await archivedCreate.json()).block.id as string;
  assert.equal((await fetch(`${baseUrl}/api/venue-availability-maintenance/availability/${archivedId}`, {
    method: "DELETE", headers: headers(owner),
  })).status, 204);

  assert.equal((await fetch(`${baseUrl}/api/venue-availability-maintenance/availability/${activeId}`, {
    method: "DELETE", headers: headers(other),
  })).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/venue-availability-maintenance/availability/${archivedId}/restore`, {
    method: "POST", headers: headers(other),
  })).status, 404);

  const [active, archived] = await Promise.all([
    prisma.venueAvailabilityBlock.findUniqueOrThrow({ where: { id: activeId } }),
    prisma.venueAvailabilityBlock.findUniqueOrThrow({ where: { id: archivedId } }),
  ]);
  assert.equal(active.status, "active");
  assert.equal(active.archivedAt, null);
  assert.equal(archived.status, "archived");
  assert.ok(archived.archivedAt);

  assert.equal((await fetch(`${baseUrl}/api/venue-availability-maintenance/availability/${archivedId}/restore`, {
    method: "POST", headers: headers(owner),
  })).status, 200);
});

test("venue maintenance blocks reject cross-tenant archive and restore", async () => {
  const owner = await bootstrap("maintenance-owner");
  const other = await bootstrap("maintenance-other");
  const venueId = await makeVenue(owner, "maintenance");
  const create = await fetch(`${baseUrl}/api/venue-availability-maintenance/maintenance/venues/${venueId}`, {
    method: "POST", headers: jsonHeaders(owner),
    body: JSON.stringify({ title: "Owner active maintenance", type: "inspection", ...range() }),
  });
  assert.equal(create.status, 201);
  const activeId = (await create.json()).block.id as string;
  const archivedCreate = await fetch(`${baseUrl}/api/venue-availability-maintenance/maintenance/venues/${venueId}`, {
    method: "POST", headers: jsonHeaders(owner),
    body: JSON.stringify({ title: "Owner archived maintenance", type: "repair", ...range() }),
  });
  assert.equal(archivedCreate.status, 201);
  const archivedId = (await archivedCreate.json()).block.id as string;
  assert.equal((await fetch(`${baseUrl}/api/venue-availability-maintenance/maintenance/${archivedId}`, {
    method: "DELETE", headers: headers(owner),
  })).status, 204);

  assert.equal((await fetch(`${baseUrl}/api/venue-availability-maintenance/maintenance/${activeId}`, {
    method: "DELETE", headers: headers(other),
  })).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/venue-availability-maintenance/maintenance/${archivedId}/restore`, {
    method: "POST", headers: headers(other),
  })).status, 404);

  const [active, archived] = await Promise.all([
    prisma.venueMaintenanceBlock.findUniqueOrThrow({ where: { id: activeId } }),
    prisma.venueMaintenanceBlock.findUniqueOrThrow({ where: { id: archivedId } }),
  ]);
  assert.equal(active.status, "scheduled");
  assert.equal(active.archivedAt, null);
  assert.equal(archived.status, "archived");
  assert.ok(archived.archivedAt);

  assert.equal((await fetch(`${baseUrl}/api/venue-availability-maintenance/maintenance/${archivedId}/restore`, {
    method: "POST", headers: headers(owner),
  })).status, 200);
});
