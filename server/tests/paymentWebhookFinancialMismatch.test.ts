import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { MockPaymentProvider } from "../src/lib/payments/mock";
import { bootstrapOrganizer, applyAsExhibitor, approveParticipation, createStall, cleanupOrganizers } from "./helpers/entitlementFixtures";
import { selectStall, initiatePayment } from "./helpers/phase21bFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const paymentIds: string[] = [];
const orphanEventIds: string[] = [];

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
    await cleanupOrganizers(organizerIds);
  } finally {
    await stop();
    await prisma.$disconnect();
    delete process.env.MOCK_PAYMENT_SECRET;
  }
});

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
