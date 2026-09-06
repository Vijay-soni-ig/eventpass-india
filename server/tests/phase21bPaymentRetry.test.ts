import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, applyAsExhibitor, approveParticipation, createStall, cleanupOrganizers } from "./helpers/entitlementFixtures";
import { selectStall, initiatePayment, mockComplete } from "./helpers/phase21bFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

/** Bootstraps an organizer + exhibition, applies+approves one exhibitor, creates a stall, and reserves it — i.e. gets the participation to exactly "stall_reserved", the state right before payment. */
async function setUpReservedStall(label: string) {
  const { organizerId, token: organizerToken, firstExhibitionId } = await bootstrapOrganizer(baseUrl, label, ts);
  organizerIds.push(organizerId);
  const { token: exhibitorToken, participationId } = await applyAsExhibitor(baseUrl, firstExhibitionId, `${label}-exhibitor`, ts);
  const approve = await approveParticipation(baseUrl, organizerToken, firstExhibitionId, participationId);
  assert.equal(approve.status, 200, JSON.stringify(approve.body));
  const stall = await createStall(baseUrl, organizerToken, firstExhibitionId, 4000);
  assert.equal(stall.status, 201, JSON.stringify(stall.body));
  const reserve = await selectStall(baseUrl, exhibitorToken, participationId, stall.body.stall.id);
  assert.equal(reserve.status, 200, JSON.stringify(reserve.body));
  return { organizerId, organizerToken, firstExhibitionId, exhibitorToken, participationId };
}

// Test — the original P0-1 bug: initiating payment moves the participation
// to payment_pending; retrying used to always 400 with "Select and reserve
// a stall before starting payment" because the endpoint only accepted
// stall_reserved. It must now succeed and hand back the SAME order.
test("retrying payment on a fresh payment_pending attempt returns the same order, never a duplicate", async () => {
  const { exhibitorToken, participationId } = await setUpReservedStall("retry-fresh");

  const first = await initiatePayment(baseUrl, exhibitorToken, participationId);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal((await prisma.exhibitionExhibitor.findUniqueOrThrow({ where: { id: participationId } })).status, "payment_pending");

  const retry = await initiatePayment(baseUrl, exhibitorToken, participationId);
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  assert.equal(retry.body.booking.id, first.body.booking.id, "a fresh, unresolved attempt must be resumed, not duplicated");
  assert.equal(retry.body.payment.id, first.body.payment.id);

  const bookingCount = await prisma.stallBooking.count({ where: { exhibitionExhibitorId: participationId } });
  assert.equal(bookingCount, 1, "no second StallBooking must have been created");
});

// Test — an already-succeeded payment must never be duplicated, even if the
// client somehow calls the initiate-payment endpoint again afterward.
test("retrying payment after success returns the paid booking, never opens a second attempt", async () => {
  const { exhibitorToken, participationId } = await setUpReservedStall("retry-paid");

  const first = await initiatePayment(baseUrl, exhibitorToken, participationId);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const complete = await mockComplete(baseUrl, exhibitorToken, first.body.payment.id, "success");
  assert.equal(complete.status, 200, JSON.stringify(complete.body));
  assert.equal(
    (await prisma.exhibitionExhibitor.findUniqueOrThrow({ where: { id: participationId } })).status,
    "confirmed",
    "a successful payment must confirm the participation"
  );

  const retry = await initiatePayment(baseUrl, exhibitorToken, participationId);
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  assert.equal(retry.body.alreadyPaid, true);
  assert.equal(retry.body.booking.id, first.body.booking.id);

  const bookingCount = await prisma.stallBooking.count({ where: { exhibitionExhibitorId: participationId } });
  assert.equal(bookingCount, 1, "a paid stall must never get a second payment attempt");
});

