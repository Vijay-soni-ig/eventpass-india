-- Phase 19B — Refund Architecture
--
-- Purely additive: new enum values, a new table, and one new nullable-then-
-- defaulted column on the existing payments table. Nothing is dropped,
-- renamed, or rewritten. See docs/PHASE_19B_REFUND_ARCHITECTURE_REPORT.md.

-- Extend PaymentStatus with the new intermediate state. Safe under Postgres
-- 12+ inside a transaction as long as the new value isn't USED in the same
-- transaction (it isn't — this migration only adds the label).
ALTER TYPE "PaymentStatus" ADD VALUE 'partially_refunded';

-- New enums for the Refund model.
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "RefundReason" AS ENUM ('CUSTOMER_REQUEST', 'EVENT_CANCELLED', 'DUPLICATE_PAYMENT', 'ADMINISTRATIVE', 'OTHER');

-- refundedAmount: total of SUCCEEDED refunds against a payment. Defaults to
-- 0 for every existing row, then backfilled below for the one class of
-- pre-existing row where that default would be inconsistent with its own
-- status (a payment already marked "refunded" by the pre-Phase-19B,
-- full-refund-only flow). No historical `amount` value is touched.
ALTER TABLE "payments" ADD COLUMN "refundedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

UPDATE "payments" SET "refundedAmount" = "amount" WHERE "status" = 'refunded';

CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" "RefundReason" NOT NULL,
    "reasonNote" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRefundId" TEXT,
    "failureReason" TEXT,
    "requestedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refunds_providerRefundId_key" ON "refunds"("providerRefundId");
CREATE UNIQUE INDEX "refunds_paymentId_idempotencyKey_key" ON "refunds"("paymentId", "idempotencyKey");
CREATE INDEX "refunds_paymentId_idx" ON "refunds"("paymentId");
CREATE INDEX "refunds_status_idx" ON "refunds"("status");

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
