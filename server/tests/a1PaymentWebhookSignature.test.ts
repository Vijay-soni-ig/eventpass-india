import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testServer";
import { MockPaymentProvider } from "../src/lib/payments";

let baseUrl: string;
let stop: () => Promise<void>;

before(async () => {
  process.env.PAYMENT_PROVIDER = "mock";
  process.env.RAZORPAY_WEBHOOK_SECRET = "test-webhook-secret";
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await stop();
});

test("payment webhook rejects an invalid signature before parsing or mutation", async () => {
  const response = await fetch(`${baseUrl}/api/webhooks/payments/mock`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Mock-Signature": "invalid-signature",
    },
    body: JSON.stringify({
      event: "payment.captured",
      payload: { payment_id: "forged-payment" },
    }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid webhook signature" });
});

test("payment webhook records a valid event once and rejects replay as a duplicate", async () => {
  const provider = new MockPaymentProvider();
  const payload = {
    eventId: `a1-webhook-${Date.now()}`,
    eventType: "payment.captured",
    providerOrderId: `unknown-order-${Date.now()}`,
    providerPaymentId: `unknown-payment-${Date.now()}`,
    outcome: "paid",
  };
  const rawBody = JSON.stringify(payload);
  const signature = provider.sign(rawBody);

  const request = () =>
    fetch(`${baseUrl}/api/webhooks/payments/mock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mock-Signature": signature,
        "X-Razorpay-Event-Id": payload.eventId,
      },
      body: rawBody,
    });

  const first = await request();
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { received: true });

  const replay = await request();
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), { received: true, duplicate: true });
});
