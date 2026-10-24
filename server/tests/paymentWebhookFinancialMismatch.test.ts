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