// Test — a genuinely stale/abandoned attempt (old, unresolved "created"
// payment) is retired and a fresh attempt opens — this is what actually
// unblocks an exhibitor whose first attempt was abandoned, the real-world
// scenario the P0-1 finding described.
test("retrying payment after the previous attempt goes stale opens a fresh attempt, cancelling the old one", async () => {
  const { exhibitorToken, participationId } = await setUpReservedStall("retry-stale");

  const first = await initiatePayment(baseUrl, exhibitorToken, participationId);
  assert.equal(first.status, 201, JSON.stringify(first.body));

  // Simulate the passage of time without ever resolving the attempt —
  // exactly what "abandoned checkout, no webhook ever arrives" looks like.
  await prisma.payment.update({
    where: { id: first.body.payment.id },
    data: { createdAt: new Date(Date.now() - 20 * 60 * 1000) },
  });

  const retry = await initiatePayment(baseUrl, exhibitorToken, participationId);
  assert.equal(retry.status, 201, JSON.stringify(retry.body));
  assert.notEqual(retry.body.booking.id, first.body.booking.id, "a stale attempt must be replaced, not resumed");

  const stalePayment = await prisma.payment.findUniqueOrThrow({ where: { id: first.body.payment.id } });
  assert.equal(stalePayment.status, "cancelled", "the stale attempt must be retired via the real payment transition");

  assert.equal(
    (await prisma.exhibitionExhibitor.findUniqueOrThrow({ where: { id: participationId } })).status,
    "payment_pending"
  );

  // Completing the FRESH attempt must still correctly confirm the
  // participation — the retry path must not have left it in a broken state.
  const complete = await mockComplete(baseUrl, exhibitorToken, retry.body.payment.id, "success");
  assert.equal(complete.status, 200, JSON.stringify(complete.body));
  assert.equal(
    (await prisma.exhibitionExhibitor.findUniqueOrThrow({ where: { id: participationId } })).status,
    "confirmed"
  );
});

// Test — a failed payment (the pre-existing, always-worked path) still
// reverts the participation to stall_reserved and allows a normal retry —
// regression guard that the Phase 21B change didn't disturb this.
test("retrying payment after an explicit failure still works exactly as before", async () => {
  const { exhibitorToken, participationId } = await setUpReservedStall("retry-failed");

  const first = await initiatePayment(baseUrl, exhibitorToken, participationId);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const fail = await mockComplete(baseUrl, exhibitorToken, first.body.payment.id, "failure");
  assert.equal(fail.status, 200, JSON.stringify(fail.body));
  assert.equal(
    (await prisma.exhibitionExhibitor.findUniqueOrThrow({ where: { id: participationId } })).status,
    "stall_reserved"
  );

  const retry = await initiatePayment(baseUrl, exhibitorToken, participationId);
  assert.equal(retry.status, 201, JSON.stringify(retry.body));
  assert.notEqual(retry.body.booking.id, first.body.booking.id);

  const complete = await mockComplete(baseUrl, exhibitorToken, retry.body.payment.id, "success");
  assert.equal(complete.status, 200, JSON.stringify(complete.body));
  assert.equal(
    (await prisma.exhibitionExhibitor.findUniqueOrThrow({ where: { id: participationId } })).status,
    "confirmed"
  );
});

// Test — an exhibitor cannot initiate payment for a participation that
// isn't stall_reserved or payment_pending (e.g. still just "approved").
test("initiating payment on an approved-but-not-reserved participation is still rejected", async () => {
  const { organizerId, token: organizerToken, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "retry-not-reserved", ts);
  organizerIds.push(organizerId);
  const { token: exhibitorToken, participationId } = await applyAsExhibitor(baseUrl, firstExhibitionId, "retry-not-reserved-ex", ts);
  const approve = await approveParticipation(baseUrl, organizerToken, firstExhibitionId, participationId);
  assert.equal(approve.status, 200, JSON.stringify(approve.body));

  const attempt = await initiatePayment(baseUrl, exhibitorToken, participationId);
  assert.equal(attempt.status, 400, JSON.stringify(attempt.body));
});
