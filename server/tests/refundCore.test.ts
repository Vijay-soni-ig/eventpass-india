import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

// Cleanup bookkeeping.
const createdUserIds: string[] = [];
const createdTicketBookingIds: string[] = [];
const createdStallBookingIds: string[] = [];
let stallParticipationId: string | undefined;
let exhibitorBusinessUserId: string | undefined;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  // Resolve payment ids BEFORE deleting the bookings that point to them —
  // the relation-based lookup below only works while those bookings still
  // exist.
  const paymentIds = (
    await prisma.payment.findMany({
      where: { OR: [{ ticketBooking: { id: { in: createdTicketBookingIds } } }, { stallBooking: { id: { in: createdStallBookingIds } } }] },
      select: { id: true },
    })
  ).map((p) => p.id);

  if (createdTicketBookingIds.length) await prisma.ticketBooking.deleteMany({ where: { id: { in: createdTicketBookingIds } } });
  if (createdStallBookingIds.length) await prisma.stallBooking.deleteMany({ where: { id: { in: createdStallBookingIds } } });
  if (stallParticipationId) {
    await prisma.stall.updateMany({ where: { exhibitionExhibitorId: stallParticipationId }, data: { status: "available", exhibitionExhibitorId: null } });
    await prisma.exhibitionExhibitor.deleteMany({ where: { id: stallParticipationId } });
  }
  // Refunds/payments cascade-clean via their owning booking's payment id —
  // delete payments explicitly since Refund has onDelete: Restrict.
  if (paymentIds.length) {
    await prisma.refund.deleteMany({ where: { paymentId: { in: paymentIds } } });
    await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
  }
  if (exhibitorBusinessUserId) {
    await prisma.exhibitorMembership.deleteMany({ where: { userId: exhibitorBusinessUserId } });
    await prisma.exhibitorBusiness.deleteMany({ where: { ownerId: exhibitorBusinessUserId } });
  }
  if (createdUserIds.length) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await stop();
  await prisma.$disconnect();
});

async function login(email: string, password = "DevPassword123!") {
  const r = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then((res) => res.json());
  assert.ok(r.token, `login must succeed for ${email}: ${JSON.stringify(r)}`);
  return r.token as string;
}

async function createPaidTicket(ticketTypeId: string, label: string) {
  const email = `phase19b-${label}-${ts}@example.com`;
  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "testpass123", fullName: `Phase19B ${label}`, userType: "visitor" }),
  }).then((r) => r.json());
  createdUserIds.push(signup.user.id);

  const booking = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${signup.token}` },
    body: JSON.stringify({
      exhibitionId: "seed-exhibition-1",
      ticketTypeId,
      attendeeName: `Phase19B ${label}`,
      attendeeEmail: email,
      quantity: 1,
    }),
  }).then((r) => r.json());
  createdTicketBookingIds.push(booking.booking.id);

  await fetch(`${baseUrl}/api/payments/${booking.payment.id}/mock-complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${signup.token}` },
    body: JSON.stringify({ outcome: "success" }),
  }).then((r) => r.json());

  const paidPayment = await prisma.payment.findUniqueOrThrow({ where: { id: booking.payment.id } });
  return { bookingId: booking.booking.id, paymentId: booking.payment.id, payment: paidPayment };
}

/** Fresh exhibitor business + a paid stall payment, isolated from every other test file's fixtures (own stall, own participation). */
async function createPaidStall() {
  const email = `phase19b-stallbiz-${ts}@example.com`;
  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "testpass123", fullName: "Phase19B Stall Biz", userType: "exhibitor" }),
  }).then((r) => r.json());
  exhibitorBusinessUserId = signup.user.id;
  createdUserIds.push(signup.user.id);
  const exhibitorToken = signup.token as string;

  const apply = await fetch(`${baseUrl}/api/exhibitor/participations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${exhibitorToken}` },
    body: JSON.stringify({ exhibitionId: "seed-exhibition-1" }),
  }).then((r) => r.json());
  stallParticipationId = apply.participation.id;

  const organizerToken = await login("org1.owner@eventpass.test");
  const approve = await fetch(`${baseUrl}/api/exhibitions/seed-exhibition-1/exhibitors/${stallParticipationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${organizerToken}` },
    body: JSON.stringify({ status: "approved" }),
  }).then((r) => r.json());
  assert.equal(approve.participant?.status, "approved", `approval must succeed: ${JSON.stringify(approve)}`);

  const select = await fetch(`${baseUrl}/api/exhibitor/participations/${stallParticipationId}/stall`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${exhibitorToken}` },
    body: JSON.stringify({ stallId: "seed-stall-b03" }),
  }).then((r) => r.json());
  assert.equal(select.participation?.status, "stall_reserved", `stall selection must succeed: ${JSON.stringify(select)}`);

  const pay = await fetch(`${baseUrl}/api/exhibitor/participations/${stallParticipationId}/payment`, {
    method: "POST",
    headers: { Authorization: `Bearer ${exhibitorToken}` },
  }).then((r) => r.json());
  assert.ok(pay.payment?.id, `stall payment initiation must succeed: ${JSON.stringify(pay)}`);
  createdStallBookingIds.push(pay.booking.id);

  await fetch(`${baseUrl}/api/payments/${pay.payment.id}/mock-complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${exhibitorToken}` },
    body: JSON.stringify({ outcome: "success" }),
  }).then((r) => r.json());

  const paidPayment = await prisma.payment.findUniqueOrThrow({ where: { id: pay.payment.id } });
  return { bookingId: pay.booking.id, paymentId: pay.payment.id, payment: paidPayment };
}

