-- Phase 21B (P1-1): additive idempotency support for visitor ticket bookings.
-- Nullable column + a unique index that Postgres never enforces across NULLs,
-- so every existing row (idempotencyKey = NULL) is untouched and no existing
-- data can violate the new constraint.
ALTER TABLE "ticket_bookings" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "ticket_bookings_buyerUserId_idempotencyKey_key" ON "ticket_bookings"("buyerUserId", "idempotencyKey");
