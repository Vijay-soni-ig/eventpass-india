import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { MockPaymentProvider } from "../src/lib/payments/mock";
import { RazorpayProvider } from "../src/lib/payments/razorpay";
import { getPaymentProvider } from "../src/lib/payments";
import { requestRefund } from "../src/lib/refundService";
import { bootstrapOrganizer, applyAsExhibitor, approveParticipation, createStall, cleanupOrganizers } from "./helpers/entitlementFixtures";
import { selectStall, initiatePayment } from "./helpers/phase21bFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const paymentIds: string[] = [];
const orphanEventIds: string[] = [];
const refundIds: string[] = [];

before(async () => {
  process.env.PAYMENT_PROVIDER = "mock";
  process.env.MOCK_PAYMENT_SECRET = "webhook-mismatch-test-secret";
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  try {
    if (paymentIds.length) {
      await prisma.paymentEvent.deleteMany({ where: { paymentId: { in: paymentIds } } });
      await prisma.auditLog.deleteMany({ where: { entityType: "Payment", entityId: { in: paymentIds } } });
    }
    if (orphanEventIds.length) {
      await prisma.paymentEvent.deleteMany({ where: { provider: "mock", providerEventId: { in: orphanEventIds } } });
    }
    if (refundIds.length) await prisma.refund.deleteMany({ where: { id: { in: refundIds } } });
    await cleanupOrganizers(organizerIds);
  } finally {
    await stop();
    await prisma.$disconnect();
    delete process.env.MOCK_PAYMENT_SECRET;
  }
});

async function createProcessingRefundFixture(label: string) {
  const organizer = await bootstrapOrganizer(baseUrl, `refund-early-${label}`, ts);
  organizerIds.push(organizer.organizerId);
  const exhibitor = await applyAsExhibitor(
    baseUrl,
    organizer.firstExhibitionId,
    `refund-early-${label}-exhibitor`,
    ts,
  );
  await approveParticipation(baseUrl, organizer.token, organizer.firstExhibitionId, exhibitor.participationId);
  const stall = await createStall(baseUrl, organizer.token, organizer.firstExhibitionId, 2500);
  const selected = await selectStall(baseUrl, exhibitor.token, exhibitor.participationId, stall.body.stall.id);
  assert.equal(selected.status, 200, JSON.stringify(selected.body));

  const initiated = await initiatePayment(baseUrl, exhibitor.token, exhibitor.participationId);
  assert.equal(initiated.status, 201, JSON.stringify(initiated.body));
  const paymentId = initiated.body.payment.id as string;
  paymentIds.push(paymentId);
  const initialPayment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  assert.ok(initialPayment.providerOrderId, "fixture must have a provider order");

  const providerPaymentId = `mock-pay-refund-${label}-${ts}`;
  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "paid", providerPaymentId },
  });
  const booking = await prisma.stallBooking.findUniqueOrThrow({ where: { paymentId } });
  await prisma.stallBooking.update({ where: { id: booking.id }, data: { paymentStatus: "paid" } });

  const refundAmount = Math.round(Number(initialPayment.amount) * 50) / 100;
  const refund = await prisma.refund.create({
    data: {
      paymentId,
      amount: refundAmount,
      status: "PROCESSING",
      reason: "CUSTOMER_REQUEST",
      idempotencyKey: `refund-early-${label}-${ts}`,
      provider: "mock",
      requestedByUserId: null,
    },
  });
  refundIds.push(refund.id);
  return { paymentId, providerPaymentId, providerOrderId: initialPayment.providerOrderId!, refund, refundAmount };
}

