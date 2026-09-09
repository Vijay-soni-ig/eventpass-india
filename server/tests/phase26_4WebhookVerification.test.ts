import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { RazorpayProvider } from "../src/lib/payments/razorpay";

test("Phase 26.4: Razorpay webhook signature accepts exact signed bytes", () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = "test-webhook-secret";
  const provider = new RazorpayProvider();
  const body = Buffer.from(JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_123", order_id: "order_123" } } } }));
  const signature = crypto.createHmac("sha256", "test-webhook-secret").update(body).digest("hex");

  assert.equal(provider.verifyWebhookSignature(body, signature), true);
  assert.equal(provider.verifyWebhookSignature(Buffer.from(`${body.toString()} `), signature), false);

  delete process.env.RAZORPAY_WEBHOOK_SECRET;
});

test("Phase 26.4: webhook parsing preserves stable event and refund identities", () => {
  const provider = new RazorpayProvider();
  const body = Buffer.from(JSON.stringify({
    event: "refund.processed",
    payload: { refund: { entity: { id: "rfnd_123", payment_id: "pay_123", order_id: "order_123" } } },
  }));
  const event = provider.parseWebhookEvent(body, "evt_123");

  assert.equal(event.providerEventId, "evt_123");
  assert.equal(event.providerRefundId, "rfnd_123");
  assert.equal(event.providerPaymentId, "pay_123");
  assert.equal(event.providerOrderId, "order_123");
  assert.equal(event.outcome, "refunded");
});

test("Phase 26.4: malformed or incorrectly shaped webhook signatures are rejected", () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = "test-webhook-secret";
  const provider = new RazorpayProvider();
  const body = Buffer.from("{}", "utf8");

  assert.equal(provider.verifyWebhookSignature(body, undefined), false);
  assert.equal(provider.verifyWebhookSignature(body, "not-a-signature"), false);
  assert.equal(provider.verifyWebhookSignature(body, "00".repeat(31)), false);

  delete process.env.RAZORPAY_WEBHOOK_SECRET;
});
