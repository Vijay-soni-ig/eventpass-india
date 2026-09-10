import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { RazorpayProvider } from "../src/lib/payments/razorpay";
import { MockPaymentProvider } from "../src/lib/payments/mock";

function withEnv(values: Record<string, string | undefined>, fn: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  try { fn(); } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test("Phase 26.1: Razorpay checkout signature rejects malformed signatures", () => {
  withEnv({ RAZORPAY_KEY_ID: "rzp_test_example", RAZORPAY_KEY_SECRET: "key_secret_example", RAZORPAY_WEBHOOK_SECRET: "webhook_secret_example" }, () => {
    const provider = new RazorpayProvider();
    const orderId = "order_test_123";
    const paymentId = "pay_test_123";
    const valid = crypto.createHmac("sha256", "key_secret_example").update(`${orderId}|${paymentId}`).digest("hex");
    assert.equal(provider.verifyCheckoutSignature({ providerOrderId: orderId, providerPaymentId: paymentId, signature: valid }), true);
    assert.equal(provider.verifyCheckoutSignature({ providerOrderId: orderId, providerPaymentId: paymentId, signature: valid.slice(0, -1) }), false);
    assert.equal(provider.verifyCheckoutSignature({ providerOrderId: orderId, providerPaymentId: paymentId, signature: "zz".repeat(32) }), false);
  });
});

test("Phase 26.1: Razorpay webhook signature rejects missing or malformed signatures", () => {
  withEnv({ RAZORPAY_KEY_ID: "rzp_test_example", RAZORPAY_KEY_SECRET: "key_secret_example", RAZORPAY_WEBHOOK_SECRET: "webhook_secret_example" }, () => {
    const provider = new RazorpayProvider();
    const body = Buffer.from('{"event":"payment.captured"}', "utf8");
    const valid = crypto.createHmac("sha256", "webhook_secret_example").update(body).digest("hex");
    assert.equal(provider.verifyWebhookSignature(body, valid), true);
    assert.equal(provider.verifyWebhookSignature(body, undefined), false);
    assert.equal(provider.verifyWebhookSignature(body, "bad"), false);
  });
});

test("Phase 26.1: Razorpay refund event exposes refund identity and normalized amount", () => {
  withEnv({ RAZORPAY_KEY_ID: "rzp_test_example", RAZORPAY_KEY_SECRET: "key_secret_example", RAZORPAY_WEBHOOK_SECRET: "webhook_secret_example" }, () => {
    const provider = new RazorpayProvider();
    const body = Buffer.from(JSON.stringify({ event: "refund.processed", payload: { refund: { entity: { id: "rfnd_123", payment_id: "pay_123", order_id: "order_123", amount: 12500 } } } }), "utf8");
    const event = provider.parseWebhookEvent(body, "evt_refund_123");
    assert.equal(event.providerRefundId, "rfnd_123");
    assert.equal(event.providerPaymentId, "pay_123");
    assert.equal(event.providerOrderId, "order_123");
    assert.equal(event.refundAmount, 125);
    assert.equal(event.outcome, "refunded");
  });
});

test("Phase 26.1: mock provider rejects invalid money and uses timing-safe signatures", async () => {
  const provider = new MockPaymentProvider();
  await assert.rejects(() => provider.createOrder({ amount: 0, currency: "INR", receipt: "payment_123" }));
  await assert.rejects(() => provider.createOrder({ amount: 100, currency: "inr", receipt: "payment_123" }));
  const order = await provider.createOrder({ amount: 1234.56, currency: "INR", receipt: "payment_123" });
  const paymentId = "mock_pay_123";
  const signature = provider.sign(`${order.providerOrderId}|${paymentId}`);
  assert.equal(provider.verifyCheckoutSignature({ providerOrderId: order.providerOrderId, providerPaymentId: paymentId, signature }), true);
  assert.equal(provider.verifyCheckoutSignature({ providerOrderId: order.providerOrderId, providerPaymentId: paymentId, signature: signature.slice(0, -1) }), false);
  assert.equal((order.raw as { amount: number }).amount, 1234.56);
  assert.equal((order.raw as { currency: string }).currency, "INR");
});
