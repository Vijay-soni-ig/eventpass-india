-- ============================================================================
-- EVENTPASS V2 — Organizer/Exhibitor foundation
--
-- This migration is additive and non-destructive:
--   * No existing column is dropped or renamed.
--   * No existing row is deleted.
--   * New required columns/relations are added nullable first, backfilled
--     from existing data, then (where the schema requires it) tightened to
--     NOT NULL — never the other way around.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. New enums
-- ----------------------------------------------------------------------------
CREATE TYPE "PlatformRole" AS ENUM ('super_admin');
CREATE TYPE "OrganizerMemberRole" AS ENUM ('owner', 'admin', 'operations', 'finance', 'marketing', 'scanner');
CREATE TYPE "OrganizerMemberStatus" AS ENUM ('active', 'invited');
CREATE TYPE "ExhibitorMemberRole" AS ENUM ('owner', 'admin', 'staff');
CREATE TYPE "ExhibitorMemberStatus" AS ENUM ('active', 'invited');
CREATE TYPE "ParticipationStatus" AS ENUM ('invited', 'confirmed', 'rejected', 'cancelled');
CREATE TYPE "CheckInMethod" AS ENUM ('qr', 'manual');
CREATE TYPE "LeadStatus" AS ENUM ('new', 'contacted', 'qualified', 'converted', 'dropped');

-- ----------------------------------------------------------------------------
-- 2. users.platformRole (foundation for Platform Admin)
-- ----------------------------------------------------------------------------
ALTER TABLE "users" ADD COLUMN "platformRole" "PlatformRole";

-- ----------------------------------------------------------------------------
-- 3. ORGANIZER — new tenant root that owns exhibitions.
--    "_legacy_owner_user_id" is a migration-only helper column used to wire
--    up exhibitions/organizer_memberships from existing data; dropped at
--    the end of this migration.
-- ----------------------------------------------------------------------------
CREATE TABLE "organizers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessType" TEXT,
    "address" TEXT,
    "gst" TEXT,
    "pan" TEXT,
    "website" TEXT,
    "logoUrl" TEXT,
    "brandPrimaryColor" TEXT,
    "brandSecondaryColor" TEXT,
    "kycStatus" "KycStatus" NOT NULL DEFAULT 'pending',
    "bankAccountName" TEXT,
    "bankAccountNumber" TEXT,
    "bankIfsc" TEXT,
    "bankVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "organizers" ADD COLUMN "_legacy_owner_user_id" TEXT;

-- Backfill: one Organizer per distinct existing Exhibition.ownerId, named
-- from that owner's ExhibitorBusiness company name where available, else
-- their full name, else their email.
INSERT INTO "organizers" ("id", "name", "kycStatus", "bankVerified", "createdAt", "updatedAt", "_legacy_owner_user_id")
SELECT
    gen_random_uuid()::text,
    COALESCE(eb."companyName", u."fullName", u."email"),
    'pending',
    false,
    now(),
    now(),
    u."id"
FROM (SELECT DISTINCT "ownerId" FROM "exhibitions") AS owners
JOIN "users" u ON u."id" = owners."ownerId"
LEFT JOIN "exhibitor_businesses" eb ON eb."ownerId" = u."id";

-- ----------------------------------------------------------------------------
-- 4. EXHIBITION.organizerId — add nullable, backfill, then tighten.
-- ----------------------------------------------------------------------------
ALTER TABLE "exhibitions" ADD COLUMN "organizerId" TEXT;

UPDATE "exhibitions" e
SET "organizerId" = o."id"
FROM "organizers" o
WHERE o."_legacy_owner_user_id" = e."ownerId";

ALTER TABLE "exhibitions" ALTER COLUMN "organizerId" SET NOT NULL;

CREATE INDEX "exhibitions_ownerId_idx" ON "exhibitions"("ownerId");
CREATE INDEX "exhibitions_organizerId_idx" ON "exhibitions"("organizerId");

ALTER TABLE "exhibitions" ADD CONSTRAINT "exhibitions_organizerId_fkey"
    FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 5. ORGANIZER MEMBERSHIP — replaces ad-hoc ownership with real RBAC.
-- ----------------------------------------------------------------------------
CREATE TABLE "organizer_memberships" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "userId" TEXT,
    "invitedEmail" TEXT,
    "role" "OrganizerMemberRole" NOT NULL,
    "status" "OrganizerMemberStatus" NOT NULL DEFAULT 'invited',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizer_memberships_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "organizer_memberships_organizerId_idx" ON "organizer_memberships"("organizerId");
