import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers, bookFreeTicket, cleanupOrphanFreePayments } from "./helpers/entitlementFixtures";
import { createTicketType } from "./helpers/phase21bFixtures";

// UI-04 — no existing test verified that one visitor cannot read another
// visitor's ticket booking via GET /api/bookings/tickets/mine or the new
// GET /api/bookings/tickets/:id (added this phase for a "ticket details"
// page to deep-link/refresh against). Both routes filter by
// `buyerUserId: req.user!.id` from the authenticated session — these tests
// exist to prove that filter actually holds, not just that it's present in
// the source.

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const userIds: string[] = [];

let exhibitionId: string;
let ticketTypeId: string;
let bookingA: { userId: string; bookingId: string; token: string };
let bookingB: { userId: string; bookingId: string; token: string };

async function login(email: string) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "testpass123" }),
  });
  return (await res.json()).token as string;
}

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
  const org = await bootstrapOrganizer(baseUrl, "ui04-tickets", ts);
  organizerIds.push(org.organizerId);
  exhibitionId = org.firstExhibitionId;
  ticketTypeId = await createTicketType(baseUrl, org.token, exhibitionId, 0);

  const a = await bookFreeTicket(baseUrl, exhibitionId, ticketTypeId, "a", ts);
  assert.equal(a.status, 201, JSON.stringify(a.body));
  userIds.push(a.userId);
  bookingA = { userId: a.userId, bookingId: a.body.booking.id, token: await login(`phase20c-visitor-a-${ts}@example.com`) };

  const b = await bookFreeTicket(baseUrl, exhibitionId, ticketTypeId, "b", ts);
  assert.equal(b.status, 201, JSON.stringify(b.body));
  userIds.push(b.userId);
  bookingB = { userId: b.userId, bookingId: b.body.booking.id, token: await login(`phase20c-visitor-b-${ts}@example.com`) };
});

after(async () => {
  await prisma.ticketBooking.deleteMany({ where: { exhibitionId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await cleanupOrganizers(organizerIds);
  await cleanupOrphanFreePayments();
  await stop();
});

test("GET /tickets/:id — the owning visitor can fetch their own ticket detail", async () => {
  const res = await fetch(`${baseUrl}/api/bookings/tickets/${bookingA.bookingId}`, {
    headers: { Authorization: `Bearer ${bookingA.token}` },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.booking.id, bookingA.bookingId);
  assert.equal(body.booking.buyerUserId, bookingA.userId);
  assert.ok(body.booking.exhibition, "exhibition should be included");
  assert.ok(body.booking.ticketType, "ticketType should be included");
});

test("GET /tickets/:id — visitor A cannot fetch visitor B's ticket (404, not 403 — no existence leak)", async () => {
  const res = await fetch(`${baseUrl}/api/bookings/tickets/${bookingB.bookingId}`, {
    headers: { Authorization: `Bearer ${bookingA.token}` },
  });
  assert.equal(res.status, 404);
});

test("GET /tickets/:id — visitor B cannot fetch visitor A's ticket (symmetric)", async () => {
  const res = await fetch(`${baseUrl}/api/bookings/tickets/${bookingA.bookingId}`, {
    headers: { Authorization: `Bearer ${bookingB.token}` },
  });
  assert.equal(res.status, 404);
});

test("GET /tickets/:id — unauthenticated request is rejected", async () => {
  const res = await fetch(`${baseUrl}/api/bookings/tickets/${bookingA.bookingId}`);
  assert.equal(res.status, 401);
});

test("GET /tickets/:id — a nonexistent ticket id 404s safely, no crash", async () => {
  const res = await fetch(`${baseUrl}/api/bookings/tickets/does-not-exist`, {
    headers: { Authorization: `Bearer ${bookingA.token}` },
  });
  assert.equal(res.status, 404);
});

test("GET /tickets/:id — a malformed/injection-shaped ticket id is handled safely (no 500)", async () => {
  const payloads = ["'; DROP TABLE \"TicketBooking\"; --", "<script>alert(1)</script>", "../../etc/passwd", "%00", "a".repeat(5000)];
  for (const payload of payloads) {
    const res = await fetch(`${baseUrl}/api/bookings/tickets/${encodeURIComponent(payload)}`, {
      headers: { Authorization: `Bearer ${bookingA.token}` },
    });
    assert.equal(res.status, 404, `payload ${JSON.stringify(payload)} should safely 404, got ${res.status}`);
  }
});

test("GET /tickets/mine — each visitor sees only their own booking, never another visitor's", async () => {
  const resA = await fetch(`${baseUrl}/api/bookings/tickets/mine`, { headers: { Authorization: `Bearer ${bookingA.token}` } });
  const bodyA = await resA.json();
  assert.ok(bodyA.bookings.some((b: { id: string }) => b.id === bookingA.bookingId));
  assert.ok(!bodyA.bookings.some((b: { id: string }) => b.id === bookingB.bookingId), "visitor A's list must not include visitor B's ticket");

  const resB = await fetch(`${baseUrl}/api/bookings/tickets/mine`, { headers: { Authorization: `Bearer ${bookingB.token}` } });
  const bodyB = await resB.json();
  assert.ok(bodyB.bookings.some((b: { id: string }) => b.id === bookingB.bookingId));
  assert.ok(!bodyB.bookings.some((b: { id: string }) => b.id === bookingA.bookingId), "visitor B's list must not include visitor A's ticket");
});

test("GET /tickets/mine — unauthenticated request is rejected", async () => {
  const res = await fetch(`${baseUrl}/api/bookings/tickets/mine`);
  assert.equal(res.status, 401);
});

test("GET /tickets/:id/qr — visitor A cannot fetch visitor B's QR (existing route, re-confirmed)", async () => {
  const res = await fetch(`${baseUrl}/api/bookings/tickets/${bookingB.bookingId}/qr`, {
    headers: { Authorization: `Bearer ${bookingA.token}` },
  });
  assert.equal(res.status, 404);
});
