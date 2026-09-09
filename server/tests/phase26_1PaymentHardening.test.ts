import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { RazorpayProvider } from "../src/lib/payments/razorpay";
import { MockPaymentProvider } from "../src/lib/payments/mock";

test("Phase 26.1: Razorpay checkout signature is timing-safe and rejects malformed signatures", () => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_example";
  process.env.RAZORPAY_KEY_SECRET = "key_secret_example";
  process.env.RAZORPAY_WEBHOOK_SECRET = "webhook_secret_example";
  const provider = new RazorpayProvider();
  const orderId = "order_test_123";
  const paymentId = "pay_test_123";
  const valid = crypto.createHmac("sha256", "key_secret_example").update(`${orderId}|${paymentId}`).digest("hex");

  assert.equal(provider.verifyCheckoutSignature({ providerOrderId: orderId, providerPaymentId: paymentId, signature: valid }), true);
  assert.equal(provider.verifyCheckoutSignature({ providerOrderId: orderId, providerPaymentId: paymentId, signature: valid.slice(0, -1) }), false);
  assert.equal(provider.verifyCheckoutSignature({ providerOrderId: orderId, providerPaymentId: paymentId, signature: "zz".repeat(32) }), false);
});

test("Phase 26.1: Razorpay webhook signature rejects missing or malformed signatures", () => {
  const provider = new RazorpayProvider();
  const body = Buffer.from('{"event":"payment.captured"}', "utf8");
  const valid = crypto.createHmac("sha256", "webhook_secret_example").update(body).digest("hex");

  assert.equal(provider.verifyWebhookSignature(body, valid), true);
  assert.equal(provider.verifyWebhookSignature(body, undefined), false);
  assert.equal(provider.verifyWebhookSignature(body, "bad"), false);
});

test("Phase 26.1: provider order result preserves the customer-payable amount contract", async () => {
  const provider = new MockPaymentProvider();
  const result = await provider.createOrder({ amount: 1234.56, currency: "INR", receipt: "payment_123" });
  assert.match(result.providerOrderId, /^mock_order_/);
  assert.equal((result.raw as { receipt: string }).receipt, "payment_123");
});
