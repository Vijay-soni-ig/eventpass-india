import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { MockPaymentProvider } from "../src/lib/payments/mock";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const userIds: string[] = [];
const bookingIds: string[] = [];

type Visitor = { userId: string; token: string; email: string };

async function createVisitor(label: string): Promise<Visitor> {
  const email = `payment-owner-${label}-${ts}@example.com`;
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "testpass123", fullName: `Payment Owner ${label}`, userType: "visitor" }),
  });
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));
  userIds.push(body.user.id);
  return { userId: body.user.id, token: body.token, email };
}

async function createPayment(visitor: Visitor, label: string) {
  const res = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${visitor.token}` },
    body: JSON.stringify({
      exhibitionId: "seed-exhibition-1",
      ticketTypeId: "seed-tickettype-standard",
      attendeeName: `Payment Owner ${label}`,
      attendeeEmail: visitor.email,
      quantity: 1,
    }),
  });
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));
  bookingIds.push(body.booking.id);
  assert.ok(body.payment?.id, "ticket booking must create a payment");
  return { paymentId: body.payment.id as string, providerOrderId: body.payment.providerOrderId as string };
}

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  const payments = bookingIds.length
    ? await prisma.ticketBooking.findMany({ where: { id: { in: bookingIds } }, select: { paymentId: true } })
    : [];
  const paymentIds = payments.map((p) => p.paymentId).filter((id): id is string => !!id);
  if (bookingIds.length) await prisma.ticketBooking.deleteMany({ where: { id: { in: bookingIds } } });
  if (paymentIds.length) {
    await prisma.refund.deleteMany({ where: { paymentId: { in: paymentIds } } });
    await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
  }
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await stop();
});

test("GET /api/payments/:id — payment owner can read their payment", async () => {
  const owner = await createVisitor("owner");
  const { paymentId } = await createPayment(owner, "owner");
  const res = await fetch(`${baseUrl}/api/payments/${paymentId}`, { headers: { Authorization: `Bearer ${owner.token}` } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.payment.id, paymentId);
});

test("GET /api/payments/:id — another user cannot read the payment and gets no existence leak", async () => {
  const owner = await createVisitor("cross-owner");
  const other = await createVisitor("cross-other");
  const { paymentId } = await createPayment(owner, "cross-user");
  const res = await fetch(`${baseUrl}/api/payments/${paymentId}`, { headers: { Authorization: `Bearer ${other.token}` } });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "Payment not found" });
});

test("GET /api/payments/:id — unauthenticated access is rejected", async () => {
  const owner = await createVisitor("unauth");
  const { paymentId } = await createPayment(owner, "unauth");
  const res = await fetch(`${baseUrl}/api/payments/${paymentId}`);
  assert.equal(res.status, 401);
});

test("GET /api/payments/:id — nonexistent payment safely returns 404", async () => {
  const owner = await createVisitor("missing");
  const res = await fetch(`${baseUrl}/api/payments/does-not-exist`, { headers: { Authorization: `Bearer ${owner.token}` } });
  assert.equal(res.status, 404);
});

test("POST /api/payments/:id/verify — another user cannot verify someone else's payment", async () => {
  const owner = await createVisitor("verify-owner");
  const other = await createVisitor("verify-other");
  const { paymentId, providerOrderId } = await createPayment(owner, "verify");
  const res = await fetch(`${baseUrl}/api/payments/${paymentId}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${other.token}` },
    body: JSON.stringify({ providerOrderId, providerPaymentId: `attack-${ts}`, signature: "invalid" }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/payments/:id/verify — unauthenticated access is rejected", async () => {
  const owner = await createVisitor("verify-unauth");
  const { paymentId, providerOrderId } = await createPayment(owner, "verify-unauth");
  const res = await fetch(`${baseUrl}/api/payments/${paymentId}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providerOrderId, providerPaymentId: `unauth-${ts}`, signature: "invalid" }),
  });
  assert.equal(res.status, 401);
});

