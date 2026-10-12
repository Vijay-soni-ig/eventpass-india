// AVM-12 Event <-> Venue integration regression tests
import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => { ({ baseUrl, stop } = await startTestServer()); });
after(async () => { await stop(); });

async function bootstrap(label: string) {
  const r = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `avm12-${label}` },
    body: JSON.stringify({
      email: `avm12-${label}-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: `AVM12 ${label}`,
      userType: "exhibitor",
    }),
  });
  const body = await r.json();
  assert.equal(r.status, 201);
  const exhibition = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${body.token}` },
    body: JSON.stringify({ name: `AVM12 bootstrap ${label} ${ts}`, status: "draft", visibility: "public", ticketTypes: [], stalls: [] }),
  });
  assert.equal(exhibition.status, 201);
  return { token: body.token as string, exhibitionId: (await exhibition.json()).exhibition.id as string };
}

async function createVenue(token: string, label: string) {
  const r = await fetch(`${baseUrl}/api/venues`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: `AVM12 Venue ${label} ${ts}`, address: "1 AVM12 Road", city: "Ahmedabad", state: "Gujarat", country: "India" }),
  });
  assert.equal(r.status, 201);
  return (await r.json()).venue.id as string;
}

test("AVM-12 non-Exhibition Event can reference an organizer-owned Venue", async () => {
  const { token } = await bootstrap("event");
  const venueId = await createVenue(token, "event");

  const create = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: "AVM12 Conference",
      startDate: "2026-10-10",
      endDate: "2026-10-11",
      venue: "Legacy venue text",
      city: "Ahmedabad",
      venueId,
    }),
  });
  assert.equal(create.status, 201);
  const event = (await create.json()).event;
  assert.equal(event.venueId, venueId);
  assert.equal(event.physicalVenue.id, venueId);

  const update = await fetch(`${baseUrl}/api/events/${event.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ venueId: null }),
  });
  assert.equal(update.status, 200);
  assert.equal((await update.json()).event.venueId, null);
});

test("AVM-12 Exhibition Venue selection is propagated to its paired Event", async () => {
  const { token, exhibitionId } = await bootstrap("exhibition");
  const venueId = await createVenue(token, "exhibition");

  const updateInitial = await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ venueId }),
  });
  assert.equal(updateInitial.status, 200);

  const exhibitionRead = await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(exhibitionRead.status, 200);
  const exhibition = (await exhibitionRead.json()).exhibition;
  assert.ok(exhibition.eventId);

  const read = await fetch(`${baseUrl}/api/events/${exhibition.eventId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(read.status, 200);
  assert.equal((await read.json()).event.venueId, venueId);

  const venue2 = await createVenue(token, "exhibition-2");
  const update = await fetch(`${baseUrl}/api/exhibitions/${exhibition.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ venueId: venue2 }),
  });
  assert.equal(update.status, 200);

  const readUpdated = await fetch(`${baseUrl}/api/events/${exhibition.eventId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(readUpdated.status, 200);
  assert.equal((await readUpdated.json()).event.venueId, venue2);
});

test("AVM-12 cross-tenant Venue assignment is rejected", async () => {
  const { token: owner } = await bootstrap("owner");
  const { token: other } = await bootstrap("other");
  const foreignVenueId = await createVenue(owner, "foreign");

  const create = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${other}` },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: "Cross Tenant Event",
      startDate: "2026-10-10",
      endDate: "2026-10-11",
      venue: "Legacy venue text",
      city: "Ahmedabad",
      venueId: foreignVenueId,
    }),
  });
  assert.equal(create.status, 400);
  assert.match((await create.json()).error, /active Venue owned by this organizer/);
});

test("AVM-12 cross-tenant Venue reassignment is rejected without changing the Event", async () => {
  const { token: venueOwner } = await bootstrap("patch-venue-owner");
  const { token: eventOwner } = await bootstrap("patch-event-owner");
  const foreignVenueId = await createVenue(venueOwner, "foreign-patch");

  const create = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${eventOwner}` },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: "Cross Tenant Venue Patch",
      startDate: "2026-10-10",
      endDate: "2026-10-11",
      venue: "Own venue text",
      city: "Ahmedabad",
    }),
  });
  assert.equal(create.status, 201);
  const createdBody = await create.json();
  const event = createdBody.event as { id: string; venueId: string | null };
  assert.equal(event.venueId, null);

  const patch = await fetch(`${baseUrl}/api/events/${event.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${eventOwner}` },
    body: JSON.stringify({ venueId: foreignVenueId }),
  });
  assert.equal(patch.status, 400);
  const patchBody = await patch.json();
  assert.match(patchBody.error, /active Venue owned by this organizer/);

  const read = await fetch(`${baseUrl}/api/events/${event.id}`, {
    headers: { Authorization: `Bearer ${eventOwner}` },
  });
  assert.equal(read.status, 200);
  const persisted = (await read.json()).event as { venueId: string | null };
  assert.equal(persisted.venueId, null, "a rejected foreign Venue assignment must not mutate the Event");
});