test("captured webhook amount and currency mismatches do not consume event id or mutate payment", async () => {
  const organizer = await bootstrapOrganizer(baseUrl, "webhook-money-mismatch", ts);
  organizerIds.push(organizer.organizerId);

  const exhibitor = await applyAsExhibitor(
    baseUrl,
    organizer.firstExhibitionId,
    "webhook-money-mismatch-exhibitor",
    ts,
  );
  await approveParticipation(baseUrl, organizer.token, organizer.firstExhibitionId, exhibitor.participationId);
  const stall = await createStall(baseUrl, organizer.token, organizer.firstExhibitionId, 2500);
  const selected = await selectStall(baseUrl, exhibitor.token, exhibitor.participationId, stall.body.stall.id);
  assert.equal(selected.status, 200, JSON.stringify(selected.body));

  const initiated = await initiatePayment(baseUrl, exhibitor.token, exhibitor.participationId);
  assert.equal(initiated.status, 201, JSON.stringify(initiated.body));
  const paymentId = initiated.body.payment.id as string;
  paymentIds.push(paymentId);
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  assert.ok(payment.providerOrderId, "fixture must create a provider order");
  const expectedAmount = Number(payment.amount);
  const eventId = `webhook-money-mismatch-${ts}`;
  const providerPaymentId = `mock-pay-money-mismatch-${ts}`;
  const provider = new MockPaymentProvider();

  async function deliver(amount: number, currency: string) {
    const rawBody = JSON.stringify({
      eventId,
      eventType: "payment.captured",
      providerOrderId: payment.providerOrderId,
      providerPaymentId,
      outcome: "paid",
      amount,
      currency,
    });
    return fetch(`${baseUrl}/api/webhooks/payments/mock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mock-Signature": provider.sign(rawBody),
      },
      body: rawBody,
    });
  }

  const wrongAmount = await deliver(expectedAmount + 1, payment.currency);
  assert.equal(wrongAmount.status, 400, await wrongAmount.clone().text());
  assert.match((await wrongAmount.json()).error, /amount mismatch/i);

  let persisted = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  assert.equal(persisted.status, "created");
  assert.equal(persisted.providerPaymentId, null);

  const wrongCurrency = await deliver(expectedAmount, payment.currency === "INR" ? "USD" : "INR");
  assert.equal(wrongCurrency.status, 400, await wrongCurrency.clone().text());
  assert.match((await wrongCurrency.json()).error, /currency mismatch/i);

  persisted = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  assert.equal(persisted.status, "created");
  assert.equal(persisted.providerPaymentId, null);

  // Reusing the same provider event ID with corrected financial details must
  // still be processed; rejected mismatches must not be recorded as handled.
  const corrected = await deliver(expectedAmount, payment.currency);
  assert.equal(corrected.status, 200, await corrected.clone().text());
  assert.deepEqual(await corrected.json(), { received: true });

  persisted = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  assert.equal(persisted.status, "paid");
  assert.equal(persisted.providerPaymentId, providerPaymentId);
});

test("duplicate failed webhook resumes an unapplied payment transition", async () => {
  const organizer = await bootstrapOrganizer(baseUrl, "webhook-failure-replay", ts);
  organizerIds.push(organizer.organizerId);

  const exhibitor = await applyAsExhibitor(
    baseUrl,
    organizer.firstExhibitionId,
    "webhook-failure-replay-exhibitor",
    ts,
  );
  await approveParticipation(baseUrl, organizer.token, organizer.firstExhibitionId, exhibitor.participationId);
  const stall = await createStall(baseUrl, organizer.token, organizer.firstExhibitionId, 2500);
  const selected = await selectStall(baseUrl, exhibitor.token, exhibitor.participationId, stall.body.stall.id);
  assert.equal(selected.status, 200, JSON.stringify(selected.body));

  const initiated = await initiatePayment(baseUrl, exhibitor.token, exhibitor.participationId);
  assert.equal(initiated.status, 201, JSON.stringify(initiated.body));
  const paymentId = initiated.body.payment.id as string;
  paymentIds.push(paymentId);
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  assert.ok(payment.providerOrderId, "fixture must create a provider order");

  const eventId = `webhook-failure-replay-${ts}`;
  const providerPaymentId = `mock-pay-failure-replay-${ts}`;
  const rawBody = JSON.stringify({
    eventId,
    eventType: "payment.failed",
    providerOrderId: payment.providerOrderId,
    providerPaymentId,
    outcome: "failed",
    failureReason: "Simulated provider decline",
  });

  // Model a process interruption after the event ledger insert but before
  // applyPaymentOutcome commits. The provider's retry must resume the state
  // transition rather than treating the ledger row as proof of completion.
  await prisma.paymentEvent.create({
    data: {
      provider: "mock",
      providerEventId: eventId,
      eventType: "payment.failed",
      payload: JSON.parse(rawBody),
      paymentId,
    },
  });

  const provider = new MockPaymentProvider();
  const replay = await fetch(`${baseUrl}/api/webhooks/payments/mock`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Mock-Signature": provider.sign(rawBody),
    },
    body: rawBody,
  });
  assert.equal(replay.status, 200, await replay.clone().text());
  assert.deepEqual(await replay.json(), { received: true, duplicate: true });

  const persisted = await prisma.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { stallBooking: true },
  });
  assert.equal(persisted.status, "failed");
  assert.equal(persisted.providerPaymentId, providerPaymentId);
  assert.equal(persisted.stallBooking?.paymentStatus, "failed");
  assert.equal(
    await prisma.paymentEvent.count({ where: { provider: "mock", providerEventId: eventId } }),
    1,
  );
});


test("unmapped failed webhook is applied when the provider retries after order mapping exists", async () => {
  const organizer = await bootstrapOrganizer(baseUrl, "webhook-unmapped-replay", ts);
  organizerIds.push(organizer.organizerId);

  const exhibitor = await applyAsExhibitor(
    baseUrl,
    organizer.firstExhibitionId,
    "webhook-unmapped-replay-exhibitor",
    ts,
  );
  await approveParticipation(baseUrl, organizer.token, organizer.firstExhibitionId, exhibitor.participationId);
  const stall = await createStall(baseUrl, organizer.token, organizer.firstExhibitionId, 2500);
  const selected = await selectStall(baseUrl, exhibitor.token, exhibitor.participationId, stall.body.stall.id);
  assert.equal(selected.status, 200, JSON.stringify(selected.body));

  const initiated = await initiatePayment(baseUrl, exhibitor.token, exhibitor.participationId);
  assert.equal(initiated.status, 201, JSON.stringify(initiated.body));
  const paymentId = initiated.body.payment.id as string;
  paymentIds.push(paymentId);
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  const providerOrderId = payment.providerOrderId;
  assert.ok(providerOrderId, "fixture must create a provider order");

  const eventId = `webhook-unmapped-failure-replay-${ts}`;
  orphanEventIds.push(eventId);
  const providerPaymentId = `mock-pay-unmapped-failure-replay-${ts}`;
  const rawBody = JSON.stringify({
    eventId,
    eventType: "payment.failed",
    providerOrderId,
    providerPaymentId,
    outcome: "failed",
    failureReason: "Provider event arrived before local order mapping",
  });
  const provider = new MockPaymentProvider();

  // Simulate a verified provider event arriving before the local order mapping
  // is committed. The first delivery is durably recorded but cannot yet resolve
  // a Payment row. Once the mapping exists, the provider retry must reconcile it.
  await prisma.payment.update({ where: { id: paymentId }, data: { providerOrderId: null } });
  let firstDelivery: Response;
  try {
    firstDelivery = await fetch(`${baseUrl}/api/webhooks/payments/mock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mock-Signature": provider.sign(rawBody),
      },
      body: rawBody,
    });
  } finally {
    await prisma.payment.update({ where: { id: paymentId }, data: { providerOrderId } });
  }

  assert.equal(firstDelivery.status, 200, await firstDelivery.clone().text());
  assert.deepEqual(await firstDelivery.json(), { received: true });
  const firstLedgerEntry = await prisma.paymentEvent.findFirstOrThrow({
    where: { provider: "mock", providerEventId: eventId },
  });
  assert.equal(firstLedgerEntry.paymentId, null);
  let persisted = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  assert.equal(persisted.status, "created");
  assert.equal(persisted.providerPaymentId, null);

  const retry = await fetch(`${baseUrl}/api/webhooks/payments/mock`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Mock-Signature": provider.sign(rawBody),
    },
    body: rawBody,
  });
  assert.equal(retry.status, 200, await retry.clone().text());
  assert.deepEqual(await retry.json(), { received: true, duplicate: true });

  persisted = await prisma.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { stallBooking: true },
  });
  assert.equal(persisted.status, "failed");
  assert.equal(persisted.providerPaymentId, providerPaymentId);
  assert.equal(persisted.stallBooking?.paymentStatus, "failed");
  assert.equal(
    await prisma.paymentEvent.count({ where: { provider: "mock", providerEventId: eventId } }),
    1,
  );
});

