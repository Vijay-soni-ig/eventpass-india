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
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `avm07-${label}` },
    body: JSON.stringify({ email: `avm07-${label}-${ts}@example.com`, password: "TestPassword123!", fullName: `AVM07 ${label}`, userType: "exhibitor" }),
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${body.token}` },
    body: JSON.stringify({ name: `AVM07 bootstrap ${label} ${ts}`, status: "draft", visibility: "public", ticketTypes: [], stalls: [] }),
  });
  return body.token as string;
}

async function makeVenue(token: string, label: string) {
  const response = await fetch(`${baseUrl}/api/venues`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: `AVM07 Venue ${label} ${ts}` }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).venue.id as string;
}

test("AVM-07 parking: CRUD, filtering, validation, archive and restore", async () => {
  const token = await bootstrap("crud");
  const venueId = await makeVenue(token, "crud");

  const invalid = await fetch(`${baseUrl}/api/venue-parking/venues/${venueId}/parking`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Main", totalSpaces: 10, accessibleSpaces: 11 }),
  });
  assert.equal(invalid.status, 400);

  const create = await fetch(`${baseUrl}/api/venue-parking/venues/${venueId}/parking`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Main Parking", code: "P1", type: "covered", totalSpaces: 200, accessibleSpaces: 8, evChargingSpaces: 12 }),
  });
  assert.equal(create.status, 201);
  const parking = (await create.json()).parkingArea;
  assert.equal(parking.totalSpaces, 200);
  assert.equal(parking.type, "covered");

  const list = await fetch(`${baseUrl}/api/venue-parking/venues/${venueId}/parking?q=main`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).parkingAreas.length, 1);

  const patch = await fetch(`${baseUrl}/api/venue-parking/parking/${parking.id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ totalSpaces: 250, evChargingSpaces: 20 }),
  });
  assert.equal(patch.status, 200);

  const archive = await fetch(`${baseUrl}/api/venue-parking/parking/${parking.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(archive.status, 204);
  assert.equal((await prisma.venueParkingArea.findUniqueOrThrow({ where: { id: parking.id } })).status, "archived");

  const restore = await fetch(`${baseUrl}/api/venue-parking/parking/${parking.id}/restore`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(restore.status, 200);
});

test("AVM-07 tenant isolation: another organizer cannot access parking", async () => {
  const owner = await bootstrap("owner");
  const other = await bootstrap("other");
  const venueId = await makeVenue(owner, "owner");
  const create = await fetch(`${baseUrl}/api/venue-parking/venues/${venueId}/parking`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner}` },
    body: JSON.stringify({ name: "Visitor Parking", totalSpaces: 100 }),
  });
  assert.equal(create.status, 201);
  const id = (await create.json()).parkingArea.id as string;
  const read = await fetch(`${baseUrl}/api/venue-parking/venues/${venueId}/parking`, { headers: { Authorization: `Bearer ${other}` } });
  assert.equal(read.status, 404);
  const patch = await fetch(`${baseUrl}/api/venue-parking/parking/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${other}` },
    body: JSON.stringify({ name: "Hacked" }),
  });
  assert.equal(patch.status, 404);
});
