import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, setSubscription, createStall, bookFreeTicket, cleanupOrganizers, cleanupOrphanFreePayments } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
// A booking attempt that gets BLOCKED (409) still signs up its visitor
// user first — that signup succeeds regardless of the booking outcome, so
// it's tracked here explicitly rather than relying on cleanupOrganizers'
// ticketBooking-based discovery (which only finds buyers of bookings that
// actually got created).
const blockedVisitorUserIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await cleanupOrganizers(organizerIds);
  await cleanupOrphanFreePayments();
  if (blockedVisitorUserIds.length) await prisma.user.deleteMany({ where: { id: { in: blockedVisitorUserIds } } });
  await stop();
  await prisma.$disconnect();
});

async function createTicketType(exhibitionId: string, organizerToken: string, price = 0) {
  const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${organizerToken}` },
    body: JSON.stringify({ name: "General", price, quantity: 10000 }),
  }).then((r) => r.json());
  return res.ticket.id as string;
}

async function fillTicketBookingsDirectly(exhibitionId: string, ticketTypeId: string, count: number, paymentStatus: "paid" = "paid") {
  for (let i = 0; i < count; i++) {
    const payment = await prisma.payment.create({
      data: {
        amount: 0, currency: "INR", provider: "free", status: "paid",
        baseAmount: 0, organizerAmount: 0, pricingVersionId: "pv-legacy-unversioned",
      },
    });
    await prisma.ticketBooking.create({
      data: {
        exhibitionId, ticketTypeId, attendeeName: `Bulk ${ts}-${i}`, attendeeEmail: `bulk-${ts}-${i}@example.com`,
        quantity: 1, unitPrice: 0, amountPaid: 0, paymentStatus, paymentId: payment.id,
      },
    });
  }
}

// Test — visitor boundary + over-limit, at the real edge via the real API.
test("Starter allows exactly 1,000 visitor registrations, blocks the 1,001st", async () => {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "visitor-boundary", ts);
  organizerIds.push(organizerId);
  const ticketTypeId = await createTicketType(firstExhibitionId, token);

  await fillTicketBookingsDirectly(firstExhibitionId, ticketTypeId, 999);
  const booking1000 = await bookFreeTicket(baseUrl, firstExhibitionId, ticketTypeId, "v1000", ts);
  assert.equal(booking1000.status, 201, JSON.stringify(booking1000.body)); // 1000th — at the limit, allowed

  const booking1001 = await bookFreeTicket(baseUrl, firstExhibitionId, ticketTypeId, "v1001", ts);
  blockedVisitorUserIds.push(booking1001.userId);
  assert.equal(booking1001.status, 409, JSON.stringify(booking1001.body));
  assert.equal(booking1001.body.error.code, "PLAN_LIMIT_EXCEEDED");
  assert.equal(booking1001.body.error.resource, "visitor");
  assert.equal(booking1001.body.error.currentUsage, 1000);
  assert.equal(booking1001.body.error.limit, 1000);
});

// Test — scope: organizer-wide, across exhibitions (not per-exhibition).
test("visitor limit is organizer-wide: usage from one exhibition counts against a second exhibition's booking attempt", async () => {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "visitor-scope", ts);
  organizerIds.push(organizerId);
  // Growth's visitor limit (10,000) is too large to fill in a test; this
  // proves the organizer-wide SCOPE rule using Starter's smaller 1,000
  // limit instead. Moving to "active" (from "trialing") means completing
  // exhibition #1 frees a slot for exhibition #2 under Starter's own
  // eventLimit=1 (the ongoing capacity rule, not the one-time trial rule).
  await setSubscription(organizerId, "starter", "active");
  const ticketTypeId1 = await createTicketType(firstExhibitionId, token);
  await fillTicketBookingsDirectly(firstExhibitionId, ticketTypeId1, 1000); // fill via exhibition #1 entirely

  // Complete exhibition #1 (frees an EXHIBITION slot, not a visitor slot — visitor usage is historical and organizer-wide, so it should NOT reset).
  await prisma.exhibition.update({ where: { id: firstExhibitionId }, data: { status: "completed" } });
  const second = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: "Second Exhibition For Scope Test",
      status: "live",
      visibility: "public",
      venue: "Test Venue",
      city: "Test City",
      startDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
      ticketTypes: [{ name: "General", price: 0, quantity: 100 }],
      stalls: [],
    }),
  }).then((r) => r.json());
  assert.ok(second.exhibition?.id, `second exhibition should be creatable (Growth-active, first one completed): ${JSON.stringify(second)}`);

  const ticketTypeId2 = second.exhibition.ticketTypes[0].id as string;
  const blockedOnSecond = await bookFreeTicket(baseUrl, second.exhibition.id, ticketTypeId2, "cross-exhibition", ts);
  blockedVisitorUserIds.push(blockedOnSecond.userId);
  assert.equal(blockedOnSecond.status, 409, JSON.stringify(blockedOnSecond.body));
  assert.equal(blockedOnSecond.body.error.resource, "visitor");
});

// Test — failed/refunded bookings don't consume a visitor slot.
test("failed and refunded ticket bookings do not count toward the visitor limit", async () => {
  const { organizerId, firstExhibitionId, token } = await bootstrapOrganizer(baseUrl, "visitor-noncounting", ts);
  organizerIds.push(organizerId);
  const ticketTypeId = await createTicketType(firstExhibitionId, token);

  await fillTicketBookingsDirectly(firstExhibitionId, ticketTypeId, 1000, "paid");
  // At the limit already — a booking should be blocked now.
  const blocked = await bookFreeTicket(baseUrl, firstExhibitionId, ticketTypeId, "over", ts);
  blockedVisitorUserIds.push(blocked.userId);
  assert.equal(blocked.status, 409);

  // Mark one existing booking "failed" and one "refunded" — freeing 2 slots.
  const twoBookings = await prisma.ticketBooking.findMany({ where: { exhibitionId: firstExhibitionId }, take: 2 });
  await prisma.ticketBooking.update({ where: { id: twoBookings[0].id }, data: { paymentStatus: "failed" } });
  await prisma.ticketBooking.update({ where: { id: twoBookings[1].id }, data: { paymentStatus: "refunded" } });

  const allowed = await bookFreeTicket(baseUrl, firstExhibitionId, ticketTypeId, "after-freed", ts);
  assert.equal(allowed.status, 201, JSON.stringify(allowed.body));
});

// -------- Stalls --------

// Test — stall boundary + over-limit.
test("Starter allows exactly 25 stalls, blocks the 26th", async () => {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "stall-boundary", ts);
  organizerIds.push(organizerId);

  for (let i = 0; i < 24; i++) {
    const r = await createStall(baseUrl, token, firstExhibitionId);
    assert.equal(r.status, 201, JSON.stringify(r.body));
  }
  const stall25 = await createStall(baseUrl, token, firstExhibitionId);
  assert.equal(stall25.status, 201, JSON.stringify(stall25.body));

  const stall26 = await createStall(baseUrl, token, firstExhibitionId);
  assert.equal(stall26.status, 409, JSON.stringify(stall26.body));
  assert.equal(stall26.body.error.code, "PLAN_LIMIT_EXCEEDED");
  assert.equal(stall26.body.error.resource, "stall");
  assert.equal(stall26.body.error.currentUsage, 25);
  assert.equal(stall26.body.error.limit, 25);

  const count = await prisma.stall.count({ where: { exhibition: { organizerId } } });
  assert.equal(count, 25);
});

// Test — nested-array stall creation (during exhibition creation) is also checked, as a batch.
test("creating an exhibition with more stalls than the plan allows is rejected atomically (none created)", async () => {
  const email = `phase20c-stall-nested-${ts}@example.com`;
  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "testpass123", fullName: "Phase20C Stall Nested", userType: "exhibitor" }),
  }).then((r) => r.json());

  const stalls = Array.from({ length: 26 }, (_, i) => ({ price: 1000 + i }));
  const res = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${signup.token}` },
    body: JSON.stringify({
      name: "Too Many Stalls",
      status: "live",
      visibility: "public",
      venue: "Test Venue",
      city: "Test City",
      startDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
      ticketTypes: [],
      stalls,
    }),
  });
  const body = await res.json();
  assert.equal(res.status, 409, JSON.stringify(body));
  assert.equal(body.error.code, "PLAN_LIMIT_EXCEEDED");
  assert.equal(body.error.resource, "stall");

  // The exhibition-creation TRANSACTION must have been rolled back — no
  // exhibition, no stalls. The organizer/subscription bootstrap itself is a
  // separate, already-committed step (resolveOrganizerId runs before the
  // entitlement-checked transaction even starts — this is how organizer
  // bootstrap has always worked, not something this phase changed), so it
  // is queued for cleanup rather than asserted to not exist.
  const exhibitionCount = await prisma.exhibition.count({ where: { name: "Too Many Stalls" } });
  assert.equal(exhibitionCount, 0);

  const organizer = await prisma.organizer.findUnique({ where: { bootstrappedByUserId: signup.user.id } });
  assert.ok(organizer, "the organizer bootstrap itself must still have succeeded, independent of the rejected exhibition");
  organizerIds.push(organizer.id);
});

