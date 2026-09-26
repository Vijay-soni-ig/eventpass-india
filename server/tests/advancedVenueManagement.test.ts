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

async function signup(label: string) {
  const email = `avm02-${label}-${ts}@example.com`;
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `avm02-${label}` },
    body: JSON.stringify({ email, password: "TestPassword123!", fullName: `AVM02 ${label}`, userType: "exhibitor" }),
  });
  const body = await response.json();
  return { token: body.token as string, userId: body.user.id as string };
}

async function bootstrapOrganizer(label: string) {
  const account = await signup(label);
  const response = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${account.token}` },
    body: JSON.stringify({ name: `AVM02 bootstrap ${label} ${ts}`, status: "draft", visibility: "public", ticketTypes: [], stalls: [] }),
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  return { ...account, organizerId: body.exhibition.organizerId as string };
}

test("AVM-02 venue CRUD: creates venue, building and floor with tenant-scoped hierarchy", async () => {
  const { token, organizerId } = await bootstrapOrganizer("crud");
  const venueRes = await fetch(`${baseUrl}/api/venues`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: `Expo Centre ${ts}`, code: `EXPO-${ts}`, city: "Ahmedabad", state: "Gujarat" }),
  });
  assert.equal(venueRes.status, 201);
  const venue = (await venueRes.json()).venue;
  assert.equal(venue.organizerId, organizerId);

  const buildingRes = await fetch(`${baseUrl}/api/venues/${venue.id}/buildings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Main Exhibition Building", code: "MAIN" }),
  });
  assert.equal(buildingRes.status, 201);
  const building = (await buildingRes.json()).building;

  const floorRes = await fetch(`${baseUrl}/api/venues/buildings/${building.id}/floors`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Ground Floor", code: "GF", level: 0 }),
  });
  assert.equal(floorRes.status, 201);
  const floor = (await floorRes.json()).floor;
  assert.equal(floor.buildingId, building.id);

  const detailRes = await fetch(`${baseUrl}/api/venues/${venue.id}`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(detailRes.status, 200);
  const detail = (await detailRes.json()).venue;
  assert.equal(detail.buildings.length, 1);
  assert.equal(detail.buildings[0].floors.length, 1);
});

test("AVM-02 tenant isolation: another organizer cannot read or mutate the venue hierarchy", async () => {
  const owner = await bootstrapOrganizer("owner");
  const other = await bootstrapOrganizer("other");

  const createRes = await fetch(`${baseUrl}/api/venues`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ name: `Private Venue ${ts}` }),
  });
  assert.equal(createRes.status, 201);
  const venueId = (await createRes.json()).venue.id as string;

  const readRes = await fetch(`${baseUrl}/api/venues/${venueId}`, { headers: { Authorization: `Bearer ${other.token}` } });
  assert.equal(readRes.status, 404);

  const patchRes = await fetch(`${baseUrl}/api/venues/${venueId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${other.token}` },
    body: JSON.stringify({ name: "Should Not Change" }),
  });
  assert.equal(patchRes.status, 404);

  const stored = await prisma.venue.findUniqueOrThrow({ where: { id: venueId } });
  assert.equal(stored.organizerId, owner.organizerId);
  assert.equal(stored.name, `Private Venue ${ts}`);
});

test("AVM-02 duplicate scoped venue names are rejected", async () => {
  const { token } = await bootstrapOrganizer("duplicates");
  const payload = { name: `Duplicate Venue ${ts}` };
  const first = await fetch(`${baseUrl}/api/venues`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  assert.equal(first.status, 201);

  const second = await fetch(`${baseUrl}/api/venues`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  assert.equal(second.status, 409);
});

test("AVM-02 archive and restore use soft-delete semantics", async () => {
  const { token } = await bootstrapOrganizer("archive");
  const create = await fetch(`${baseUrl}/api/venues`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: `Archive Venue ${ts}` }),
  });
  const venueId = (await create.json()).venue.id as string;

  const archive = await fetch(`${baseUrl}/api/venues/${venueId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(archive.status, 204);

  const stored = await prisma.venue.findUniqueOrThrow({ where: { id: venueId } });
  assert.ok(stored.archivedAt);
  assert.equal(stored.status, "archived");

  const blockedEdit = await fetch(`${baseUrl}/api/venues/${venueId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Blocked" }),
  });
  assert.equal(blockedEdit.status, 409);

  const restore = await fetch(`${baseUrl}/api/venues/${venueId}/restore`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(restore.status, 200);
  assert.equal((await restore.json()).venue.archivedAt, null);
});

test("AVM-02 invalid hierarchy parent is rejected", async () => {
  const { token } = await bootstrapOrganizer("invalid-parent");
  const response = await fetch(`${baseUrl}/api/venues/nonexistent/buildings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Invalid" }),
  });
  assert.equal(response.status, 404);
});
