import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => { ({ baseUrl, stop } = await startTestServer()); });
after(async () => { await stop(); });

async function bootstrap(label: string) {
  const signup = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `avm12d-${label}-${ts}` },
    body: JSON.stringify({
      email: `avm12d-${label}-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: `AVM12D ${label}`,
      userType: "exhibitor",
    }),
  });
  const body = await signup.json();
  assert.equal(signup.status, 201);

  const exhibition = await fetch(baseUrl + "/api/exhibitions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${body.token}` },
    body: JSON.stringify({
      name: `AVM12D Bootstrap ${label} ${ts}`,
      status: "draft",
      visibility: "public",
      ticketTypes: [],
      stalls: [],
    }),
  });
  assert.equal(exhibition.status, 201);
  return body.token as string;
}

async function createVenue(token: string, label: string) {
  const response = await fetch(baseUrl + "/api/venues", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: `AVM12D Venue ${label} ${ts}`, city: "Ahmedabad" }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).venue.id as string;
}

async function createEvent(token: string, venueId: string, label: string) {
  const response = await fetch(baseUrl + "/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: `AVM12D Event ${label} ${ts}`,
      startDate: "2026-10-10",
      endDate: "2026-10-11",
      venue: "Legacy Venue Text",
      city: "Ahmedabad",
      venueId,
    }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).event.id as string;
}

test("AVM-12D blocks Event publish when a venue-wide availability closure overlaps", async () => {
  const token = await bootstrap("availability");
  const venueId = await createVenue(token, "availability");

  const block = await fetch(baseUrl + "/api/venue-availability-maintenance/availability/venues/" + venueId, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: "Venue closed for private booking",
      type: "closed",
      startsAt: "2026-10-11T10:00:00.000Z",
      endsAt: "2026-10-11T12:00:00.000Z",
    }),
  });
  assert.equal(block.status, 201);

  const eventId = await createEvent(token, venueId, "availability");
  const publish = await fetch(baseUrl + "/api/events/" + eventId + "/publish", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(publish.status, 409);
  const payload = await publish.json();
  assert.match(payload.error, /venue-wide scheduling conflict/i);
  assert.equal(payload.conflicts.length, 1);
  assert.equal(payload.conflicts[0].kind, "availability");
});

test("AVM-12D allows Event publish after the conflicting availability block is archived", async () => {
  const token = await bootstrap("archive");
  const venueId = await createVenue(token, "archive");

  const block = await fetch(baseUrl + "/api/venue-availability-maintenance/availability/venues/" + venueId, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: "Temporary closure",
      type: "unavailable",
      startsAt: "2026-10-10T00:00:00.000Z",
      endsAt: "2026-10-10T23:59:59.000Z",
    }),
  });
  assert.equal(block.status, 201);
  const blockId = (await block.json()).block.id as string;

  const eventId = await createEvent(token, venueId, "archive");
  const blocked = await fetch(baseUrl + "/api/events/" + eventId + "/publish", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(blocked.status, 409);

  const archive = await fetch(baseUrl + "/api/venue-availability-maintenance/availability/" + blockId, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(archive.status, 204);

  const publish = await fetch(baseUrl + "/api/events/" + eventId + "/publish", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(publish.status, 200);
  assert.equal((await publish.json()).event.status, "PUBLISHED");
});

test("AVM-12D blocks Event publish for active venue-wide maintenance", async () => {
  const token = await bootstrap("maintenance");
  const venueId = await createVenue(token, "maintenance");

  const maintenance = await fetch(baseUrl + "/api/venue-availability-maintenance/maintenance/venues/" + venueId, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      title: "Safety inspection",
      type: "safety",
      status: "scheduled",
      startsAt: "2026-10-09T00:00:00.000Z",
      endsAt: "2026-10-12T00:00:00.000Z",
    }),
  });
  assert.equal(maintenance.status, 201);

  const eventId = await createEvent(token, venueId, "maintenance");
  const publish = await fetch(baseUrl + "/api/events/" + eventId + "/publish", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(publish.status, 409);
  const payload = await publish.json();
  assert.equal(payload.conflicts[0].kind, "maintenance");
});

test("AVM-12D ignores completed/cancelled maintenance and non-blocking availability types", async () => {
  const token = await bootstrap("nonblocking");
  const venueId = await createVenue(token, "nonblocking");

  for (const body of [
    {
      title: "Completed inspection",
      type: "inspection",
      status: "completed",
      startsAt: "2026-10-09T00:00:00.000Z",
      endsAt: "2026-10-12T00:00:00.000Z",
    },
    {
      title: "Cancelled repair",
      type: "repair",
      status: "cancelled",
      startsAt: "2026-10-09T00:00:00.000Z",
      endsAt: "2026-10-12T00:00:00.000Z",
    },
  ]) {
    const response = await fetch(baseUrl + "/api/venue-availability-maintenance/maintenance/venues/" + venueId, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 201);
  }

  const otherAvailability = await fetch(baseUrl + "/api/venue-availability-maintenance/availability/venues/" + venueId, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: "Other administrative note",
      type: "other",
      startsAt: "2026-10-09T00:00:00.000Z",
      endsAt: "2026-10-12T00:00:00.000Z",
    }),
  });
  assert.equal(otherAvailability.status, 201);

  const eventId = await createEvent(token, venueId, "nonblocking");
  const publish = await fetch(baseUrl + "/api/events/" + eventId + "/publish", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(publish.status, 200);
});