// Test — stall-reservation compatibility: entitlement checks don't interfere with the existing race-safe stall-selection flow.
test("existing stall reservation (select/reserve) concurrency is unaffected by entitlement checks", async () => {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "stall-reservation-compat", ts);
  organizerIds.push(organizerId);
  const stallRes = await createStall(baseUrl, token, firstExhibitionId, 5000);
  assert.equal(stallRes.status, 201);
  const stallId = stallRes.body.stall.id as string;

  // Approve two exhibitors, have both race for the SAME stall — the
  // existing stall-availability race guard (exhibitorParticipations.ts)
  // must still be the thing that decides the winner, not entitlement logic.
  const { applyAsExhibitor, approveParticipation } = await import("./helpers/entitlementFixtures");
  const a = await applyAsExhibitor(baseUrl, firstExhibitionId, "stall-race-a", ts);
  const b = await applyAsExhibitor(baseUrl, firstExhibitionId, "stall-race-b", ts);
  await approveParticipation(baseUrl, token, firstExhibitionId, a.participationId);
  await approveParticipation(baseUrl, token, firstExhibitionId, b.participationId);

  const select = (exhibitorToken: string, participationId: string) =>
    fetch(`${baseUrl}/api/exhibitor/participations/${participationId}/stall`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${exhibitorToken}` },
      body: JSON.stringify({ stallId }),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));

  const [ra, rb] = await Promise.all([select(a.token, a.participationId), select(b.token, b.participationId)]);
  const statuses = [ra.status, rb.status].sort();
  assert.deepEqual(statuses, [200, 409], `stall reservation race must still resolve to exactly one winner: ${JSON.stringify([ra.status, rb.status])}`);
});
