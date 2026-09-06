import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers, markExhibitionCompleted } from "./helpers/entitlementFixtures";
import { signupUser, cleanupOrphanPayments } from "./helpers/phase21bFixtures";

// Phase 23.4 — visitor registration / pre-checkout hardening. These tests
// cover the gaps the audit found in POST /api/bookings/tickets: a hidden
// (visible: false) ticket type was NOT excluded from booking creation even
// though it's excluded from every public read; there was no server-side
// ceiling on `quantity` beyond raw stock (the frontend's own "max 10" cap was
// UX-only); attendee fields had no trim/max-length validation; and a
// successful booking never wrote an audit record. Concurrency/last-ticket-
// race and basic stock enforcement are already covered by
// phase21cStockAndUpload.test.ts and are not duplicated here.

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const visitorUserIds: string[] = [];

let org: Awaited<ReturnType<typeof bootstrapOrganizer>>;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
  org = await bootstrapOrganizer(baseUrl, "bookinghardening", ts);
  organizerIds.push(org.organizerId);
});

after(async () => {
  await cleanupOrphanPayments();
  await prisma.ticketBooking.deleteMany({ where: { exhibitionId: org.firstExhibitionId } });
  await prisma.user.deleteMany({ where: { id: { in: visitorUserIds } } });
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

async function visitor(label: string) {
  const v = await signupUser(baseUrl, `phase234-${label}-${ts}@example.com`, `Phase234 ${label}`, "visitor");
  visitorUserIds.push(v.userId);
  return v;
}

async function createTicketType(organizerToken: string, exhibitionId: string, extra: Record<string, unknown> = {}) {
  const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${organizerToken}` },
    body: JSON.stringify({ name: "General", price: 0, quantity: 50, visible: true, ...extra }),
  });
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));
  return body.ticket.id as string;
}

test("a hidden (visible: false) ticket type cannot be booked, even with a known valid id", async () => {
  const v = await visitor("hidden");
  const hiddenTicketTypeId = await createTicketType(org.token, org.firstExhibitionId, { visible: false });

  const res = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${v.token}` },
    body: JSON.stringify({ exhibitionId: org.firstExhibitionId, ticketTypeId: hiddenTicketTypeId, attendeeName: "Hidden Test", attendeeEmail: `${v.userId}@example.com`, quantity: 1 }),
  });
  assert.equal(res.status, 404);

  const count = await prisma.ticketBooking.count({ where: { ticketTypeId: hiddenTicketTypeId } });
  assert.equal(count, 0);
});

test("quantity above the server-side per-booking cap is rejected, even though stock is plentiful", async () => {
  const v = await visitor("overcap");
  const ticketTypeId = await createTicketType(org.token, org.firstExhibitionId);

  const res = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${v.token}` },
    body: JSON.stringify({ exhibitionId: org.firstExhibitionId, ticketTypeId, attendeeName: "Over Cap", attendeeEmail: `${v.userId}@example.com`, quantity: 11 }),
  });
  assert.equal(res.status, 400);

  const atCap = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${v.token}` },
    body: JSON.stringify({ exhibitionId: org.firstExhibitionId, ticketTypeId, attendeeName: "At Cap", attendeeEmail: `${v.userId}@example.com`, quantity: 10 }),
  });
  assert.equal(atCap.status, 201, JSON.stringify(await atCap.json()));
});

test("a completed event cannot have new booking intents created against it", async () => {
  const v = await visitor("completed");
  const ticketTypeId = await createTicketType(org.token, org.firstExhibitionId);
  await markExhibitionCompleted(org.firstExhibitionId);
  try {
    const res = await fetch(`${baseUrl}/api/bookings/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${v.token}` },
      body: JSON.stringify({ exhibitionId: org.firstExhibitionId, ticketTypeId, attendeeName: "Completed Test", attendeeEmail: `${v.userId}@example.com`, quantity: 1 }),
    });
    assert.equal(res.status, 404);
  } finally {
    await prisma.exhibition.update({ where: { id: org.firstExhibitionId }, data: { status: "live" } });
  }
});

test("a draft (unpublished) event cannot have new booking intents created against it", async () => {
  const v = await visitor("draft");
  const ticketTypeId = await createTicketType(org.token, org.firstExhibitionId);
  await prisma.exhibition.update({ where: { id: org.firstExhibitionId }, data: { status: "draft" } });
  try {
    const res = await fetch(`${baseUrl}/api/bookings/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${v.token}` },
      body: JSON.stringify({ exhibitionId: org.firstExhibitionId, ticketTypeId, attendeeName: "Draft Test", attendeeEmail: `${v.userId}@example.com`, quantity: 1 }),
    });
    assert.equal(res.status, 404);
  } finally {
    await prisma.exhibition.update({ where: { id: org.firstExhibitionId }, data: { status: "live" } });
  }
});

test("a private (non-public visibility) event cannot have new booking intents created against it", async () => {
  const v = await visitor("private");
  const ticketTypeId = await createTicketType(org.token, org.firstExhibitionId);
  await prisma.exhibition.update({ where: { id: org.firstExhibitionId }, data: { visibility: "private" } });
  try {
    const res = await fetch(`${baseUrl}/api/bookings/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${v.token}` },
      body: JSON.stringify({ exhibitionId: org.firstExhibitionId, ticketTypeId, attendeeName: "Private Test", attendeeEmail: `${v.userId}@example.com`, quantity: 1 }),
    });
    assert.equal(res.status, 404);
  } finally {
    await prisma.exhibition.update({ where: { id: org.firstExhibitionId }, data: { visibility: "public" } });
  }
});

