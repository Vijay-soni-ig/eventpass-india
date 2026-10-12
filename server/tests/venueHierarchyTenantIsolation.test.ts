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
      "X-Test-Rate-Limit-Key": `venue-hierarchy-isolation-${label}`,
    },
    body: JSON.stringify({
      email: `venue-hierarchy-${label}-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: `Venue hierarchy ${label}`,
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
      name: `Venue hierarchy bootstrap ${label} ${ts}`,
      status: "draft",
      visibility: "public",
      ticketTypes: [],
      stalls: [],
    }),
  });
  assert.equal(exhibitionResponse.status, 201);
  return { token: body.token as string };
}

test("venue hierarchy IDs cannot be used by another organizer to read or mutate resources", async () => {
  const owner = await bootstrap("owner");
  const other = await bootstrap("other");
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const jsonAuth = (token: string) => ({
    ...auth(token),
    "Content-Type": "application/json",
  });

  const venueResponse = await fetch(`${baseUrl}/api/venues`, {
    method: "POST",
    headers: jsonAuth(owner.token),
    body: JSON.stringify({
      name: `Private venue ${ts}`,
      address: "1 Private Venue Road",
      city: "Ahmedabad",
      state: "Gujarat",
      country: "India",
    }),
  });
  assert.equal(venueResponse.status, 201);
  const venueId = (await venueResponse.json()).venue.id as string;

  const buildingResponse = await fetch(`${baseUrl}/api/venues/${venueId}/buildings`, {
    method: "POST",
    headers: jsonAuth(owner.token),
    body: JSON.stringify({ name: `Private building ${ts}` }),
  });
  assert.equal(buildingResponse.status, 201);
  const buildingId = (await buildingResponse.json()).building.id as string;

  const floorResponse = await fetch(`${baseUrl}/api/venues/buildings/${buildingId}/floors`, {
    method: "POST",
    headers: jsonAuth(owner.token),
    body: JSON.stringify({ name: `Private floor ${ts}`, level: 0 }),
  });
  assert.equal(floorResponse.status, 201);
  const floorId = (await floorResponse.json()).floor.id as string;

  const foreignVenueBuildings = await fetch(`${baseUrl}/api/venues/${venueId}/buildings`, {
    headers: auth(other.token),
  });
  assert.equal(foreignVenueBuildings.status, 404);

  const foreignBuildingFloors = await fetch(`${baseUrl}/api/venues/buildings/${buildingId}/floors`, {
    headers: auth(other.token),
  });
  assert.equal(foreignBuildingFloors.status, 404);

  const createChild = await fetch(`${baseUrl}/api/venues/${venueId}/buildings`, {
    method: "POST",
    headers: jsonAuth(other.token),
    body: JSON.stringify({ name: `Unauthorized building ${ts}` }),
  });
  assert.equal(createChild.status, 404);

  const patchBuilding = await fetch(`${baseUrl}/api/venues/buildings/${buildingId}`, {
    method: "PATCH",
    headers: jsonAuth(other.token),
    body: JSON.stringify({ name: "Cross-tenant overwrite" }),
  });
  assert.equal(patchBuilding.status, 404);

  const deleteFloor = await fetch(`${baseUrl}/api/venues/floors/${floorId}`, {
    method: "DELETE",
    headers: auth(other.token),
  });
  assert.equal(deleteFloor.status, 404);

  const [venue, building, floor, buildingCount] = await Promise.all([
    prisma.venue.findUniqueOrThrow({ where: { id: venueId } }),
    prisma.venueBuilding.findUniqueOrThrow({ where: { id: buildingId } }),
    prisma.venueFloor.findUniqueOrThrow({ where: { id: floorId } }),
    prisma.venueBuilding.count({ where: { venueId } }),
  ]);
  assert.equal(venue.name, `Private venue ${ts}`);
  assert.equal(building.name, `Private building ${ts}`);
  assert.equal(buildingCount, 1, "foreign organizer must not create children under another tenant's venue");
  assert.equal(floor.name, `Private floor ${ts}`);
  assert.equal(floor.archivedAt, null, "foreign organizer must not archive another tenant's floor");
});
