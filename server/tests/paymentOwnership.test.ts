import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

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
