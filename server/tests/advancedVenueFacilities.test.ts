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
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `avm08-${label}` },
    body: JSON.stringify({ email: `avm08-${label}-${ts}@example.com`, password: "TestPassword123!", fullName: `AVM08 ${label}`, userType: "exhibitor" }),
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${body.token}` },
    body: JSON.stringify({ name: `AVM08 bootstrap ${label} ${ts}`, status: "draft", visibility: "public", ticketTypes: [], stalls: [] }),
  });
  return body.token as string;
}

async function makeVenue(token: string, label: string) {
  const response = await fetch(`${baseUrl}/api/venues`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: `AVM08 Venue ${label} ${ts}` }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).venue.id as string;
}

test("AVM-08 facilities: CRUD, location validation, filtering, archive and restore", async () => {
  const token = await bootstrap("crud");
  const venueId = await makeVenue(token, "crud");

  const buildingResponse = await fetch(`${baseUrl}/api/venues/${venueId}/buildings`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Main Building" }),
  });
  assert.equal(buildingResponse.status, 201);
  const buildingId = (await buildingResponse.json()).building.id as string;

  const floorResponse = await fetch(`${baseUrl}/api/venues/buildings/${buildingId}/floors`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Ground", level: 0 }),
  });
  assert.equal(floorResponse.status, 201);
  const floorId = (await floorResponse.json()).floor.id as string;

  const invalid = await fetch(`${baseUrl}/api/venue-facilities/venues/${venueId}/facilities`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Invalid", floorId: "00000000-0000-0000-0000-000000000000" }),
  });
  assert.equal(invalid.status, 400);

  const create = await fetch(`${baseUrl}/api/venue-facilities/venues/${venueId}/facilities`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "First Aid", code: "FA1", type: "first_aid", floorId, quantity: 2, isAccessible: true, isPublic: true }),
  });
  assert.equal(create.status, 201);
  const facility = (await create.json()).facility;
  assert.equal(facility.type, "first_aid");
  assert.equal(facility.quantity, 2);

  const list = await fetch(`${baseUrl}/api/venue-facilities/venues/${venueId}/facilities?q=aid&type=first_aid`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).facilities.length, 1);

  const patch = await fetch(`${baseUrl}/api/venue-facilities/facilities/${facility.id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ quantity: 3, isPublic: false }),
  });
  assert.equal(patch.status, 200);

  const archive = await fetch(`${baseUrl}/api/venue-facilities/facilities/${facility.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(archive.status, 204);
  assert.equal((await prisma.venueFacility.findUniqueOrThrow({ where: { id: facility.id } })).status, "archived");

  const restore = await fetch(`${baseUrl}/api/venue-facilities/facilities/${facility.id}/restore`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(restore.status, 200);
});

test("AVM-08 tenant isolation: another organizer cannot access facilities", async () => {
  const owner = await bootstrap("owner");
  const other = await bootstrap("other");
  const venueId = await makeVenue(owner, "owner");
  const create = await fetch(`${baseUrl}/api/venue-facilities/venues/${venueId}/facilities`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner}` },
    body: JSON.stringify({ name: "Information Desk", type: "information_desk" }),
  });
  assert.equal(create.status, 201);
  const id = (await create.json()).facility.id as string;

  const read = await fetch(`${baseUrl}/api/venue-facilities/venues/${venueId}/facilities`, { headers: { Authorization: `Bearer ${other}` } });
  assert.equal(read.status, 404);
  const patch = await fetch(`${baseUrl}/api/venue-facilities/facilities/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${other}` },
    body: JSON.stringify({ name: "Hacked" }),
  });
  assert.equal(patch.status, 404);
});
