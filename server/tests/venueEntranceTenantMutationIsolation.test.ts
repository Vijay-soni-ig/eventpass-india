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
      "X-Test-Rate-Limit-Key": `venue-entrance-mutation-${label}`,
    },
    body: JSON.stringify({
      email: `venue-entrance-mutation-${label}-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: `Venue entrance mutation ${label}`,
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
      name: `Venue entrance mutation bootstrap ${label} ${ts}`,
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
      name: `Private entrance venue ${label} ${ts}`,
      address: "1 Private Entrance Road",
      city: "Ahmedabad",
      state: "Gujarat",
      country: "India",
    }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).venue.id as string;
}

async function createEntrance(token: string, venueId: string, name: string) {
  const response = await fetch(`${baseUrl}/api/venue-entrances/venues/${venueId}/entrances`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).entrance.id as string;
}

test("foreign organizer cannot archive or restore another tenant's venue entrances", async () => {
  const owner = await bootstrap("owner");
  const other = await bootstrap("other");
  const venueId = await makeVenue(owner, "owner");

  const activeEntranceId = await createEntrance(owner, venueId, `Active entrance ${ts}`);
  const archivedEntranceId = await createEntrance(owner, venueId, `Archived entrance ${ts}`);

  const ownerArchive = await fetch(
    `${baseUrl}/api/venue-entrances/entrances/${archivedEntranceId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${owner}` } },
  );
  assert.equal(ownerArchive.status, 204);

  const foreignArchive = await fetch(
    `${baseUrl}/api/venue-entrances/entrances/${activeEntranceId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${other}` } },
  );
  assert.equal(foreignArchive.status, 404);

  const foreignRestore = await fetch(
    `${baseUrl}/api/venue-entrances/entrances/${archivedEntranceId}/restore`,
    { method: "POST", headers: { Authorization: `Bearer ${other}` } },
  );
  assert.equal(foreignRestore.status, 404);

  const [activeAfterAttempt, archivedAfterAttempt] = await Promise.all([
    prisma.venueEntrance.findUniqueOrThrow({ where: { id: activeEntranceId } }),
    prisma.venueEntrance.findUniqueOrThrow({ where: { id: archivedEntranceId } }),
  ]);
  assert.equal(activeAfterAttempt.status, "active");
  assert.equal(activeAfterAttempt.archivedAt, null, "foreign organizer must not archive another tenant's entrance");
  assert.equal(archivedAfterAttempt.status, "archived");
  assert.ok(archivedAfterAttempt.archivedAt, "foreign organizer must not restore another tenant's entrance");

  const ownerRestore = await fetch(
    `${baseUrl}/api/venue-entrances/entrances/${archivedEntranceId}/restore`,
    { method: "POST", headers: { Authorization: `Bearer ${owner}` } },
  );
  assert.equal(ownerRestore.status, 200);

  const restored = await prisma.venueEntrance.findUniqueOrThrow({ where: { id: archivedEntranceId } });
  assert.equal(restored.status, "active");
  assert.equal(restored.archivedAt, null);
});
