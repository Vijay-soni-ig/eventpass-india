import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";

after(async () => {
  await prisma.$disconnect();
});

// Test 8 — legacy payment compatibility.
test("pre-Phase-19A payments are readable, unmutated, and tagged with the legacy pricing version", async () => {
  const legacyVersion = await prisma.pricingVersion.findUnique({ where: { code: "legacy-unversioned" } });
  assert.ok(legacyVersion, "the legacy pricing version seeded by the Phase 19A migration must exist");
  assert.equal(legacyVersion!.active, false, "the legacy version must never be selectable for new payments");

  // The seed dataset's payments (created before this phase existed) are the
  // real pre-Phase-19A rows this migration backfilled.
  const legacyPayments = await prisma.payment.findMany({ where: { id: { startsWith: "seed-payment-" } } });
  assert.ok(legacyPayments.length > 0, "expected seeded legacy payments to exist for this test to mean anything");

  for (const payment of legacyPayments) {
    assert.equal(payment.pricingVersionId, legacyVersion!.id, `${payment.id} should reference the legacy pricing version`);
    // The historical `amount` was never rewritten — baseAmount/organizerAmount
    // were backfilled FROM it, not the other way around.
    assert.equal(Number(payment.baseAmount), Number(payment.amount), `${payment.id}: baseAmount must equal the original amount`);
    assert.equal(Number(payment.organizerAmount), Number(payment.amount), `${payment.id}: organizerAmount must equal the original amount`);
    assert.equal(Number(payment.platformFeeAmount), 0, `${payment.id}: no fee was ever actually charged historically`);
  }
});
