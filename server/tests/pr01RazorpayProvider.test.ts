import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { RazorpayProvider } from "../src/lib/payments/razorpay";

function withEnv(values: Record<string, string | undefined>, fn: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("Razorpay provider requires all credentials to be configured", () => {
  withEnv(
    {
      RAZORPAY_KEY_ID: "rzp_test_example",
      RAZORPAY_KEY_SECRET: "key_secret_example",
      RAZORPAY_WEBHOOK_SECRET: "webhook_secret_example",
    },
    () => {
      const provider = new RazorpayProvider();
      assert.equal(provider.isConfigured, true);
      assert.equal(provider.publicKey, "rzp_test_example");
    }
  );
});

test("Razorpay checkout signature accepts only the expected HMAC", () => {
  withEnv(
    { RAZORPAY_KEY_ID: "rzp_test_example", RAZORPAY_KEY_SECRET: "key_secret_example", RAZORPAY_WEBHOOK_SECRET: "webhook_secret_example" },
    () => {
      const provider = new RazorpayProvider();
      const orderId = "order_test_123";
      const paymentId = "pay_test_123";
      const valid = crypto.createHmac("sha256", "key_secret_example").update(`${orderId}|${paymentId}`).digest("hex");
      assert.equal(provider.verifyCheckoutSignature({ providerOrderId: orderId, providerPaymentId: paymentId, signature: valid }), true);
      assert.equal(provider.verifyCheckoutSignature({ providerOrderId: orderId, providerPaymentId: paymentId, signature: "bad" }), false);
    }
  );
});

test("Razorpay webhook signature verifies the exact raw body", () => {
  withEnv(
    { RAZORPAY_KEY_ID: "rzp_test_example", RAZORPAY_KEY_SECRET: "key_secret_example", RAZORPAY_WEBHOOK_SECRET: "webhook_secret_example" },
    () => {
      const provider = new RazorpayProvider();
      const rawBody = Buffer.from('{"event":"payment.captured","payload":{}}', "utf8");
      const signature = crypto.createHmac("sha256", "webhook_secret_example").update(rawBody).digest("hex");
      assert.equal(provider.verifyWebhookSignature(rawBody, signature), true);
      assert.equal(provider.verifyWebhookSignature(Buffer.from('{"event":"payment.failed"}', "utf8"), signature), false);
    }
  );
});

test("Razorpay webhook parser uses the transport event ID for idempotency", () => {
  withEnv(
    { RAZORPAY_KEY_ID: "rzp_test_example", RAZORPAY_KEY_SECRET: "key_secret_example", RAZORPAY_WEBHOOK_SECRET: "webhook_secret_example" },
    () => {
      const provider = new RazorpayProvider();
      const rawBody = Buffer.from(
        JSON.stringify({
          event: "payment.captured",
          payload: { payment: { entity: { id: "pay_123", order_id: "order_123" } } },
        }),
        "utf8"
      );
      const event = provider.parseWebhookEvent(rawBody, "evt_razorpay_123");
      assert.equal(event.providerEventId, "evt_razorpay_123");
      assert.equal(event.providerOrderId, "order_123");
      assert.equal(event.providerPaymentId, "pay_123");
      assert.equal(event.outcome, "paid");
    }
  );
});

test("Razorpay refund webhook can correlate a payment when refund payload carries order_id", () => {
  withEnv(
    { RAZORPAY_KEY_ID: "rzp_test_example", RAZORPAY_KEY_SECRET: "key_secret_example", RAZORPAY_WEBHOOK_SECRET: "webhook_secret_example" },
    () => {
      const provider = new RazorpayProvider();
      const rawBody = Buffer.from(
        JSON.stringify({
          event: "refund.processed",
          payload: { refund: { entity: { id: "rfnd_123", payment_id: "pay_123", order_id: "order_123" } } },
        }),
        "utf8"
      );
      const event = provider.parseWebhookEvent(rawBody, "evt_refund_123");
      assert.equal(event.providerEventId, "evt_refund_123");
      assert.equal(event.providerOrderId, "order_123");
      assert.equal(event.providerPaymentId, "pay_123");
      assert.equal(event.outcome, "refunded");
    }
  );
});
