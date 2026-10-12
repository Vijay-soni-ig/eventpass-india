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
      "X-Test-Rate-Limit-Key": `venue-mutation-boundaries-${label}`,
    },
    body: JSON.stringify({
      email: `venue-mutation-${label}-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: `Venue mutation ${label}`,
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
      name: `Venue mutation bootstrap ${label} ${ts}`,
      status: "draft",
      visibility: "public",
      ticketTypes: [],
      stalls: [],
    }),
  });
  assert.equal(exhibitionResponse.status, 201);
  return { token: body.token as string };
}

test("foreign organizer cannot update a floor or archive its parent building", async () => {
  const owner = await bootstrap("owner");
  const other = await bootstrap("other");
  const jsonAuth = (token: string) => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  });

  const venueResponse = await fetch(`${baseUrl}/api/venues`, {
    method: "POST",
    headers: jsonAuth(owner.token),
    body: JSON.stringify({
      name: `Mutation boundary venue ${ts}`,
      address: "1 Mutation Boundary Road",
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
    body: JSON.stringify({ name: `Mutation boundary building ${ts}` }),
  });
  assert.equal(buildingResponse.status, 201);
  const buildingId = (await buildingResponse.json()).building.id as string;

  const floorResponse = await fetch(`${baseUrl}/api/venues/buildings/${buildingId}/floors`, {
    method: "POST",
    headers: jsonAuth(owner.token),
    body: JSON.stringify({ name: `Mutation boundary floor ${ts}`, level: 0 }),
  });
  assert.equal(floorResponse.status, 201);
  const floorId = (await floorResponse.json()).floor.id as string;

  const foreignFloorUpdate = await fetch(`${baseUrl}/api/venues/floors/${floorId}`, {
    method: "PATCH",
    headers: jsonAuth(other.token),
    body: JSON.stringify({ name: "Unauthorized floor overwrite" }),
  });
  assert.equal(foreignFloorUpdate.status, 404);

  const foreignBuildingArchive = await fetch(`${baseUrl}/api/venues/buildings/${buildingId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${other.token}` },
  });
  assert.equal(foreignBuildingArchive.status, 404);

  const [building, floor] = await Promise.all([
    prisma.venueBuilding.findUniqueOrThrow({ where: { id: buildingId } }),
    prisma.venueFloor.findUniqueOrThrow({ where: { id: floorId } }),
  ]);
  assert.equal(building.name, `Mutation boundary building ${ts}`);
  assert.equal(building.archivedAt, null, "foreign organizer must not archive another tenant's building");
  assert.equal(floor.name, `Mutation boundary floor ${ts}`);
  assert.equal(floor.archivedAt, null, "foreign organizer must not mutate another tenant's floor");
});
