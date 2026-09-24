import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

// ETX-EVENT-001C — verifies the "Exhibition created => Event exists =>
// Exhibition.eventId set => Event.exhibition points back" invariant holds
// continuously for newly created Exhibitions (not just via periodic
// backfill), and that PUT-time syncing never diverges. Exercises the real
// HTTP routes (not the underlying lib functions directly), since the whole
// point is verifying the routes wire the transaction correctly.

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});
after(async () => {
  await stop();
});

async function signupExhibitor(label: string) {
  const email = `evtx-${label}-${ts}@example.com`;
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "TestPassword123!", fullName: `EvtX ${label}`, userType: "exhibitor" }),
  }).then((r) => r.json());
  return { token: res.token as string, userId: res.user.id as string };
}

async function createExhibition(token: string, extra: Record<string, unknown> = {}) {
  const res = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: `EvtX Exhibition ${ts}`,
      category: "Automotive",
      description: "integration fixture",
      venue: "Test Venue",
      city: "Test City",
      startDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
      status: "draft",
      visibility: "public",
      ticketTypes: [],
      stalls: [],
      ...extra,
    }),
  });
  return { status: res.status, body: await res.json() };
}

test("Create Exhibition -> Event automatically created, Exhibition.eventId populated, atomically", async () => {
  const { token } = await signupExhibitor("create");
  const { status, body } = await createExhibition(token);
  assert.equal(status, 201);
  const exhibition = body.exhibition;
  assert.ok(exhibition.eventId, "Exhibition.eventId must be populated immediately on creation");

  const event = await prisma.event.findUniqueOrThrow({ where: { id: exhibition.eventId }, include: { exhibition: true, moduleEnablements: true } });
  assert.equal(event.exhibition?.id, exhibition.id, "Event.exhibition must point back to the same Exhibition");
  assert.equal(event.eventType, "EXHIBITION");
  assert.equal(event.title, exhibition.name);
  assert.equal(event.organizerId, exhibition.organizerId);
  assert.equal(event.ownerId, exhibition.ownerId);

  const moduleTypes = event.moduleEnablements.map((m) => m.moduleType).sort();
  assert.deepEqual(moduleTypes, ["EXHIBITORS", "FLOOR_PLAN", "STALL_BOOKING", "TICKETING"].sort(), "default Exhibition module bundle must be enabled automatically");
});

test("Existing Exhibition business logic still executes (publish-readiness gate still enforced) alongside Event linking", async () => {
  const { token } = await signupExhibitor("publish-gate");
  // status: live with no venue/city must still 400 — this proves the
  // Event-linking addition did not bypass or replace existing validation.
  const { status, body } = await createExhibition(token, { status: "live", venue: undefined, city: undefined });
  assert.equal(status, 400);
  assert.ok(body.missing?.includes("venue"));
});

test("Exhibition update syncs the linked Event's mirrored fields in the same transaction, and does not touch Exhibition-specific fields", async () => {
  const { token } = await signupExhibitor("update-sync");
  const { body: createBody } = await createExhibition(token);
  const exhibitionId = createBody.exhibition.id;
  const eventIdBefore = createBody.exhibition.eventId;

  const newStart = new Date(Date.now() + 86400000 * 10).toISOString().slice(0, 10);
  const newEnd = new Date(Date.now() + 86400000 * 12).toISOString().slice(0, 10);
  const putRes = await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "EvtX Renamed", category: "Fintech", venue: "New Venue", city: "New City", startDate: newStart, endDate: newEnd, status: "live" }),
  });
  assert.equal(putRes.status, 200);
  const updated = await putRes.json();
  assert.equal(updated.exhibition.eventId, eventIdBefore, "PUT must never reassign the Exhibition to a different Event");

  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventIdBefore }, include: { category: true } });
  assert.equal(event.title, "EvtX Renamed");
  assert.equal(event.venue, "New Venue");
  assert.equal(event.city, "New City");
  assert.equal(event.status, "PUBLISHED");
  assert.equal(event.category?.name, "Fintech");
  assert.equal(event.startDate?.toISOString().slice(0, 10), newStart);
  assert.equal(event.endDate?.toISOString().slice(0, 10), newEnd);

  // Exhibition-specific data (ticketTypes/stalls) is untouched by any of this.
  const exhibition = await prisma.exhibition.findUniqueOrThrow({ where: { id: exhibitionId }, include: { ticketTypes: true, stalls: true } });
  assert.deepEqual(exhibition.ticketTypes, []);
  assert.deepEqual(exhibition.stalls, []);
});

test("Duplicating an Exhibition creates and links a new Event with the duplicated Exhibition", async () => {
  const { token } = await signupExhibitor("duplicate-event");
  const { body: createBody } = await createExhibition(token, {
    name: "Original Exhibition",
    category: "Automotive",
    description: "duplicate fixture",
    ticketTypes: [],
  });
  const originalId = createBody.exhibition.id;
  const originalEventId = createBody.exhibition.eventId;

  // The trial/Starter entitlement permits one active exhibition. Mark the
  // source completed so this test exercises duplication itself rather than
  // being rejected by the commercial exhibition-capacity gate.
  await prisma.exhibition.update({ where: { id: originalId }, data: { status: "completed" } });

  const res = await fetch(baseUrl + "/api/exhibitions/" + originalId + "/duplicate", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
  });
  assert.equal(res.status, 201);

  const duplicate = (await res.json()).exhibition;
  assert.notEqual(duplicate.id, originalId);
  assert.notEqual(duplicate.eventId, originalEventId);
  assert.ok(duplicate.eventId, "duplicated Exhibition must have a paired Event");

  const [event, linkedExhibition] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: duplicate.eventId }, include: { exhibition: true } }),
    prisma.exhibition.findUniqueOrThrow({ where: { id: duplicate.id } }),
  ]);
  assert.equal(event.exhibition?.id, duplicate.id);
  assert.equal(event.eventType, "EXHIBITION");
  assert.equal(event.title, duplicate.name);
  assert.equal(event.organizerId, duplicate.organizerId);
  assert.equal(linkedExhibition.eventId, duplicate.eventId);
});
test("Repeated Exhibition updates never create a duplicate Event, and Exhibition.eventId never changes", async () => {
  const { token } = await signupExhibitor("no-dup");
  const { body: createBody } = await createExhibition(token);
  const exhibitionId = createBody.exhibition.id;
  const eventId = createBody.exhibition.eventId;
  const eventCountBefore = await prisma.event.count();

  for (let i = 0; i < 3; i++) {
    const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ description: `update pass ${i}` }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.exhibition.eventId, eventId);
  }

  const eventCountAfter = await prisma.event.count();
  assert.equal(eventCountAfter, eventCountBefore, "repeated updates must never create additional Event rows");
});

test("Every ticket type/stall creation on an Exhibition remains completely unaffected by Event linking", async () => {
  const { token } = await signupExhibitor("ticket-stall");
  const { body } = await createExhibition(token, {
    ticketTypes: [{ name: "General", price: 100, quantity: 50, taxPercent: 0, visible: true }],
    stalls: [{ code: "A1", price: 500 }],
  });
  assert.equal(body.exhibition.ticketTypes.length, 1);
  assert.equal(body.exhibition.stalls.length, 1);
  assert.ok(body.exhibition.eventId);

  const event = await prisma.event.findUniqueOrThrow({ where: { id: body.exhibition.eventId } });
  assert.ok(event, "the paired Event must still exist alongside real ticket/stall data");
});