test("early refund.processed webhook resolves the local refund before providerRefundId is persisted", async () => {
  const fixture = await createProcessingRefundFixture("first-delivery");
  const eventId = `refund-early-first-${ts}`;
  orphanEventIds.push(eventId);
  const providerRefundId = `mock-refund-early-first-${ts}`;
  const rawBody = JSON.stringify({
    eventId,
    eventType: "refund.processed",
    providerRefundId,
    providerRefundReference: fixture.refund.id,
    providerPaymentId: fixture.providerPaymentId,
    providerOrderId: fixture.providerOrderId,
    refundAmount: fixture.refundAmount,
  });
  const provider = new MockPaymentProvider();

  const response = await fetch(`${baseUrl}/api/webhooks/payments/mock`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Mock-Signature": provider.sign(rawBody) },
    body: rawBody,
  });
  assert.equal(response.status, 200, await response.clone().text());
  assert.deepEqual(await response.json(), { received: true, reconciled: true });

  const persistedRefund = await prisma.refund.findUniqueOrThrow({ where: { id: fixture.refund.id } });
  assert.equal(persistedRefund.status, "SUCCEEDED");
  assert.equal(persistedRefund.providerRefundId, providerRefundId);

  const persistedPayment = await prisma.payment.findUniqueOrThrow({
    where: { id: fixture.paymentId },
    include: { stallBooking: true },
  });
  assert.equal(persistedPayment.status, "partially_refunded");
  assert.equal(Number(persistedPayment.refundedAmount), fixture.refundAmount);
  assert.equal(persistedPayment.stallBooking?.paymentStatus, "partially_refunded");
  assert.equal(
    await prisma.paymentEvent.count({ where: { provider: "mock", providerEventId: eventId, paymentId: fixture.paymentId } }),
    1,
  );

  const duplicate = await fetch(`${baseUrl}/api/webhooks/payments/mock`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Mock-Signature": provider.sign(rawBody) },
    body: rawBody,
  });
  assert.equal(duplicate.status, 200, await duplicate.clone().text());
  assert.deepEqual(await duplicate.json(), { received: true, duplicate: true });
  const afterDuplicate = await prisma.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } });
  assert.equal(Number(afterDuplicate.refundedAmount), fixture.refundAmount, "duplicate delivery must not apply the refund twice");
});

