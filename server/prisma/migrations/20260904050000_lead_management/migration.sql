-- ============================================================================
-- EVENTPASS V2 — Lead Management System
--
-- Additive and non-destructive. The "leads" table has been foundation-only
-- since it was introduced (no route has ever written to it), so this is a
-- clean-slate remap; the CASE-mapping is still explicit rather than a blind
-- cast, matching the pattern used for every other status-enum change in
-- this project so it remains safe even if that assumption is ever wrong.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. LeadStatus: new/contacted/qualified/converted/dropped ->
--    new/contacted/interested/negotiation/converted/lost.
-- ----------------------------------------------------------------------------
BEGIN;

CREATE TYPE "LeadStatus_new" AS ENUM ('new', 'contacted', 'interested', 'negotiation', 'converted', 'lost');

ALTER TABLE "leads" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "leads"
    ALTER COLUMN "status" TYPE "LeadStatus_new"
    USING (
        CASE "status"::text
            WHEN 'new' THEN 'new'
            WHEN 'contacted' THEN 'contacted'
            WHEN 'qualified' THEN 'interested'
            WHEN 'converted' THEN 'converted'
            WHEN 'dropped' THEN 'lost'
            ELSE 'new'
        END
    )::"LeadStatus_new";

ALTER TYPE "LeadStatus" RENAME TO "LeadStatus_old";
ALTER TYPE "LeadStatus_new" RENAME TO "LeadStatus";
DROP TYPE "LeadStatus_old";

ALTER TABLE "leads" ALTER COLUMN "status" SET DEFAULT 'new';

COMMIT;

-- ----------------------------------------------------------------------------
-- 2. New enums for priority and capture source.
-- ----------------------------------------------------------------------------
CREATE TYPE "LeadPriority" AS ENUM ('low', 'medium', 'high');
CREATE TYPE "LeadSource" AS ENUM ('qr_scan', 'manual');

-- ----------------------------------------------------------------------------
-- 3. New Lead columns: visitor contact fields (support manual/business-card
--    capture with no ticket-holder account), source, assignment, priority,
--    follow-up date.
-- ----------------------------------------------------------------------------
ALTER TABLE "leads"
    ADD COLUMN "visitorName" TEXT,
    ADD COLUMN "visitorEmail" TEXT,
    ADD COLUMN "visitorPhone" TEXT,
    ADD COLUMN "source" "LeadSource" NOT NULL DEFAULT 'manual',
    ADD COLUMN "assignedToUserId" TEXT,
    ADD COLUMN "priority" "LeadPriority" NOT NULL DEFAULT 'medium',
    ADD COLUMN "followUpDate" TIMESTAMP(3);

CREATE INDEX "leads_assignedToUserId_idx" ON "leads"("assignedToUserId");
CREATE INDEX "leads_status_idx" ON "leads"("status");

ALTER TABLE "leads" ADD CONSTRAINT "leads_assignedToUserId_fkey"
    FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
