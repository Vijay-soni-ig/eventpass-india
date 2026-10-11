import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../src/lib/prisma";
import { createOrderForPayment } from "../src/lib/paymentService";
import { resetPaymentProviderCache } from "../src/lib/payments";

test("provider order creation failure marks the persisted payment failed", async () => {
  const previousProvider = process.env.PAYMENT_PROVIDER;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.PAYMENT_PROVIDER = "mock";
  if (!process.env.NODE_ENV) process.env.NODE_ENV = "test";
  resetPaymentProviderCache();

  let createdPaymentId: string | undefined;
  try {
    // The mock provider rejects a zero-value order. This exercises the real
    // post-payment-row provider failure path without network calls or secrets.
    await assert.rejects(
      () => createOrderForPayment({ baseAmount: 0, currency: "INR" }),
      /amount|positive|invalid/i,
    );

    const failedPayment = await prisma.payment.findFirst({
      where: { status: "failed", amount: 0, provider: "mock" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(failedPayment, "provider initialization failure must leave a durable failed payment row");
    createdPaymentId = failedPayment.id;
    assert.equal(failedPayment.status, "failed");
    assert.equal(failedPayment.providerOrderId, null);
  } finally {
    if (createdPaymentId) {
      await prisma.payment.deleteMany({ where: { id: createdPaymentId } });
    }
    resetPaymentProviderCache();
    if (previousProvider === undefined) delete process.env.PAYMENT_PROVIDER;
    else process.env.PAYMENT_PROVIDER = previousProvider;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});
