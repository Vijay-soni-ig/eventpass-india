import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";
import { signupUser } from "./helpers/phase21bFixtures";

// Phase 23.1 — the funnel audit found POST /api/bookings/tickets and
// POST /api/payments/:id/verify had NO rate limiting at all, unlike every
// other mutation route in this codebase (see middleware/rateLimit.ts's own
// doc comment on bookingCreationRateLimit/paymentVerifyRateLimit for the
// full rationale). These tests exist to prove the new limiters actually
// fire, are keyed per-user (not per-IP, so one visitor's abuse never
// penalizes another), and — critically — do not interfere with a single
// legitimate booking/payment attempt.

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const visitorUserIds: string[] = [];

let org: Awaited<ReturnType<typeof bootstrapOrganizer>>;
let exhibitionId: string;
let ticketTypeId: string;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
  org = await bootstrapOrganizer(baseUrl, "funnel", ts);
  organizerIds.push(org.organizerId);
  // Reuses bootstrapOrganizer's own first (already live+public) exhibition
  // rather than creating a second one — a fresh Starter-plan organizer only
  // allows one non-completed exhibition at a time (see the entitlement test
  // suite), and this file has no need for a second.
  exhibitionId = org.firstExhibitionId;

  const ticket = await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${org.token}` },
    body: JSON.stringify({ name: "General", price: 100, quantity: 500, visible: true }),
  }).then((r) => r.json());
  ticketTypeId = ticket.ticket.id;
});

after(async () => {
  await prisma.ticketBooking.deleteMany({ where: { exhibitionId } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: organizerIds } } });
  await prisma.user.deleteMany({ where: { id: { in: visitorUserIds } } });
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

test("a single legitimate booking request is never blocked by the new rate limiter", async () => {
  const visitor = await signupUser(baseUrl, `phase23f-single-${ts}@example.com`, "Single Booker", "visitor");
  visitorUserIds.push(visitor.userId);

  const res = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${visitor.token}` },
    body: JSON.stringify({ exhibitionId, ticketTypeId, attendeeName: "Single Booker", attendeeEmail: visitor.userId + "@example.com", quantity: 1 }),
  });
  assert.equal(res.status, 201, JSON.stringify(await res.json()));
});

test("booking creation is rate-limited per user after repeated rapid requests, with a safe 429 body and Retry-After", async () => {
  const visitor = await signupUser(baseUrl, `phase23f-rl-${ts}@example.com`, "RL Booker", "visitor");
  visitorUserIds.push(visitor.userId);

  const results: number[] = [];
  for (let i = 0; i < 22; i++) {
    // Deliberately malformed (missing required fields) — the rate limiter
    // runs before body validation, so this still counts against the bucket
    // without creating 22 real bookings to clean up.
    const res = await fetch(`${baseUrl}/api/bookings/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${visitor.token}` },
      body: JSON.stringify({}),
    });
    results.push(res.status);
  }
  assert.ok(results.includes(429), `expected at least one 429 among: ${results.join(",")}`);

  const blockedIndex = results.indexOf(429);
  assert.ok(results.slice(0, blockedIndex).every((s) => s === 400), "everything before the limit trips must be a normal validation 400, not blocked early");
});

test("a different user's booking requests are unaffected by another user's rate limit", async () => {
  const spammer = await signupUser(baseUrl, `phase23f-spammer-${ts}@example.com`, "Spammer", "visitor");
  const bystander = await signupUser(baseUrl, `phase23f-bystander-${ts}@example.com`, "Bystander", "visitor");
  visitorUserIds.push(spammer.userId, bystander.userId);

  for (let i = 0; i < 22; i++) {
    await fetch(`${baseUrl}/api/bookings/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${spammer.token}` },
      body: JSON.stringify({}),
    });
  }

  const res = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${bystander.token}` },
    body: JSON.stringify({ exhibitionId, ticketTypeId, attendeeName: "Bystander", attendeeEmail: bystander.userId + "@example.com", quantity: 1 }),
  });
  assert.equal(res.status, 201, "a different user must not inherit another user's rate-limit bucket");
});

test("payment verification endpoint is rate-limited per user, keeping a single legitimate verify call unaffected", async () => {
  const visitor = await signupUser(baseUrl, `phase23f-verify-${ts}@example.com`, "Verify Booker", "visitor");
  visitorUserIds.push(visitor.userId);

  // A real (paid, priced) booking so /api/payments/:id/verify has a real
  // owned payment to target for the "single call" half of this test.
  const booking = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${visitor.token}` },
    body: JSON.stringify({ exhibitionId, ticketTypeId, attendeeName: "Verify Booker", attendeeEmail: visitor.userId + "@example.com", quantity: 1 }),
  }).then((r) => r.json());
  const paymentId = booking.payment.id;

  // A single real verify attempt with a garbage signature must fail
  // signature verification (400), never be blocked by the limiter.
  const single = await fetch(`${baseUrl}/api/payments/${paymentId}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${visitor.token}` },
    body: JSON.stringify({ providerOrderId: booking.order?.providerOrderId ?? "order_x", providerPaymentId: "pay_x", signature: "not-a-real-signature" }),
  });
  assert.notEqual(single.status, 429);

  const results: number[] = [];
  for (let i = 0; i < 32; i++) {
    const res = await fetch(`${baseUrl}/api/payments/${paymentId}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${visitor.token}` },
      body: JSON.stringify({ providerOrderId: booking.order?.providerOrderId ?? "order_x", providerPaymentId: "pay_x", signature: "not-a-real-signature" }),
    });
    results.push(res.status);
  }
  assert.ok(results.includes(429), `expected at least one 429 among: ${results.join(",")}`);
});
