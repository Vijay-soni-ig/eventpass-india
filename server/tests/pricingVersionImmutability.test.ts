import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { calculatePricing } from "../src/lib/pricingEngine";
import { getActivePricingVersion, createPricingVersion, assertPricingVersionMutable } from "../src/lib/pricingVersion";
import { pricingBreakdownToPaymentData } from "../src/lib/paymentService";

const createdPaymentIds: string[] = [];
const createdVersionIds: string[] = [];

after(async () => {
  // Precise cleanup — only what this file created.
  if (createdPaymentIds.length) {
    await prisma.payment.deleteMany({ where: { id: { in: createdPaymentIds } } });
  }
  if (createdVersionIds.length) {
    await prisma.pricingVersion.deleteMany({ where: { id: { in: createdVersionIds } } });
  }
  await prisma.$disconnect();
});

// Test 6 — PricingVersion is associated with the payment.
test("a payment created via the pricing engine references the currently active PricingVersion", async () => {
  const active = await getActivePricingVersion();
  const breakdown = await calculatePricing(123.45);
  assert.equal(breakdown.pricingVersionId, active.id);

  const payment = await prisma.payment.create({
    data: { ...pricingBreakdownToPaymentData(breakdown), currency: "INR", provider: "test", status: "created" },
  });
  createdPaymentIds.push(payment.id);

  const reloaded = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { pricingVersion: true } });
  assert.equal(reloaded.pricingVersionId, active.id);
  assert.equal(reloaded.pricingVersion.id, active.id);
});

// Test 7 — PricingVersion cannot be changed/mutated after being used.
test("assertPricingVersionMutable rejects a version already referenced by a payment, and allows one that isn't", async () => {
  // A brand-new, never-referenced version: mutable.
  const fresh = await createPricingVersion({
    code: `test-immutability-${Date.now()}`,
    platformFeeType: "none",
    taxMode: "none",
    active: false, // never selectable as the "active" version — this test doesn't need it to be
  });
  createdVersionIds.push(fresh.id);

  await assert.doesNotReject(
    () => assertPricingVersionMutable(fresh.id),
    "a version with zero payments referencing it must be considered mutable"
  );

  // Reference it from a payment, then confirm the guard now rejects it.
  const breakdown = await calculatePricing(50);
  const payment = await prisma.payment.create({
    data: {
      ...pricingBreakdownToPaymentData({ ...breakdown, pricingVersionId: fresh.id }),
      currency: "INR",
      provider: "test",
      status: "created",
    },
  });
  createdPaymentIds.push(payment.id);

  await assert.rejects(
    () => assertPricingVersionMutable(fresh.id),
    /already been referenced/,
    "a version referenced by a payment must be rejected as immutable"
  );

  // And the currently-active launch version — already referenced by real
  // seed/test payments — must also be rejected.
  const active = await getActivePricingVersion();
  await assert.rejects(() => assertPricingVersionMutable(active.id));

  // There is deliberately no updatePricingVersion() function anywhere in
  // this codebase to even attempt calling here — see pricingVersion.ts's
  // own doc comment. The absence of such a function is itself part of the
  // immutability guarantee this test is verifying.
});
