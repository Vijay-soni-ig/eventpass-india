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
  assert.ok(r.token, `login must succeed for ${email}`);
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

async function refund(organizerToken: string, paymentId: string, body: Record<string, unknown>) {
  const res = await fetch(`${baseUrl}/api/organizer/payments/${paymentId}/refund`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${organizerToken}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

// Test 8 — idempotency.
test("repeating a refund request with the same idempotency key returns the same refund, never a second one", async () => {
  const organizerToken = await login("org1.owner@eventpass.test");
  const paymentId = await createPaidTicket("seed-tickettype-standard", "idem-ticket");
  const idempotencyKey = `idem-key-${ts}`;

  const first = await refund(organizerToken, paymentId, { amount: 200, reason: "CUSTOMER_REQUEST", idempotencyKey });
  assert.equal(first.status, 201, JSON.stringify(first.body));

  const second = await refund(organizerToken, paymentId, { amount: 200, reason: "CUSTOMER_REQUEST", idempotencyKey });
  assert.equal(second.status, 201, JSON.stringify(second.body));
  assert.equal(second.body.refund.id, first.body.refund.id, "a repeated request with the same idempotency key must return the SAME refund row");

  const third = await refund(organizerToken, paymentId, { amount: 200, reason: "CUSTOMER_REQUEST", idempotencyKey });
  assert.equal(third.body.refund.id, first.body.refund.id);

  const refundRows = await prisma.refund.findMany({ where: { paymentId } });
  assert.equal(refundRows.length, 1, "three identical requests must produce exactly one Refund row, never three");
});

// Test 9 — concurrent refund protection.
test("two concurrent refund requests against the same payment cannot together over-refund it", async () => {
  const organizerToken = await login("org1.owner@eventpass.test");
  // VIP ticket, ₹1999. Two concurrent requests each ask for ₹1200 — together
  // ₹2400, more than the payment. At most one may fully succeed at ₹1200;
  // the invariant under test is simply: successful refund total <= 1999.
  const paymentId = await createPaidTicket("seed-tickettype-vip", "concurrency-ticket");

  const [a, b] = await Promise.all([
    refund(organizerToken, paymentId, { amount: 1200, reason: "CUSTOMER_REQUEST", idempotencyKey: `concurrency-a-${ts}` }),
    refund(organizerToken, paymentId, { amount: 1200, reason: "CUSTOMER_REQUEST", idempotencyKey: `concurrency-b-${ts}` }),
  ]);

  const results = [a, b];
  const accepted = results.filter((r) => r.status === 201);
  const rejected = results.filter((r) => r.status !== 201);
  assert.equal(accepted.length, 1, `exactly one of the two concurrent ₹1200 requests against a ₹1999 payment must be accepted; got ${JSON.stringify(results.map((r) => r.status))}`);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].body.code, "EXCEEDS_REMAINING", JSON.stringify(rejected[0].body));

  // Confirm the accepted one, then verify the DB-level invariant directly.
  await fetch(`${baseUrl}/api/organizer/payments/${paymentId}/refunds/${accepted[0].body.refund.id}/mock-complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${organizerToken}` },
    body: JSON.stringify({ outcome: "success" }),
  });

  const successfulRefunds = await prisma.refund.aggregate({ where: { paymentId, status: "SUCCEEDED" }, _sum: { amount: true } });
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  assert.ok(
    Number(successfulRefunds._sum.amount ?? 0) <= Number(payment.amount),
    `successful refund total (${successfulRefunds._sum.amount}) must never exceed the original payment (${payment.amount})`
  );
});