async function refund(organizerToken: string, paymentId: string, body: Record<string, unknown>) {
  const res = await fetch(`${baseUrl}/api/organizer/payments/${paymentId}/refund`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${organizerToken}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function mockCompleteRefund(organizerToken: string, paymentId: string, refundId: string, outcome: "success" | "failure") {
  const res = await fetch(`${baseUrl}/api/organizer/payments/${paymentId}/refunds/${refundId}/mock-complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${organizerToken}` },
    body: JSON.stringify({ outcome }),
  });
  return { status: res.status, body: await res.json() };
}

// Test 1 (full ticket refund) + Test 16 (original amount preserved) + Test 17 (pricing version preserved) + Test 15 (audit) + Test 19 (status transitions).
test("full ticket refund: payment moves paid -> refunded, original amount/pricingVersion untouched, audit record written", async () => {
  const organizerToken = await login("org1.owner@eventpass.test");
  const { paymentId, payment: original } = await createPaidTicket("seed-tickettype-standard", "full-ticket");
  assert.equal(original.status, "paid");
  assert.equal(Number(original.amount), 499);

  const initiated = await refund(organizerToken, paymentId, { reason: "CUSTOMER_REQUEST", idempotencyKey: `full-ticket-${ts}` });
  assert.equal(initiated.status, 201, JSON.stringify(initiated.body));
  assert.equal(initiated.body.refund.status, "PROCESSING");

  const completed = await mockCompleteRefund(organizerToken, paymentId, initiated.body.refund.id, "success");
  assert.equal(completed.status, 200, JSON.stringify(completed.body));
  assert.equal(completed.body.refund.status, "SUCCEEDED");
  assert.equal(completed.body.payment.status, "refunded");
  assert.equal(Number(completed.body.payment.refundedAmount), 499);
  assert.equal(completed.body.totals.refundableAmount, 0);

  // Original financial history untouched.
  const finalPayment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  assert.equal(Number(finalPayment.amount), 499, "original amount must never be rewritten");
  assert.equal(Number(finalPayment.baseAmount), 499);
  assert.equal(finalPayment.pricingVersionId, original.pricingVersionId, "refund must never change which PricingVersion the original sale referenced");

  const auditRows = await prisma.auditLog.findMany({ where: { entityType: "Payment", entityId: paymentId }, orderBy: { createdAt: "asc" } });
  assert.ok(auditRows.some((r) => r.action === "refund.requested"), "expected a refund.requested audit row");
  assert.ok(auditRows.some((r) => r.action === "refund.succeeded"), "expected a refund.succeeded audit row");
});

// Test 2 (partial ticket refund) + Test 7 (reconciliation) + Test 6 (multiple refunds) + Test 18 (refund history).
test("partial ticket refund: reconciles to the remaining refundable amount, then a second partial refund completes it, history is accurate", async () => {
  const organizerToken = await login("org1.owner@eventpass.test");
  const { paymentId } = await createPaidTicket("seed-tickettype-vip", "partial-ticket");

  const first = await refund(organizerToken, paymentId, { amount: 999, reason: "CUSTOMER_REQUEST", idempotencyKey: `partial-ticket-1-${ts}` });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  await mockCompleteRefund(organizerToken, paymentId, first.body.refund.id, "success");

  const afterFirst = await fetch(`${baseUrl}/api/organizer/payments/${paymentId}`, { headers: { Authorization: `Bearer ${organizerToken}` } }).then((r) => r.json());
  assert.equal(afterFirst.payment.status, "partially_refunded");
  assert.equal(Number(afterFirst.payment.refundedAmount), 999);
  assert.equal(afterFirst.totals.refundableAmount, 1000, `1999 - 999 = 1000, got ${JSON.stringify(afterFirst.totals)}`);
  assert.equal(afterFirst.refunds.length, 1);

  // Second partial refund for the remaining amount (omit `amount` -> server fills in the full remainder).
  const second = await refund(organizerToken, paymentId, { reason: "ADMINISTRATIVE", idempotencyKey: `partial-ticket-2-${ts}` });
  assert.equal(second.status, 201, JSON.stringify(second.body));
  await mockCompleteRefund(organizerToken, paymentId, second.body.refund.id, "success");

  const afterSecond = await fetch(`${baseUrl}/api/organizer/payments/${paymentId}`, { headers: { Authorization: `Bearer ${organizerToken}` } }).then((r) => r.json());
  assert.equal(afterSecond.payment.status, "refunded");
  assert.equal(Number(afterSecond.payment.refundedAmount), 1999);
  assert.equal(afterSecond.totals.refundableAmount, 0);
  assert.equal(afterSecond.refunds.length, 2);
  // Breakdown reconciliation: baseAmount + fee + tax - discount == amount (Phase 19A invariant), independent of refunds.
  assert.equal(
    Number(afterSecond.payment.baseAmount) + Number(afterSecond.payment.platformFeeAmount) + Number(afterSecond.payment.taxAmount) - Number(afterSecond.payment.discountAmount),
    Number(afterSecond.payment.amount)
  );
});

