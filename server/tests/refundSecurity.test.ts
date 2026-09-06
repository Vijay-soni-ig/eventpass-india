import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const createdUserIds: string[] = [];
const createdTicketBookingIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  const paymentIds = createdTicketBookingIds.length
    ? (await prisma.ticketBooking.findMany({ where: { id: { in: createdTicketBookingIds } }, select: { paymentId: true } }))
        .map((b) => b.paymentId)
        .filter((id): id is string => !!id)
    : [];
  if (createdTicketBookingIds.length) await prisma.ticketBooking.deleteMany({ where: { id: { in: createdTicketBookingIds } } });
  if (paymentIds.length) {
    await prisma.refund.deleteMany({ where: { paymentId: { in: paymentIds } } });
    await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
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

  return booking.payment.id as string;
}

async function refund(token: string, paymentId: string, body: Record<string, unknown>) {
  const res = await fetch(`${baseUrl}/api/organizer/payments/${paymentId}/refund`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

// Test C — cross-tenant rejection.
test("a refund request against another organizer's payment is rejected (404, not 403 — doesn't reveal the payment exists)", async () => {
  const paymentId = await createPaidTicket("seed-tickettype-standard", "crosstenant-ticket");

  // A brand-new user, bootstrapped into their OWN separate organizer by
  // creating an exhibition — has payment:manage, but only on their own
  // tenant, which does not include the payment created above (org1's).
  const email = `phase19b-otherorg-${ts}@example.com`;
  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // requireOrganizerAccess only lets a userType:"exhibitor" (or an
    // existing organizer member) through to the bootstrap path — see
    // middleware/auth.ts. This user never actually acts as an exhibitor;
    // it's just how a from-scratch second organizer gets created for this
    // isolation test.
    body: JSON.stringify({ email, password: "testpass123", fullName: "Phase19B Other Org", userType: "exhibitor" }),
  }).then((r) => r.json());
  createdUserIds.push(signup.user.id);

  const bootstrap = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${signup.token}` },
    body: JSON.stringify({ name: "Phase19B Other Org Exhibition", ticketTypes: [], stalls: [] }),
  }).then((r) => r.json());
  assert.ok(bootstrap.exhibition?.organizerId, `organizer bootstrap must succeed: ${JSON.stringify(bootstrap)}`);

  const result = await refund(signup.token, paymentId, { reason: "CUSTOMER_REQUEST", idempotencyKey: `crosstenant-${ts}` });
  assert.equal(result.status, 404, JSON.stringify(result.body));

  await prisma.exhibition.deleteMany({ where: { organizerId: bootstrap.exhibition.organizerId } });
  await prisma.organizerMembership.deleteMany({ where: { organizerId: bootstrap.exhibition.organizerId } });
  await prisma.organizer.deleteMany({ where: { id: bootstrap.exhibition.organizerId } });
});

// Test D — unauthorized role rejection.
test("an organizer role without payment:manage (scanner) cannot refund; the seeded scanner cannot", async () => {
  const paymentId = await createPaidTicket("seed-tickettype-standard", "rbac-ticket");
  const scannerToken = await login("org1.scanner@eventpass.test");

  const result = await refund(scannerToken, paymentId, { reason: "CUSTOMER_REQUEST", idempotencyKey: `rbac-${ts}` });
  assert.equal(result.status, 403, JSON.stringify(result.body));
});

// Test I — free payment cannot be refunded.
test("a free payment cannot be refunded (no gateway money ever moved)", async () => {
  const organizerToken = await login("org1.owner@eventpass.test");
  // seed-payment-ticket-01 is the seeded free (₹0, provider "free", status paid) ticket payment.
  const result = await refund(organizerToken, "seed-payment-ticket-01", { reason: "CUSTOMER_REQUEST", idempotencyKey: `free-${ts}` });
  assert.equal(result.status, 400, JSON.stringify(result.body));
  assert.equal(result.body.code, "FREE_PAYMENT");

  const refundRows = await prisma.refund.findMany({ where: { paymentId: "seed-payment-ticket-01" } });
  assert.equal(refundRows.length, 0, "no Refund row should have been created for a rejected free-payment request");
});

// Test J — failed payment cannot be refunded.
test("a failed payment cannot be refunded", async () => {
  const organizerToken = await login("org1.owner@eventpass.test");
  // seed-payment-ticket-07 is the seeded "failed" ticket payment.
  const result = await refund(organizerToken, "seed-payment-ticket-07", { reason: "CUSTOMER_REQUEST", idempotencyKey: `failed-${ts}` });
  assert.equal(result.status, 400, JSON.stringify(result.body));
  assert.equal(result.body.code, "PAYMENT_NOT_REFUNDABLE");
});

// Test 10 — provider failure leaves the payment's financial state correct.
test("a failed refund confirmation (provider reports failure) leaves the payment paid/unaffected, not refunded", async () => {
  const organizerToken = await login("org1.owner@eventpass.test");
  const paymentId = await createPaidTicket("seed-tickettype-standard", "providerfail-ticket");

  const initiated = await refund(organizerToken, paymentId, { reason: "CUSTOMER_REQUEST", idempotencyKey: `providerfail-${ts}` });
  assert.equal(initiated.status, 201, JSON.stringify(initiated.body));
  assert.equal(initiated.body.refund.status, "PROCESSING");

  const failed = await fetch(`${baseUrl}/api/organizer/payments/${paymentId}/refunds/${initiated.body.refund.id}/mock-complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${organizerToken}` },
    body: JSON.stringify({ outcome: "failure" }),
  }).then((r) => r.json());

  assert.equal(failed.refund.status, "FAILED");
  assert.ok(failed.refund.failureReason, "a failed refund must carry a failure reason");
  assert.equal(failed.payment.status, "paid", "the payment must remain \"paid\", not silently marked refunded, when the provider reports failure");
  assert.equal(Number(failed.payment.refundedAmount), 0, "refundedAmount must not move for a failed refund");
  assert.equal(failed.totals.refundableAmount, 499, "the full amount must still be refundable after a failed attempt");
});

// Test E (refund-specific) — client cannot request a refund larger than the payment by manipulating the amount field.
test("client cannot manipulate the refund amount beyond what the original payment actually was", async () => {
  const organizerToken = await login("org1.owner@eventpass.test");
  const paymentId = await createPaidTicket("seed-tickettype-standard", "manipulate-ticket");

  const result = await refund(organizerToken, paymentId, { amount: 999999, reason: "CUSTOMER_REQUEST", idempotencyKey: `manipulate-${ts}` });
  assert.equal(result.status, 400, JSON.stringify(result.body));
  assert.equal(result.body.code, "EXCEEDS_REMAINING");

  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  assert.equal(Number(payment.refundedAmount), 0, "a rejected over-large refund request must not move refundedAmount at all");
});