test("IDOR: a ticket type from one exhibition cannot be booked against a different exhibitionId in the request", async () => {
  const v = await visitor("crossevent");
  const otherOrg = await bootstrapOrganizer(baseUrl, "crosseventother", ts);
  organizerIds.push(otherOrg.organizerId);
  const ticketTypeId = await createTicketType(org.token, org.firstExhibitionId);

  const res = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${v.token}` },
    body: JSON.stringify({ exhibitionId: otherOrg.firstExhibitionId, ticketTypeId, attendeeName: "Cross Event", attendeeEmail: `${v.userId}@example.com`, quantity: 1 }),
  });
  assert.equal(res.status, 404);
});

test("a nonexistent ticket/exhibition id 404s without crashing the server (malformed/SQLi-shaped input)", async () => {
  const v = await visitor("malformed");
  const res = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${v.token}` },
    body: JSON.stringify({
      exhibitionId: "not-a-uuid; DROP TABLE ticket_types;",
      ticketTypeId: "00000000-0000-0000-0000-000000000000",
      attendeeName: "Malformed Test",
      attendeeEmail: `${v.userId}@example.com`,
      quantity: 1,
    }),
  });
  assert.equal(res.status, 404);
  const stillWorks = await prisma.ticketType.count();
  assert.ok(stillWorks >= 0);
});

test("an XSS-shaped attendeeName round-trips as inert data, never executed, and is trimmed", async () => {
  const v = await visitor("xss");
  const ticketTypeId = await createTicketType(org.token, org.firstExhibitionId);
  const payload = `  <script>window.__xss234=1</script>Real Name  `;

  const res = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${v.token}` },
    body: JSON.stringify({ exhibitionId: org.firstExhibitionId, ticketTypeId, attendeeName: payload, attendeeEmail: `${v.userId}@example.com`, quantity: 1 }),
  });
  assert.equal(res.status, 201, JSON.stringify(await res.json()));
  const { bookings } = await (await fetch(`${baseUrl}/api/bookings/tickets/mine`, { headers: { Authorization: `Bearer ${v.token}` } })).json();
  const created = bookings.find((b: { ticketTypeId: string }) => b.ticketTypeId === ticketTypeId);
  assert.ok(created, "booking must be readable back via GET /tickets/mine");
  assert.equal(created.attendeeName, payload.trim(), "server must trim but never sanitize/reject a script-shaped name — safety is the frontend's plain-text rendering, verified separately");
});

test("client-supplied price/total/userId fields are ignored — server always recomputes from its own data", async () => {
  const v = await visitor("clientprice");
  const ticketTypeId = await createTicketType(org.token, org.firstExhibitionId, { price: 500 });

  const res = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${v.token}` },
    body: JSON.stringify({
      exhibitionId: org.firstExhibitionId,
      ticketTypeId,
      attendeeName: "Client Price Test",
      attendeeEmail: `${v.userId}@example.com`,
      quantity: 1,
      // Not part of the schema at all — must be silently ignored, not
      // accepted as an override.
      price: 1,
      amount: 1,
      total: 1,
      buyerUserId: "00000000-0000-0000-0000-000000000000",
      organizerId: "00000000-0000-0000-0000-000000000000",
    }),
  });
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));
  assert.equal(Number(body.booking.unitPrice), 500, "unit price must come from the ticket type, never the client body");
  assert.equal(body.booking.buyerUserId, v.userId, "buyerUserId must be the authenticated caller, never a client-supplied value");
});

test("a successful booking creation writes an audit log entry", async () => {
  const v = await visitor("audit");
  const ticketTypeId = await createTicketType(org.token, org.firstExhibitionId);

  const res = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${v.token}` },
    body: JSON.stringify({ exhibitionId: org.firstExhibitionId, ticketTypeId, attendeeName: "Audit Test", attendeeEmail: `${v.userId}@example.com`, quantity: 1 }),
  });
  const body = await res.json();
  assert.equal(res.status, 201);

  const entry = await prisma.auditLog.findFirst({ where: { action: "booking.created", entityId: body.booking.id } });
  assert.ok(entry, "booking.created audit entry must exist");
  assert.equal(entry?.actorUserId, v.userId);
});

test("regression: quantity of exactly 1 (the minimum) still succeeds, and 0/negative are still rejected", async () => {
  const v = await visitor("minqty");
  const ticketTypeId = await createTicketType(org.token, org.firstExhibitionId);

  const zero = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${v.token}` },
    body: JSON.stringify({ exhibitionId: org.firstExhibitionId, ticketTypeId, attendeeName: "Zero Qty", attendeeEmail: `${v.userId}@example.com`, quantity: 0 }),
  });
  assert.equal(zero.status, 400);

  const negative = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${v.token}` },
    body: JSON.stringify({ exhibitionId: org.firstExhibitionId, ticketTypeId, attendeeName: "Negative Qty", attendeeEmail: `${v.userId}@example.com`, quantity: -1 }),
  });
  assert.equal(negative.status, 400);

  const one = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${v.token}` },
    body: JSON.stringify({ exhibitionId: org.firstExhibitionId, ticketTypeId, attendeeName: "One Qty", attendeeEmail: `${v.userId}@example.com`, quantity: 1 }),
  });
  assert.equal(one.status, 201, JSON.stringify(await one.json()));
});
