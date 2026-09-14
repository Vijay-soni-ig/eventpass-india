-- FP-05: reservation expiry. Additive only — does not alter existing
-- stall status/booking/payment behavior.

ALTER TABLE "stalls" ADD COLUMN "reservedAt" TIMESTAMP(3);

CREATE INDEX "stalls_status_reservedAt_idx" ON "stalls"("status", "reservedAt");
