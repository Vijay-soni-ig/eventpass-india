import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;

before(async () => {
  process.env.PAYMENT_PROVIDER = "mock";
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


test("payment refund webhook rejects a signed payload with a mismatched refund amount", async () => {
  const providerSecret = process.env.MOCK_PAYMENT_SECRET || "mock-payment-secret-dev-only";
  const providerOrderId = "mock_order_refund_integrity";
  const providerPaymentId = "mock_pay_refund_integrity";
  const providerRefundId = "mock_refund_integrity";
  const payload = {
    eventId: "refund-integrity-mismatch-amount",
    eventType: "refund.processed",
    providerOrderId,
    providerPaymentId,
    providerRefundId,
    refundAmount: 999,
    outcome: "refunded",
  };
  const raw = JSON.stringify(payload);
  const crypto = await import("node:crypto");
  const signature = crypto.createHmac("sha256", providerSecret).update(raw).digest("hex");

  const response = await fetch(`${baseUrl}/api/webhooks/payments/mock`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Mock-Signature": signature },
    body: raw,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true, reconciled: false });
});
