// AVM-10 availability and maintenance regression tests
import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => ({ baseUrl, stop } = await startTestServer()));
after(async () => { await stop(); });

async function bootstrap(label: string) {
  const r = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `avm10-${label}` },
    body: JSON.stringify({
      email: `avm10-${label}-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: `AVM10 ${label}`,
      userType: "exhibitor",
    }),
  });
  const b = await r.json();
  assert.equal(r.status, 201);
  await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${b.token}` },
    body: JSON.stringify({ name: `AVM10 bootstrap ${label} ${ts}`, status: "draft", visibility: "public", ticketTypes: [], stalls: [] }),
  });
  return b.token as string;
}

async function venue(token: string, label: string) {
  const r = await fetch(`${baseUrl}/api/venues`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: `AVM10 Venue ${label} ${ts}` }),
  });
  assert.equal(r.status, 201);
  return (await r.json()).venue.id as string;
}

test("AVM-10 availability lifecycle and date validation", async () => {
  const token = await bootstrap("availability");
  const venueId = await venue(token, "availability");
  const bad = await fetch(`${baseUrl}/api/venue-availability-maintenance/availability/venues/${venueId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Bad", startsAt: "2026-10-01T12:00:00Z", endsAt: "2026-10-01T11:00:00Z" }),
  });
  assert.equal(bad.status, 400);

  const r = await fetch(`${baseUrl}/api/venue-availability-maintenance/availability/venues/${venueId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Setup closure", type: "closed", startsAt: "2026-10-01T09:00:00Z", endsAt: "2026-10-01T12:00:00Z" }),
  });
  assert.equal(r.status, 201);
  const block = (await r.json()).block;
  const list = await fetch(`${baseUrl}/api/venue-availability-maintenance/availability/venues/${venueId}?status=active`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).blocks.length, 1);

  const patch = await fetch(`${baseUrl}/api/venue-availability-maintenance/availability/${block.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Updated closure" }),
  });
  assert.equal(patch.status, 200);

  const del = await fetch(`${baseUrl}/api/venue-availability-maintenance/availability/${block.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(del.status, 204);
  assert.equal((await prisma.venueAvailabilityBlock.findUniqueOrThrow({ where: { id: block.id } })).status, "archived");

  const restore = await fetch(`${baseUrl}/api/venue-availability-maintenance/availability/${block.id}/restore`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(restore.status, 200);
});

test("AVM-10 maintenance lifecycle and tenant isolation", async () => {
  const owner = await bootstrap("maintenance-owner");
  const other = await bootstrap("maintenance-other");
  const venueId = await venue(owner, "maintenance");
  const r = await fetch(`${baseUrl}/api/venue-availability-maintenance/maintenance/venues/${venueId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner}` },
    body: JSON.stringify({ title: "Annual inspection", type: "inspection", startsAt: "2026-10-02T09:00:00Z", endsAt: "2026-10-02T11:00:00Z" }),
  });
  assert.equal(r.status, 201);
  const block = (await r.json()).block;

  const denied = await fetch(`${baseUrl}/api/venue-availability-maintenance/maintenance/${block.id}`, { headers: { Authorization: `Bearer ${other}` } });
  assert.equal(denied.status, 404);

  const patch = await fetch(`${baseUrl}/api/venue-availability-maintenance/maintenance/${block.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner}` },
    body: JSON.stringify({ status: "in_progress" }),
  });
  assert.equal(patch.status, 200);

  const del = await fetch(`${baseUrl}/api/venue-availability-maintenance/maintenance/${block.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${owner}` },
  });
  assert.equal(del.status, 204);
});