// Test 5 (refund amount validation).
test("refund amount validation: cannot exceed the original amount or the remaining refundable amount, cannot be zero/negative", async () => {
  const organizerToken = await login("org1.owner@eventpass.test");
  const { paymentId } = await createPaidTicket("seed-tickettype-standard", "validation-ticket");

  const tooMuch = await refund(organizerToken, paymentId, { amount: 500, reason: "CUSTOMER_REQUEST", idempotencyKey: `validation-1-${ts}` });
  assert.equal(tooMuch.status, 400, JSON.stringify(tooMuch.body));
  assert.equal(tooMuch.body.code, "EXCEEDS_REMAINING");

  const zero = await refund(organizerToken, paymentId, { amount: 0, reason: "CUSTOMER_REQUEST", idempotencyKey: `validation-2-${ts}` });
  assert.equal(zero.status, 400, "amount 0 must be rejected by request validation");

  const negative = await refund(organizerToken, paymentId, { amount: -50, reason: "CUSTOMER_REQUEST", idempotencyKey: `validation-3-${ts}` });
  assert.equal(negative.status, 400, "a negative amount must be rejected by request validation");

  // Now actually refund it in full, then prove a further refund is rejected — "no second full refund after already fully refunded".
  const full = await refund(organizerToken, paymentId, { reason: "CUSTOMER_REQUEST", idempotencyKey: `validation-4-${ts}` });
  await mockCompleteRefund(organizerToken, paymentId, full.body.refund.id, "success");

  const afterFull = await refund(organizerToken, paymentId, { amount: 1, reason: "CUSTOMER_REQUEST", idempotencyKey: `validation-5-${ts}` });
  assert.equal(afterFull.status, 400, JSON.stringify(afterFull.body));
  assert.equal(afterFull.body.code, "PAYMENT_NOT_REFUNDABLE");
});

// Test 3 + 4 (full and partial stall refund) — stall allocation state.
test("stall refund: a full refund releases the stall/participation, a partial refund does not", async () => {
  const organizerToken = await login("org1.owner@eventpass.test");
  const { paymentId } = await createPaidStall();

  const stallBefore = await prisma.stall.findUniqueOrThrow({ where: { id: "seed-stall-b03" } });
  assert.equal(stallBefore.status, "sold");

  const partial = await refund(organizerToken, paymentId, { amount: 1000, reason: "ADMINISTRATIVE", idempotencyKey: `stall-partial-${ts}` });
  assert.equal(partial.status, 201, JSON.stringify(partial.body));
  await mockCompleteRefund(organizerToken, paymentId, partial.body.refund.id, "success");

  const stallAfterPartial = await prisma.stall.findUniqueOrThrow({ where: { id: "seed-stall-b03" } });
  assert.equal(stallAfterPartial.status, "sold", "a partial refund must never release the stall");
  assert.equal(stallAfterPartial.exhibitionExhibitorId, stallParticipationId);

  const full = await refund(organizerToken, paymentId, { reason: "ADMINISTRATIVE", idempotencyKey: `stall-full-${ts}` });
  assert.equal(full.status, 201, JSON.stringify(full.body));
  await mockCompleteRefund(organizerToken, paymentId, full.body.refund.id, "success");

  const stallAfterFull = await prisma.stall.findUniqueOrThrow({ where: { id: "seed-stall-b03" } });
  assert.equal(stallAfterFull.status, "available", "a full refund must release the stall");
  assert.equal(stallAfterFull.exhibitionExhibitorId, null);

  const participation = await prisma.exhibitionExhibitor.findUniqueOrThrow({ where: { id: stallParticipationId! } });
  assert.equal(participation.status, "cancelled");
});
