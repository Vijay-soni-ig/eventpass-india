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
    method: "POST", headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `avm06-${label}` },
    body: JSON.stringify({ email: `avm06-${label}-${ts}@example.com`, password: "TestPassword123!", fullName: `AVM06 ${label}`, userType: "exhibitor" }),
  });
  const body = await response.json(); assert.equal(response.status, 201);
  await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${body.token}` },
    body: JSON.stringify({ name: `AVM06 bootstrap ${label} ${ts}`, status: "draft", visibility: "public", ticketTypes: [], stalls: [] }),
  });
  return body.token as string;
}

async function makeVenue(token: string, label: string) {
  const venue = (await (await fetch(`${baseUrl}/api/venues`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: `AVM06 Venue ${label} ${ts}` }) })).json()).venue;
  const building = (await (await fetch(`${baseUrl}/api/venues/${venue.id}/buildings`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: "Main" }) })).json()).building;
  const floor = (await (await fetch(`${baseUrl}/api/venues/buildings/${building.id}/floors`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: "Ground", level: 0 }) })).json()).floor;
  return { venueId: venue.id as string, floorId: floor.id as string };
}

test("AVM-06 entrances: CRUD, filtering, floor validation, archive and restore", async () => {
  const token = await bootstrap("crud");
  const { venueId, floorId } = await makeVenue(token, "crud");

  const badFloor = await fetch(`${baseUrl}/api/venue-entrances/venues/${venueId}/entrances`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "North", floorId: "00000000-0000-0000-0000-000000000000" }),
  });
  assert.equal(badFloor.status, 400);

  const create = await fetch(`${baseUrl}/api/venue-entrances/venues/${venueId}/entrances`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "North", code: "N", type: "main", floorId, isAccessible: true }),
  });
  assert.equal(create.status, 201);
  const entrance = (await create.json()).entrance;
  assert.equal(entrance.type, "main");

  const list = await fetch(`${baseUrl}/api/venue-entrances/venues/${venueId}/entrances?q=nor`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(list.status, 200); assert.equal((await list.json()).entrances.length, 1);

  const patch = await fetch(`${baseUrl}/api/venue-entrances/entrances/${entrance.id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ isEmergencyExit: true, type: "emergency" }),
  });
  assert.equal(patch.status, 200);

  const archive = await fetch(`${baseUrl}/api/venue-entrances/entrances/${entrance.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(archive.status, 204);
  assert.equal((await prisma.venueEntrance.findUniqueOrThrow({ where: { id: entrance.id } })).status, "archived");

  const restore = await fetch(`${baseUrl}/api/venue-entrances/entrances/${entrance.id}/restore`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(restore.status, 200);
});

test("AVM-06 tenant isolation: another organizer cannot access entrances", async () => {
  const owner = await bootstrap("owner");
  const other = await bootstrap("other");
  const { venueId } = await makeVenue(owner, "owner");
  const create = await fetch(`${baseUrl}/api/venue-entrances/venues/${venueId}/entrances`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner}` },
    body: JSON.stringify({ name: "Public Gate", code: "PG" }),
  });
  assert.equal(create.status, 201);
  const id = (await create.json()).entrance.id as string;
  const read = await fetch(`${baseUrl}/api/venue-entrances/venues/${venueId}/entrances`, { headers: { Authorization: `Bearer ${other}` } });
  assert.equal(read.status, 404);
  const patch = await fetch(`${baseUrl}/api/venue-entrances/entrances/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${other}` },
    body: JSON.stringify({ name: "Hacked" }),
  });
  assert.equal(patch.status, 404);
});
