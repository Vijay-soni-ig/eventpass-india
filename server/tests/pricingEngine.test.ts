import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { calculatePricing } from "../src/lib/pricingEngine";
import { prisma } from "../src/lib/prisma";

// These tests exercise the shared pricing engine directly against whatever
// PricingVersion is currently active in the database — i.e. the real,
// live-configured behavior, not a mocked one. At the time this suite was
// written, that's the Phase 19A "launch-2026" version: platform fee = none
// (₹0), tax = unconfigured (not "0% tax" — genuinely unset). If a future
// phase configures a real fee/tax, these specific assertions about the
// TOTAL matching the base amount will need updating — that's intentional;
// it's exactly the kind of change PricingVersion versioning exists to make
// visible rather than silent.

after(async () => {
  await prisma.$disconnect();
});

// Test 1 — paid ticket + zero platform fee + tax unconfigured.
test("paid ticket (₹500): total equals base amount under the current zero-fee, unconfigured-tax pricing version", async () => {
  const breakdown = await calculatePricing(500);
  assert.equal(breakdown.baseAmount, 500);
  assert.equal(breakdown.platformFeeAmount, 0);
  assert.equal(breakdown.taxAmount, 0);
  assert.equal(breakdown.totalAmount, 500);
  assert.ok(breakdown.pricingVersionId, "pricingVersionId must be present");
});

// Test 2 — free ticket.
test("free ticket (₹0): total is ₹0", async () => {
  const breakdown = await calculatePricing(0);
  assert.equal(breakdown.baseAmount, 0);
  assert.equal(breakdown.totalAmount, 0);
  assert.equal(breakdown.platformFeeAmount, 0);
  assert.equal(breakdown.taxAmount, 0);
});

// Test 3 — paid stall + zero platform fee + tax unconfigured.
test("paid stall (₹10,000): total equals base amount", async () => {
  const breakdown = await calculatePricing(10000);
  assert.equal(breakdown.baseAmount, 10000);
  assert.equal(breakdown.totalAmount, 10000);
});

// Test 4 — deterministic repeated calculation.
test("calculatePricing is deterministic: identical input produces identical output across repeated calls", async () => {
  const first = await calculatePricing(1999);
  const second = await calculatePricing(1999);
  const third = await calculatePricing(1999);
  assert.deepEqual(first, second);
  assert.deepEqual(second, third);
});

// Test 5 — pricing breakdown totals reconcile.
test("breakdown reconciles: totalAmount = baseAmount + platformFeeAmount + gatewayFeeAmount + taxAmount - discountAmount", async () => {
  for (const base of [0, 1, 499, 500, 1999, 10000, 84999.99]) {
    const b = await calculatePricing(base);
    const expected = b.baseAmount + b.platformFeeAmount + b.gatewayFeeAmount + b.taxAmount - b.discountAmount;
    assert.equal(b.totalAmount, Math.round((expected + Number.EPSILON) * 100) / 100, `mismatch for base=${base}`);
  }
});

// Test 11 — existing free-ticket behavior remains intact (organizer/platform
// revenue split for a ₹0 transaction).
test("free ticket: organizerAmount and platformRevenueAmount are both ₹0", async () => {
  const breakdown = await calculatePricing(0);
  assert.equal(breakdown.organizerAmount, 0);
  assert.equal(breakdown.platformRevenueAmount, 0);
});
