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
      "X-Test-Rate-Limit-Key": `venue-parking-mutation-${label}`,
    },
    body: JSON.stringify({
      email: `venue-parking-mutation-${label}-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: `Venue parking mutation ${label}`,
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
      name: `Venue parking mutation bootstrap ${label} ${ts}`,
      status: "draft",
      visibility: "public",
      ticketTypes: [],
      stalls: [],
    }),
  });
  assert.equal(exhibitionResponse.status, 201);
  return body.token as string;
}

async function makeVenue(token: string, label: string) {
  const response = await fetch(`${baseUrl}/api/venues`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: `Private parking venue ${label} ${ts}`,
      address: "1 Private Parking Road",
      city: "Ahmedabad",
      state: "Gujarat",
      country: "India",
    }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).venue.id as string;
}

async function createParkingArea(token: string, venueId: string, name: string) {
  const response = await fetch(`${baseUrl}/api/venue-parking/venues/${venueId}/parking`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name, totalSpaces: 100 }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).parkingArea.id as string;
}

test("foreign organizer cannot archive or restore another tenant's parking areas", async () => {
  const owner = await bootstrap("owner");
  const other = await bootstrap("other");
  const venueId = await makeVenue(owner, "owner");

  const activeParkingId = await createParkingArea(owner, venueId, `Active parking ${ts}`);
  const archivedParkingId = await createParkingArea(owner, venueId, `Archived parking ${ts}`);

  const ownerArchive = await fetch(
    `${baseUrl}/api/venue-parking/parking/${archivedParkingId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${owner}` } },
  );
  assert.equal(ownerArchive.status, 204);

  const foreignArchive = await fetch(
    `${baseUrl}/api/venue-parking/parking/${activeParkingId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${other}` } },
  );
  assert.equal(foreignArchive.status, 404);

  const foreignRestore = await fetch(
    `${baseUrl}/api/venue-parking/parking/${archivedParkingId}/restore`,
    { method: "POST", headers: { Authorization: `Bearer ${other}` } },
  );
  assert.equal(foreignRestore.status, 404);

  const [activeAfterAttempt, archivedAfterAttempt] = await Promise.all([
    prisma.venueParkingArea.findUniqueOrThrow({ where: { id: activeParkingId } }),
    prisma.venueParkingArea.findUniqueOrThrow({ where: { id: archivedParkingId } }),
  ]);
  assert.equal(activeAfterAttempt.status, "active");
  assert.equal(activeAfterAttempt.archivedAt, null, "foreign organizer must not archive another tenant's parking area");
  assert.equal(archivedAfterAttempt.status, "archived");
  assert.ok(archivedAfterAttempt.archivedAt, "foreign organizer must not restore another tenant's parking area");

  const ownerRestore = await fetch(
    `${baseUrl}/api/venue-parking/parking/${archivedParkingId}/restore`,
    { method: "POST", headers: { Authorization: `Bearer ${owner}` } },
  );
  assert.equal(ownerRestore.status, 200);

  const restored = await prisma.venueParkingArea.findUniqueOrThrow({ where: { id: archivedParkingId } });
  assert.equal(restored.status, "active");
  assert.equal(restored.archivedAt, null);
});