test("POST /api/payments/:id/mock-complete — owner can complete a mock payment", async () => {
  const owner = await createVisitor("mock-owner");
  const { paymentId } = await createPayment(owner, "mock-owner");
  const res = await fetch(`${baseUrl}/api/payments/${paymentId}/mock-complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ outcome: "success" }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.payment.id, paymentId);
});

test("POST /api/payments/:id/mock-complete — another user cannot complete someone else's payment", async () => {
  const owner = await createVisitor("mock-cross-owner");
  const other = await createVisitor("mock-cross-other");
  const { paymentId } = await createPayment(owner, "mock-cross-user");
  const res = await fetch(`${baseUrl}/api/payments/${paymentId}/mock-complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${other.token}` },
    body: JSON.stringify({ outcome: "success" }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/payments/:id/mock-complete — unauthenticated access is rejected", async () => {
  const owner = await createVisitor("mock-unauth");
  const { paymentId } = await createPayment(owner, "mock-unauth");
  const res = await fetch(`${baseUrl}/api/payments/${paymentId}/mock-complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ outcome: "success" }),
  });
  assert.equal(res.status, 401);
});


test("POST /api/webhooks/payments/mock — signed payment webhook rejects a mismatched provider payment identity", async () => {
  const owner = await createVisitor("webhook-identity");
  const { paymentId, providerOrderId } = await createPayment(owner, "webhook-identity");
  const provider = new MockPaymentProvider();
  await prisma.payment.update({
    where: { id: paymentId },
    data: { providerPaymentId: "mock_pay_legitimate_identity" },
  });
  const body = {
    eventId: `payment.captured:mismatched:${paymentId}`,
    eventType: "payment.captured",
    providerOrderId,
    providerPaymentId: "mock_pay_mismatched_identity",
    outcome: "paid",
  };
  const raw = JSON.stringify(body);
  const response = await fetch(`${baseUrl}/api/webhooks/payments/mock`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Mock-Signature": provider.sign(raw) },
    body: raw,
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Payment identity mismatch" });
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  assert.equal(payment.status, "created", "mismatched webhook must not settle the local payment");
  assert.equal(payment.providerPaymentId, "mock_pay_legitimate_identity", "mismatched webhook must not overwrite the bound provider payment identity");
});


test("signed captured-payment webhooks reject amount and currency mismatches without settling payment", async () => {
  const owner = await createVisitor("webhook-amount-currency");
  const { paymentId, providerOrderId } = await createPayment(owner, "webhook-amount-currency");
  const local = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  const provider = new MockPaymentProvider();

  const deliver = async (label: string, amount: number, currency: string) => {
    const body = {
      eventId: `payment.captured:${label}:${paymentId}`,
      eventType: "payment.captured",
      providerOrderId,
      providerPaymentId: `mock_pay_${paymentId}`,
      amount,
      currency,
      outcome: "paid",
    };
    const raw = JSON.stringify(body);
    return fetch(`${baseUrl}/api/webhooks/payments/mock`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Mock-Signature": provider.sign(raw) },
      body: raw,
    });
  };

  const wrongAmount = await deliver("wrong-amount", Number(local.amount) + 1, local.currency);
  assert.equal(wrongAmount.status, 400);
  assert.deepEqual(await wrongAmount.json(), { error: "Payment amount mismatch" });

  const wrongCurrency = await deliver("wrong-currency", Number(local.amount), "USD");
  assert.equal(wrongCurrency.status, 400);
  assert.deepEqual(await wrongCurrency.json(), { error: "Payment currency mismatch" });

  const persisted = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  assert.equal(persisted.status, "created", "mismatched provider details must never settle the payment");
  assert.equal(persisted.providerPaymentId, null, "mismatched provider details must not bind a provider payment id");
});


test("invalid checkout signature cannot mark a legitimate payment failed", async () => {
  const owner = await createVisitor("invalid-checkout-signature");
  const { paymentId, providerOrderId } = await createPayment(owner, "invalid-checkout-signature");
  const response = await fetch(`${baseUrl}/api/payments/${paymentId}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({
      providerOrderId,
      providerPaymentId: `attacker-payment-${ts}`,
      signature: "invalid-signature",
    }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Payment signature could not be verified" });
  const persisted = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  assert.equal(persisted.status, "created", "invalid client proof must not mutate financial state");
});
