import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";

after(async () => {
  await prisma.$disconnect();
});

// Compatibility #1 — the pre-existing seed organizer was backfilled with a
// Starter trial, never blocked, never silently dropped.
test("the pre-existing seed organizer has a Starter trialing subscription (backfill), not left without one", async () => {
  const organizer = await prisma.organizer.findUnique({ where: { id: "seed-organizer-1" } });
  assert.ok(organizer, "the seed organizer must still exist, untouched by this phase");

  const subscription = await prisma.subscription.findFirst({ where: { organizerId: "seed-organizer-1" }, include: { plan: true } });
  assert.ok(subscription, "the pre-existing organizer must have been backfilled with a subscription");
  assert.equal(subscription!.status, "trialing");
  assert.equal(subscription!.plan.code, "starter");
});

// Compatibility #2 — existing payments untouched.
test("existing legacy payments remain readable and numerically unchanged", async () => {
  const legacyPayments = await prisma.payment.findMany({ where: { id: { startsWith: "seed-payment-" } } });
  assert.ok(legacyPayments.length > 0, "expected seeded legacy payments to exist");
  for (const payment of legacyPayments) {
    assert.equal(Number(payment.baseAmount), Number(payment.amount), `${payment.id}: baseAmount must still equal amount`);
  }
});

// Compatibility #3 — existing refunds untouched (Phase 19B's refunded seed ticket).
test("the pre-existing refunded seed payment's refund state is unchanged", async () => {
  const payment = await prisma.payment.findUnique({ where: { id: "seed-payment-ticket-10" } });
  assert.ok(payment, "seed-payment-ticket-10 must still exist");
  assert.equal(payment!.status, "refunded");
  assert.equal(Number(payment!.refundedAmount), Number(payment!.amount), "a fully-refunded legacy payment's refundedAmount must equal its amount");
});

// Compatibility #4 — existing PricingVersions untouched.
test("existing PricingVersion rows are unmodified by subscription lifecycle work", async () => {
  const legacy = await prisma.pricingVersion.findUnique({ where: { code: "legacy-unversioned" } });
  const launch = await prisma.pricingVersion.findUnique({ where: { code: "launch-2026" } });
  assert.ok(legacy, "the legacy PricingVersion must still exist");
  assert.ok(launch, "the launch PricingVersion must still exist");
  assert.equal(legacy!.active, false);
  assert.equal(launch!.active, true);
});