CREATE INDEX "organizer_memberships_userId_idx" ON "organizer_memberships"("userId");
CREATE UNIQUE INDEX "organizer_memberships_organizerId_userId_key" ON "organizer_memberships"("organizerId", "userId");

ALTER TABLE "organizer_memberships" ADD CONSTRAINT "organizer_memberships_organizerId_fkey"
    FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organizer_memberships" ADD CONSTRAINT "organizer_memberships_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: the original owner of each exhibition becomes that Organizer's
-- "owner" member, preserving who was in control before this migration.
INSERT INTO "organizer_memberships" ("id", "organizerId", "userId", "role", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, o."id", o."_legacy_owner_user_id", 'owner', 'active', now(), now()
FROM "organizers" o;

ALTER TABLE "organizers" DROP COLUMN "_legacy_owner_user_id";

-- ----------------------------------------------------------------------------
-- 6. EXHIBITOR MEMBERSHIP — company-level staff roles, separate from
--    organizer roles.
-- ----------------------------------------------------------------------------
CREATE TABLE "exhibitor_memberships" (
    "id" TEXT NOT NULL,
    "exhibitorBusinessId" TEXT NOT NULL,
    "userId" TEXT,
    "invitedEmail" TEXT,
    "role" "ExhibitorMemberRole" NOT NULL,
    "status" "ExhibitorMemberStatus" NOT NULL DEFAULT 'invited',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exhibitor_memberships_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "exhibitor_memberships_exhibitorBusinessId_idx" ON "exhibitor_memberships"("exhibitorBusinessId");
CREATE INDEX "exhibitor_memberships_userId_idx" ON "exhibitor_memberships"("userId");
CREATE UNIQUE INDEX "exhibitor_memberships_exhibitorBusinessId_userId_key" ON "exhibitor_memberships"("exhibitorBusinessId", "userId");

ALTER TABLE "exhibitor_memberships" ADD CONSTRAINT "exhibitor_memberships_exhibitorBusinessId_fkey"
    FOREIGN KEY ("exhibitorBusinessId") REFERENCES "exhibitor_businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exhibitor_memberships" ADD CONSTRAINT "exhibitor_memberships_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every existing ExhibitorBusiness owner becomes that business's
-- "owner" member.
INSERT INTO "exhibitor_memberships" ("id", "exhibitorBusinessId", "userId", "role", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, eb."id", eb."ownerId", 'owner', 'active', now(), now()
FROM "exhibitor_businesses" eb;

-- ----------------------------------------------------------------------------
-- 7. EXHIBITION <-> EXHIBITOR participation (replaces "exhibitor owns the
--    exhibition"). Unique constraint prevents duplicate participation.
-- ----------------------------------------------------------------------------
CREATE TABLE "exhibition_exhibitors" (
    "id" TEXT NOT NULL,
    "exhibitionId" TEXT NOT NULL,
    "exhibitorBusinessId" TEXT NOT NULL,
    "status" "ParticipationStatus" NOT NULL DEFAULT 'invited',
    "boothNumber" TEXT,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exhibition_exhibitors_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "exhibition_exhibitors_exhibitionId_idx" ON "exhibition_exhibitors"("exhibitionId");
CREATE INDEX "exhibition_exhibitors_exhibitorBusinessId_idx" ON "exhibition_exhibitors"("exhibitorBusinessId");
CREATE UNIQUE INDEX "exhibition_exhibitors_exhibitionId_exhibitorBusinessId_key" ON "exhibition_exhibitors"("exhibitionId", "exhibitorBusinessId");

ALTER TABLE "exhibition_exhibitors" ADD CONSTRAINT "exhibition_exhibitors_exhibitionId_fkey"
    FOREIGN KEY ("exhibitionId") REFERENCES "exhibitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exhibition_exhibitors" ADD CONSTRAINT "exhibition_exhibitors_exhibitorBusinessId_fkey"
    FOREIGN KEY ("exhibitorBusinessId") REFERENCES "exhibitor_businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: derive participation from existing stall buyers and stall
-- booking buyers (matched by email to a User who owns an ExhibitorBusiness).
-- Buyers who don't match an existing exhibitor account are left as legacy
-- free-text data on the stall/booking rows (unchanged) with no participation
-- row — nothing is lost, this only adds structure where it can be inferred.
INSERT INTO "exhibition_exhibitors" ("id", "exhibitionId", "exhibitorBusinessId", "status", "invitedAt", "confirmedAt", "createdAt", "updatedAt")
SELECT DISTINCT gen_random_uuid()::text, matched."exhibitionId", matched."exhibitorBusinessId", 'confirmed'::"ParticipationStatus", now(), now(), now(), now()
FROM (
    SELECT s."exhibitionId" AS "exhibitionId", eb."id" AS "exhibitorBusinessId"
    FROM "stalls" s
    JOIN "users" u ON lower(u."email") = lower(s."buyerEmail")
    JOIN "exhibitor_businesses" eb ON eb."ownerId" = u."id"
    WHERE s."buyerEmail" IS NOT NULL

    UNION

    SELECT sb."exhibitionId" AS "exhibitionId", eb."id" AS "exhibitorBusinessId"
    FROM "stall_bookings" sb
    JOIN "users" u ON lower(u."email") = lower(sb."buyerEmail")
    JOIN "exhibitor_businesses" eb ON eb."ownerId" = u."id"
    WHERE sb."buyerEmail" IS NOT NULL
) AS matched
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 8. STALL.exhibitionExhibitorId — a stall can be allocated to at most one
--    participation (single nullable FK), which by construction prevents
--    duplicate stall allocation.
-- ----------------------------------------------------------------------------
ALTER TABLE "stalls" ADD COLUMN "exhibitionExhibitorId" TEXT;

UPDATE "stalls" s
SET "exhibitionExhibitorId" = ee."id"
FROM "exhibition_exhibitors" ee
JOIN "exhibitor_businesses" eb ON eb."id" = ee."exhibitorBusinessId"
JOIN "users" u ON u."id" = eb."ownerId"
WHERE ee."exhibitionId" = s."exhibitionId"
  AND s."buyerEmail" IS NOT NULL
  AND lower(u."email") = lower(s."buyerEmail");

CREATE INDEX "stalls_exhibitionId_idx" ON "stalls"("exhibitionId");
CREATE INDEX "stalls_exhibitionExhibitorId_idx" ON "stalls"("exhibitionExhibitorId");

ALTER TABLE "stalls" ADD CONSTRAINT "stalls_exhibitionExhibitorId_fkey"
    FOREIGN KEY ("exhibitionExhibitorId") REFERENCES "exhibition_exhibitors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 9. PAYMENT — single reconciliation point. Backfilled from existing
--    booking amount/status so historical bookings gain a real payment
--    record instead of only flat fields.
-- ----------------------------------------------------------------------------
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "gateway" TEXT,
    "gatewayRefId" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payments_status_idx" ON "payments"("status");

-- ticket_bookings: add paymentId + updatedAt
ALTER TABLE "ticket_bookings" ADD COLUMN "paymentId" TEXT;
ALTER TABLE "ticket_bookings" ADD COLUMN "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
UPDATE "ticket_bookings" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "ticket_bookings" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "ticket_bookings" ALTER COLUMN "updatedAt" DROP DEFAULT;

INSERT INTO "payments" ("id", "amount", "currency", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, tb."amountPaid", 'INR', tb."paymentStatus", tb."createdAt", tb."createdAt"
FROM "ticket_bookings" tb;

UPDATE "ticket_bookings" tb
SET "paymentId" = p."id"
FROM "payments" p
WHERE p."createdAt" = tb."createdAt" AND p."amount" = tb."amountPaid" AND p."status" = tb."paymentStatus"
  AND p."id" NOT IN (SELECT "paymentId" FROM "ticket_bookings" WHERE "paymentId" IS NOT NULL)
  AND tb."paymentId" IS NULL;

CREATE UNIQUE INDEX "ticket_bookings_paymentId_key" ON "ticket_bookings"("paymentId");
CREATE INDEX "ticket_bookings_exhibitionId_idx" ON "ticket_bookings"("exhibitionId");
CREATE INDEX "ticket_bookings_ticketTypeId_idx" ON "ticket_bookings"("ticketTypeId");
CREATE INDEX "ticket_bookings_buyerUserId_idx" ON "ticket_bookings"("buyerUserId");

ALTER TABLE "ticket_bookings" ADD CONSTRAINT "ticket_bookings_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- stall_bookings: add paymentId + updatedAt
ALTER TABLE "stall_bookings" ADD COLUMN "paymentId" TEXT;
ALTER TABLE "stall_bookings" ADD COLUMN "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
UPDATE "stall_bookings" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "stall_bookings" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "stall_bookings" ALTER COLUMN "updatedAt" DROP DEFAULT;

INSERT INTO "payments" ("id", "amount", "currency", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, sb."amountPaid", 'INR', sb."paymentStatus", sb."createdAt", sb."createdAt"
FROM "stall_bookings" sb;

UPDATE "stall_bookings" sb
SET "paymentId" = p."id"
FROM "payments" p
WHERE p."createdAt" = sb."createdAt" AND p."amount" = sb."amountPaid" AND p."status" = sb."paymentStatus"
  AND p."id" NOT IN (SELECT "paymentId" FROM "stall_bookings" WHERE "paymentId" IS NOT NULL)
  AND p."id" NOT IN (SELECT "paymentId" FROM "ticket_bookings" WHERE "paymentId" IS NOT NULL)
  AND sb."paymentId" IS NULL;

CREATE UNIQUE INDEX "stall_bookings_paymentId_key" ON "stall_bookings"("paymentId");
CREATE INDEX "stall_bookings_stallId_idx" ON "stall_bookings"("stallId");
CREATE INDEX "stall_bookings_exhibitionId_idx" ON "stall_bookings"("exhibitionId");
CREATE INDEX "stall_bookings_buyerUserId_idx" ON "stall_bookings"("buyerUserId");

ALTER TABLE "stall_bookings" ADD CONSTRAINT "stall_bookings_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 10. ticket_types.updatedAt / team_members.updatedAt — consistency only.
-- ----------------------------------------------------------------------------
ALTER TABLE "ticket_types" ADD COLUMN "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
UPDATE "ticket_types" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "ticket_types" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "ticket_types" ALTER COLUMN "updatedAt" DROP DEFAULT;
CREATE INDEX "ticket_types_exhibitionId_idx" ON "ticket_types"("exhibitionId");

ALTER TABLE "team_members" ADD COLUMN "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
UPDATE "team_members" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "team_members" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "team_members" ALTER COLUMN "updatedAt" DROP DEFAULT;
CREATE INDEX "team_members_businessId_idx" ON "team_members"("businessId");
CREATE INDEX "team_members_userId_idx" ON "team_members"("userId");

-- ----------------------------------------------------------------------------
-- 11. CHECK-IN — append-only scan history. Backfilled from the existing
--     flat checkInStatus/checkInTime pair (kept as-is on ticket_bookings).
-- ----------------------------------------------------------------------------
CREATE TABLE "check_ins" (
    "id" TEXT NOT NULL,
    "ticketBookingId" TEXT NOT NULL,
    "scannedByUserId" TEXT,
    "method" "CheckInMethod" NOT NULL DEFAULT 'qr',
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "check_ins_ticketBookingId_idx" ON "check_ins"("ticketBookingId");
CREATE INDEX "check_ins_scannedByUserId_idx" ON "check_ins"("scannedByUserId");

ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_ticketBookingId_fkey"
    FOREIGN KEY ("ticketBookingId") REFERENCES "ticket_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_scannedByUserId_fkey"
    FOREIGN KEY ("scannedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "check_ins" ("id", "ticketBookingId", "scannedByUserId", "method", "scannedAt")
SELECT gen_random_uuid()::text, tb."id", NULL, 'manual', COALESCE(tb."checkInTime", tb."createdAt")
FROM "ticket_bookings" tb
WHERE tb."checkInStatus" = true;

-- ----------------------------------------------------------------------------
-- 12. LEAD — foundation only, no existing data to backfill.
-- ----------------------------------------------------------------------------
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "exhibitionExhibitorId" TEXT NOT NULL,
    "ticketBookingId" TEXT,
    "capturedByUserId" TEXT,
    "notes" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'new',
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "leads_exhibitionExhibitorId_idx" ON "leads"("exhibitionExhibitorId");
CREATE INDEX "leads_ticketBookingId_idx" ON "leads"("ticketBookingId");
CREATE INDEX "leads_capturedByUserId_idx" ON "leads"("capturedByUserId");

ALTER TABLE "leads" ADD CONSTRAINT "leads_exhibitionExhibitorId_fkey"
    FOREIGN KEY ("exhibitionExhibitorId") REFERENCES "exhibition_exhibitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_ticketBookingId_fkey"
    FOREIGN KEY ("ticketBookingId") REFERENCES "ticket_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_capturedByUserId_fkey"
    FOREIGN KEY ("capturedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- 13. AUDIT LOG — cross-cutting trace, foundation only.
-- ----------------------------------------------------------------------------
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_actorUserId_idx" ON "audit_logs"("actorUserId");
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "audit_logs" ("id", "actorUserId", "action", "entityType", "entityId", "metadata", "createdAt")
VALUES (gen_random_uuid()::text, NULL, 'schema_migration', 'system', NULL,
        '{"migration": "20260904000000_v2_organizer_exhibitor_foundation"}', now());