test("duplicate early refund webhook resumes an unapplied finalization using its signed local reference", async () => {
  const fixture = await createProcessingRefundFixture("persisted-before-finalize");
  const eventId = `refund-early-persisted-${ts}`;
  orphanEventIds.push(eventId);
  const providerRefundId = `mock-refund-early-persisted-${ts}`;
  const rawBody = JSON.stringify({
    eventId,
    eventType: "refund.processed",
    providerRefundId,
    providerRefundReference: fixture.refund.id,
    providerPaymentId: fixture.providerPaymentId,
    providerOrderId: fixture.providerOrderId,
    refundAmount: fixture.refundAmount,
  });
  await prisma.paymentEvent.create({
    data: {
      provider: "mock",
      providerEventId: eventId,
      eventType: "refund.processed",
      payload: JSON.parse(rawBody),
      paymentId: fixture.paymentId,
    },
  });

  const provider = new MockPaymentProvider();
  const replay = await fetch(`${baseUrl}/api/webhooks/payments/mock`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Mock-Signature": provider.sign(rawBody) },
    body: rawBody,
  });
  assert.equal(replay.status, 200, await replay.clone().text());
  assert.deepEqual(await replay.json(), { received: true, duplicate: true, reconciled: true });

  const persistedRefund = await prisma.refund.findUniqueOrThrow({ where: { id: fixture.refund.id } });
  assert.equal(persistedRefund.status, "SUCCEEDED");
  assert.equal(persistedRefund.providerRefundId, providerRefundId);
  const persistedPayment = await prisma.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } });
  assert.equal(persistedPayment.status, "partially_refunded");
  assert.equal(Number(persistedPayment.refundedAmount), fixture.refundAmount);
  assert.equal(await prisma.paymentEvent.count({ where: { provider: "mock", providerEventId: eventId } }), 1);
});

test("early refund reference rejects payment-identity and amount mismatches without consuming the event", async () => {
  const fixture = await createProcessingRefundFixture("mismatch");
  const provider = new MockPaymentProvider();

  async function deliver(eventId: string, providerPaymentId: string, refundAmount: number) {
    orphanEventIds.push(eventId);
    const rawBody = JSON.stringify({
      eventId,
      eventType: "refund.processed",
      providerRefundId: `mock-refund-${eventId}`,
      providerRefundReference: fixture.refund.id,
      providerPaymentId,
      providerOrderId: fixture.providerOrderId,
      refundAmount,
    });
    return fetch(`${baseUrl}/api/webhooks/payments/mock`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Mock-Signature": provider.sign(rawBody) },
      body: rawBody,
    });
  }

  const wrongPayment = await deliver(`refund-wrong-payment-${ts}`, `other-payment-${ts}`, fixture.refundAmount);
  assert.equal(wrongPayment.status, 400, await wrongPayment.text());
  const wrongAmount = await deliver(`refund-wrong-amount-${ts}`, fixture.providerPaymentId, fixture.refundAmount + 1);
  assert.equal(wrongAmount.status, 400, await wrongAmount.text());

  const persistedRefund = await prisma.refund.findUniqueOrThrow({ where: { id: fixture.refund.id } });
  assert.equal(persistedRefund.status, "PROCESSING");
  assert.equal(persistedRefund.providerRefundId, null);
  const persistedPayment = await prisma.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } });
  assert.equal(persistedPayment.status, "paid");
  assert.equal(Number(persistedPayment.refundedAmount), 0);
  assert.equal(await prisma.paymentEvent.count({ where: { paymentId: fixture.paymentId } }), 0);
});

