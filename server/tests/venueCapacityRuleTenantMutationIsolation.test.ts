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
      "X-Test-Rate-Limit-Key": `capacity-rule-tenant-mutation-${label}`,
    },
    body: JSON.stringify({
      email: `capacity-rule-tenant-${label}-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: `Capacity rule tenant ${label}`,
      userType: "exhibitor",
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 201);

  const exhibition = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${body.token}`,
    },
    body: JSON.stringify({
      name: `Capacity rule bootstrap ${label} ${ts}`,
      status: "draft",
      visibility: "public",
      ticketTypes: [],
      stalls: [],
    }),
  });
  assert.equal(exhibition.status, 201);
  return body.token as string;
}

async function createSpace(token: string, label: string) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  const venueResponse = await fetch(`${baseUrl}/api/venues`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: `Capacity venue ${label} ${ts}`,
      address: "1 Capacity Test Road",
      city: "Ahmedabad",
      state: "Gujarat",
      country: "India",
    }),
  });
  assert.equal(venueResponse.status, 201);
  const venue = (await venueResponse.json()).venue;

  const buildingResponse = await fetch(`${baseUrl}/api/venues/${venue.id}/buildings`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: `Capacity building ${label} ${ts}` }),
  });
  assert.equal(buildingResponse.status, 201);
  const building = (await buildingResponse.json()).building;

  const floorResponse = await fetch(`${baseUrl}/api/venues/buildings/${building.id}/floors`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: `Capacity floor ${label} ${ts}`, level: 0 }),
  });
  assert.equal(floorResponse.status, 201);
  const floor = (await floorResponse.json()).floor;

  const zoneResponse = await fetch(`${baseUrl}/api/venue-zones/floors/${floor.id}/zones`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: `Capacity zone ${label} ${ts}` }),
  });
  assert.equal(zoneResponse.status, 201);
  const zone = (await zoneResponse.json()).zone;

  const spaceResponse = await fetch(`${baseUrl}/api/venue-spaces/zones/${zone.id}/spaces`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: `Capacity space ${label} ${ts}`, type: "hall" }),
  });
  assert.equal(spaceResponse.status, 201);
  return (await spaceResponse.json()).space.id as string;
}

async function createRule(token: string, spaceId: string, name: string) {
  const response = await fetch(`${baseUrl}/api/venue-capacity/spaces/${spaceId}/rules`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name, maxOccupancy: 100, seatedCapacity: 80, standingCapacity: 20 }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).rule.id as string;
}

test("capacity-rule archive and restore reject cross-tenant direct-ID mutations", async () => {
  const owner = await bootstrap("owner");
  const other = await bootstrap("other");
  const spaceId = await createSpace(owner, "owner");
  const activeRuleId = await createRule(owner, spaceId, `Active rule ${ts}`);
  const archivedRuleId = await createRule(owner, spaceId, `Archived rule ${ts}`);

  const ownerArchive = await fetch(`${baseUrl}/api/venue-capacity/rules/${archivedRuleId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${owner}` },
  });
  assert.equal(ownerArchive.status, 204);

  const foreignArchive = await fetch(`${baseUrl}/api/venue-capacity/rules/${activeRuleId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${other}` },
  });
  assert.equal(foreignArchive.status, 404);

  const foreignRestore = await fetch(`${baseUrl}/api/venue-capacity/rules/${archivedRuleId}/restore`, {
    method: "POST",
    headers: { Authorization: `Bearer ${other}` },
  });
  assert.equal(foreignRestore.status, 404);

  const [activeRule, archivedRule] = await Promise.all([
    prisma.venueCapacityRule.findUniqueOrThrow({ where: { id: activeRuleId } }),
    prisma.venueCapacityRule.findUniqueOrThrow({ where: { id: archivedRuleId } }),
  ]);
  assert.equal(activeRule.status, "active", "foreign archive must not change the active rule");
  assert.equal(activeRule.archivedAt, null);
  assert.equal(archivedRule.status, "archived", "foreign restore must not restore another tenant's rule");
  assert.ok(archivedRule.archivedAt);

  const ownerRestore = await fetch(`${baseUrl}/api/venue-capacity/rules/${archivedRuleId}/restore`, {
    method: "POST",
    headers: { Authorization: `Bearer ${owner}` },
  });
  assert.equal(ownerRestore.status, 200);
  const restored = await prisma.venueCapacityRule.findUniqueOrThrow({ where: { id: archivedRuleId } });
  assert.equal(restored.status, "active");
  assert.equal(restored.archivedAt, null);
});
