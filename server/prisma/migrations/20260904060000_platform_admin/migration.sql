-- ============================================================================
-- EVENTPASS V2 — Platform Admin (organizer suspend/activate)
-- Additive: new nullable/defaulted columns only, no existing data affected.
-- ============================================================================

ALTER TABLE "organizers"
    ADD COLUMN "suspended" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "suspendedReason" TEXT,
    ADD COLUMN "suspendedAt" TIMESTAMP(3);