test("Razorpay refund webhook parser extracts the local refund reference from signed notes", () => {
  const provider = new RazorpayProvider();
  const event = provider.parseWebhookEvent(Buffer.from(JSON.stringify({
    event: "refund.processed",
    payload: {
      refund: {
        entity: {
          id: "rfnd_early_arrival",
          payment_id: "pay_early_arrival",
          order_id: "order_early_arrival",
          amount: 125000,
          notes: { exhibitTixRefundId: "local-refund-uuid" },
        },
      },
    },
  })), "evt_early_arrival");

  assert.equal(event.providerEventId, "evt_early_arrival");
  assert.equal(event.providerRefundId, "rfnd_early_arrival");
  assert.equal(event.providerPaymentId, "pay_early_arrival");
  assert.equal(event.providerOrderId, "order_early_arrival");
  assert.equal(event.providerRefundReference, "local-refund-uuid");
  assert.equal(event.refundAmount, 1250);
});

test("Razorpay refund request forwards the local Refund.id and preserves provider status", async () => {
  for (const status of ["processed", "pending", "failed"] as const) {
    const provider = new RazorpayProvider();
    let captured: { amount: number; notes?: Record<string, string> } | undefined;
    const stubClient = {
      payments: {
        refund: async (_providerPaymentId: string, params: { amount: number; notes?: Record<string, string> }) => {
          captured = params;
          return { id: `rfnd_${status}`, status };
        },
      },
    };
    (provider as unknown as { client: typeof stubClient | null }).client = stubClient;

    const notes = { exhibitTixRefundId: "local-refund-uuid" };
    const result = await provider.refund("pay_notes_forwarded", 1250, notes);
    assert.equal(result.providerRefundId, `rfnd_${status}`);
    assert.equal(result.status, status);
    assert.deepEqual(captured, { amount: 125000, notes });
  }
});

test("provider-declared failed refund leaves the payment paid and refunded total unchanged", async () => {
  const fixture = await createProcessingRefundFixture("provider-failed");
  await prisma.refund.delete({ where: { id: fixture.refund.id } });

  const booking = await prisma.stallBooking.findUniqueOrThrow({
    where: { paymentId: fixture.paymentId },
    select: { buyerUserId: true },
  });
  assert.ok(booking.buyerUserId, "refund requester must be the payment owner");

  const provider = getPaymentProvider();
  const originalRefund = provider.refund.bind(provider);
  let forwardedNotes: Record<string, string> | undefined;
  provider.refund = async (_providerPaymentId, _amount, notes) => {
    forwardedNotes = notes;
    return { providerRefundId: "mock-refund-failed", status: "failed", raw: { status: "failed" } };
  };

  try {
    const outcome = await requestRefund({
      paymentId: fixture.paymentId,
      amount: fixture.refundAmount,
      reason: "CUSTOMER_REQUEST",
      idempotencyKey: `provider-failed-refund-${ts}`,
      requestedByUserId: booking.buyerUserId,
    });
    refundIds.push(outcome.refund.id);
    assert.equal(outcome.refund.status, "FAILED");
    assert.match(outcome.refund.failureReason ?? "", /provider reported the refund as failed/i);
    assert.equal(outcome.refund.providerRefundId, "mock-refund-failed");
    assert.equal(forwardedNotes?.exhibitTixRefundId, outcome.refund.id);

    const persistedPayment = await prisma.payment.findUniqueOrThrow({
      where: { id: fixture.paymentId },
      include: { stallBooking: true },
    });
    assert.equal(persistedPayment.status, "paid");
    assert.equal(Number(persistedPayment.refundedAmount), 0);
    assert.equal(persistedPayment.stallBooking?.paymentStatus, "paid");
  } finally {
    provider.refund = originalRefund;
  }
});
