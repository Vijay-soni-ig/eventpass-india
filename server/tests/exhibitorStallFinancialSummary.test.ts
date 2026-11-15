import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExhibitorStallFinancialSummary } from "../src/lib/exhibitorStallFinancialSummary";

test("reservation amounts are not counted as spend before payment is collected", () => {
  const summary = buildExhibitorStallFinancialSummary([{
    amountPaid: "5000.00",
    paymentStatus: "created",
    payment: { amount: "5000.00", status: "created", refundedAmount: "0.00" },
  }]);

  assert.equal(summary.grossPaid, 0);
  assert.equal(summary.refundedAmount, 0);
  assert.equal(summary.netSpend, 0);
  assert.equal(summary.pendingAmount, 5000);
  assert.equal(summary.pendingBookingCount, 1);
});

test("paid and partially refunded bookings calculate gross paid, refunds, and net spend", () => {
  const summary = buildExhibitorStallFinancialSummary([
    {
      amountPaid: "5000",
      paymentStatus: "paid",
      payment: { amount: "5000", status: "paid", refundedAmount: "0" },
    },
    {
      amountPaid: "3000",
      paymentStatus: "partially_refunded",
      payment: { amount: "3000", status: "partially_refunded", refundedAmount: "750" },
    },
  ]);

  assert.equal(summary.grossPaid, 8000);
  assert.equal(summary.refundedAmount, 750);
  assert.equal(summary.netSpend, 7250);
  assert.equal(summary.paidBookingCount, 2);
  assert.equal(summary.refundedBookingCount, 1);
});

test("fully refunded bookings contribute zero net spend", () => {
  const summary = buildExhibitorStallFinancialSummary([{
    amountPaid: "4200",
    paymentStatus: "refunded",
    payment: { amount: "4200", status: "refunded", refundedAmount: "0" },
  }]);

  assert.equal(summary.grossPaid, 4200);
  assert.equal(summary.refundedAmount, 4200);
  assert.equal(summary.netSpend, 0);
  assert.equal(summary.refundedBookingCount, 1);
});

test("failed and cancelled payment attempts are excluded from collected and pending totals", () => {
  const summary = buildExhibitorStallFinancialSummary([
    { amountPaid: "1200", paymentStatus: "failed", payment: { amount: "1200", status: "failed", refundedAmount: "0" } },
    { amountPaid: "1800", paymentStatus: "cancelled", payment: { amount: "1800", status: "cancelled", refundedAmount: "0" } },
  ]);

  assert.equal(summary.grossPaid, 0);
  assert.equal(summary.netSpend, 0);
  assert.equal(summary.pendingAmount, 0);
  assert.equal(summary.failedBookingCount, 2);
});

test("legacy bookings without a Payment relation retain paid/refunded status semantics", () => {
  const summary = buildExhibitorStallFinancialSummary([
    { amountPaid: "1000", paymentStatus: "paid" },
    { amountPaid: "500", paymentStatus: "refunded" },
  ]);

  assert.equal(summary.grossPaid, 1000);
  assert.equal(summary.refundedAmount, 500);
  assert.equal(summary.netSpend, 500);
});
