-- ============================================================================
-- EVENTPASS V2 — Exhibitor participation workflow
--
-- Additive and non-destructive:
--   * ParticipationStatus grows from 4 values to the full application ->
--     approval -> stall selection -> payment -> confirmation state machine.
--     Existing rows are remapped (not dropped) via an explicit CASE, never a
--     blind cast, so this is safe even with real production data.
--   * No existing column is dropped; stall_bookings gains a new nullable FK.
--   * New "documents" table for exhibitor KYC/verification uploads.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ParticipationStatus: 4 legacy values -> 8 workflow states.
--    invited -> applied, confirmed -> confirmed, rejected -> rejected,
--    cancelled -> cancelled (no data loss; every old row maps to exactly one
--    new value).
-- ----------------------------------------------------------------------------
BEGIN;

CREATE TYPE "ParticipationStatus_new" AS ENUM (
    'applied', 'approved', 'rejected', 'stall_pending', 'stall_reserved', 'payment_pending', 'confirmed', 'cancelled'
);

ALTER TABLE "exhibition_exhibitors" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "exhibition_exhibitors"
    ALTER COLUMN "status" TYPE "ParticipationStatus_new"
    USING (
        CASE "status"::text
            WHEN 'invited' THEN 'applied'
            WHEN 'confirmed' THEN 'confirmed'
            WHEN 'rejected' THEN 'rejected'
            WHEN 'cancelled' THEN 'cancelled'
            ELSE 'applied'
        END
    )::"ParticipationStatus_new";

ALTER TYPE "ParticipationStatus" RENAME TO "ParticipationStatus_old";
ALTER TYPE "ParticipationStatus_new" RENAME TO "ParticipationStatus";
DROP TYPE "ParticipationStatus_old";

ALTER TABLE "exhibition_exhibitors" ALTER COLUMN "status" SET DEFAULT 'applied';

COMMIT;

-- ----------------------------------------------------------------------------
-- 2. Housekeeping: a handful of @updatedAt columns from earlier migrations
--    still carried a DB-level DEFAULT CURRENT_TIMESTAMP left over from their
--    backfill. Prisma manages updatedAt at the application level, so this
--    drops the now-redundant DB default — purely cosmetic, no data change.
-- ----------------------------------------------------------------------------
ALTER TABLE "exhibitor_memberships" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "leads" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "organizer_memberships" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "organizers" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "payments" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- ----------------------------------------------------------------------------
-- 3. STALL_BOOKING <-> EXHIBITION_EXHIBITOR — lets payment history be
--    queried directly per participation instead of joining through Stall.
-- ----------------------------------------------------------------------------
ALTER TABLE "stall_bookings" ADD COLUMN "exhibitionExhibitorId" TEXT;

CREATE INDEX "stall_bookings_exhibitionExhibitorId_idx" ON "stall_bookings"("exhibitionExhibitorId");

ALTER TABLE "stall_bookings" ADD CONSTRAINT "stall_bookings_exhibitionExhibitorId_fkey"
    FOREIGN KEY ("exhibitionExhibitorId") REFERENCES "exhibition_exhibitors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 4. DOCUMENT — exhibitor KYC/verification file uploads. New, empty table.
-- ----------------------------------------------------------------------------
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "exhibitorBusinessId" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "name" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "documents_exhibitorBusinessId_idx" ON "documents"("exhibitorBusinessId");

ALTER TABLE "documents" ADD CONSTRAINT "documents_exhibitorBusinessId_fkey"
    FOREIGN KEY ("exhibitorBusinessId") REFERENCES "exhibitor_businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploadedByUserId_fkey"
    FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
