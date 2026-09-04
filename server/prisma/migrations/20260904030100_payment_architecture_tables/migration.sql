-- ============================================================================
-- EVENTPASS V2 — Production payment architecture (part 2)
-- Runs after the enum values from the previous migration have committed.
-- ============================================================================

ALTER TABLE "payments" ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "providerOrderId" TEXT,
ADD COLUMN     "providerPaymentId" TEXT,
ALTER COLUMN "status" SET DEFAULT 'created';

ALTER TABLE "stall_bookings" ALTER COLUMN "paymentStatus" SET DEFAULT 'created';

ALTER TABLE "ticket_bookings" ALTER COLUMN "paymentStatus" SET DEFAULT 'created';

CREATE TABLE "payment_events" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_events_paymentId_idx" ON "payment_events"("paymentId");

CREATE UNIQUE INDEX "payment_events_provider_providerEventId_key" ON "payment_events"("provider", "providerEventId");

CREATE UNIQUE INDEX "payments_providerOrderId_key" ON "payments"("providerOrderId");

CREATE UNIQUE INDEX "payments_providerPaymentId_key" ON "payments"("providerPaymentId");

CREATE INDEX "payments_providerOrderId_idx" ON "payments"("providerOrderId");

ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Also fixes a leftover DB-level default from an earlier migration's
-- backfill step (cosmetic, no data change — Prisma manages updatedAt at
-- the application level).
ALTER TABLE "exhibition_exhibitors" ALTER COLUMN "updatedAt" DROP DEFAULT;
