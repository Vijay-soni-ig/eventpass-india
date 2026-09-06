import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";
import { createTicketType, bookTicket, signupUser, cleanupOrphanPayments } from "./helpers/phase21bFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const visitorUserIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await cleanupOrphanPayments();
  await prisma.user.deleteMany({ where: { id: { in: visitorUserIds } } });
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

async function setUp(label: string, price = 500) {
  const { organizerId, token: organizerToken, firstExhibitionId } = await bootstrapOrganizer(baseUrl, label, ts);
  organizerIds.push(organizerId);
  const ticketTypeId = await createTicketType(baseUrl, organizerToken, firstExhibitionId, price);
  const { userId, token } = await signupUser(baseUrl, `phase21b-idem-${label}-${ts}@example.com`, `Idem ${label}`, "visitor");
  visitorUserIds.push(userId);
  return { firstExhibitionId, ticketTypeId, token };
}

// Test — same key, sent sequentially, must resolve to the exact same
// booking rather than creating a second one.
test("the same idempotency key sent twice sequentially returns the same booking both times", async () => {
  const { firstExhibitionId, ticketTypeId, token } = await setUp("sequential");
  const key = `phase21b-key-sequential-${ts}`;

  const first = await bookTicket(baseUrl, token, firstExhibitionId, ticketTypeId, "a@example.com", key);
  assert.equal(first.status, 201, JSON.stringify(first.body));

  const second = await bookTicket(baseUrl, token, firstExhibitionId, ticketTypeId, "a@example.com", key);
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.equal(second.body.booking.id, first.body.booking.id);
  assert.equal(second.body.replayed, true);

  const count = await prisma.ticketBooking.count({ where: { exhibitionId: firstExhibitionId, ticketTypeId } });
  assert.equal(count, 1, "only one TicketBooking must exist for this key");
});

// Test — the same key sent concurrently (the actual race a double-click or
// a network retry produces) must still resolve to exactly one booking.
test("the same idempotency key sent concurrently produces exactly one booking", async () => {
  const { firstExhibitionId, ticketTypeId, token } = await setUp("concurrent");
  const key = `phase21b-key-concurrent-${ts}`;

  const [a, b] = await Promise.all([
    bookTicket(baseUrl, token, firstExhibitionId, ticketTypeId, "b@example.com", key),
    bookTicket(baseUrl, token, firstExhibitionId, ticketTypeId, "b@example.com", key),
  ]);

  assert.ok([a.status, b.status].includes(201), "one of the two concurrent requests must have created the booking");
  assert.equal(a.body.booking.id, b.body.booking.id, "both concurrent requests must resolve to the same booking id");

  const count = await prisma.ticketBooking.count({ where: { exhibitionId: firstExhibitionId, ticketTypeId } });
  assert.equal(count, 1, "a concurrent double-submit under one key must still leave exactly one booking");
});

// Test — different keys are different intents and must each get their own
// booking (this is what makes an idempotency key safe: it never silently
// blocks a genuinely new purchase).
test("different idempotency keys create separate bookings", async () => {
  const { firstExhibitionId, ticketTypeId, token } = await setUp("different-keys");

  const first = await bookTicket(baseUrl, token, firstExhibitionId, ticketTypeId, "c@example.com", `phase21b-key-a-${ts}`);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const second = await bookTicket(baseUrl, token, firstExhibitionId, ticketTypeId, "c@example.com", `phase21b-key-b-${ts}`);
  assert.equal(second.status, 201, JSON.stringify(second.body));

  assert.notEqual(first.body.booking.id, second.body.booking.id);
  const count = await prisma.ticketBooking.count({ where: { exhibitionId: firstExhibitionId, ticketTypeId } });
  assert.equal(count, 2);
});

// Test — documented behavior for a request with NO key at all: no dedup
// protection is applied (the pre-existing behavior is preserved, not
// silently changed) — two identical keyless requests create two bookings.
test("a request with no idempotency key gets no dedup protection (documented, pre-existing behavior)", async () => {
  const { firstExhibitionId, ticketTypeId, token } = await setUp("no-key");

  const first = await bookTicket(baseUrl, token, firstExhibitionId, ticketTypeId, "d@example.com");
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const second = await bookTicket(baseUrl, token, firstExhibitionId, ticketTypeId, "d@example.com");
  assert.equal(second.status, 201, JSON.stringify(second.body));

  assert.notEqual(first.body.booking.id, second.body.booking.id);
});

// Test — a free (₹0) ticket booking is also covered by the same dedup path.
test("idempotency also protects free ticket bookings", async () => {
  const { firstExhibitionId, ticketTypeId, token } = await setUp("free-ticket", 0);
  const key = `phase21b-key-free-${ts}`;

  const first = await bookTicket(baseUrl, token, firstExhibitionId, ticketTypeId, "e@example.com", key);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(first.body.booking.paymentStatus, "paid");

  const second = await bookTicket(baseUrl, token, firstExhibitionId, ticketTypeId, "e@example.com", key);
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.equal(second.body.booking.id, first.body.booking.id);
});

// Test — cross-user reuse of the identical key string must never expose or
// merge with another user's booking (the (buyerUserId, idempotencyKey)
// scoping is what guarantees this).
test("two different users using the identical key string get their own separate bookings", async () => {
  const { firstExhibitionId, ticketTypeId, token: tokenA } = await setUp("cross-user-a");
  const { userId: userIdB, token: tokenB } = await signupUser(baseUrl, `phase21b-idem-cross-user-b-${ts}@example.com`, "Cross User B", "visitor");
  visitorUserIds.push(userIdB);

  const sharedKey = `phase21b-shared-key-${ts}`;
  const bookingA = await bookTicket(baseUrl, tokenA, firstExhibitionId, ticketTypeId, "f1@example.com", sharedKey);
  assert.equal(bookingA.status, 201, JSON.stringify(bookingA.body));
  const bookingB = await bookTicket(baseUrl, tokenB, firstExhibitionId, ticketTypeId, "f2@example.com", sharedKey);
  assert.equal(bookingB.status, 201, JSON.stringify(bookingB.body));

  assert.notEqual(bookingA.body.booking.id, bookingB.body.booking.id);
});

// Test — a "malicious"/changed payload replayed under the same key does not
// create a second booking or silently overwrite the original attendee
// details; the original booking is always what's returned.
test("a changed payload under the same key is ignored in favor of the original booking", async () => {
  const { firstExhibitionId, ticketTypeId, token } = await setUp("changed-payload");
  const key = `phase21b-key-changed-${ts}`;

  const first = await bookTicket(baseUrl, token, firstExhibitionId, ticketTypeId, "original@example.com", key);
  assert.equal(first.status, 201, JSON.stringify(first.body));

  const replay = await bookTicket(baseUrl, token, firstExhibitionId, ticketTypeId, "attacker-changed@example.com", key);
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.booking.id, first.body.booking.id);
  assert.equal(replay.body.booking.attendeeEmail, "original@example.com", "the original attendee details must win, never the replayed payload");
});
