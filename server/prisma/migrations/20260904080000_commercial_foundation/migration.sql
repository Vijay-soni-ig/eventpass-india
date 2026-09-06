-- ============================================================================
-- EVENTPASS / EXHIBITTIX V2 — Phase 19A: Commercial Foundation
--
-- Additive and non-destructive throughout. No existing column is dropped,
-- renamed, or reinterpreted; no existing row's values are changed except to
-- populate brand-new nullable-then-backfilled columns on `payments`.
--
-- What this migration does:
--   1. Creates Plan / Subscription (foundation only, unused/unenforced).
--   2. Creates PricingVersion, and inserts exactly two rows:
--        - a LEGACY version (inactive) that every pre-existing Payment is
--          backfilled to reference, so historical data has a defensible,
--          honestly-labeled pricing-version trail rather than a guessed one
--        - a LAUNCH version (active) — platform fee = none (₹0), tax =
--          unconfigured (NOT "0% tax") — that every new Payment created from
--          this point on will reference, via getActivePricingVersion().
--   3. Adds the commercial breakdown columns to `payments`, backfills them
--      from the existing `amount` column (baseAmount = organizerAmount =
--      amount, since no fee/tax has ever been charged), then makes the
--      required ones NOT NULL.
--   4. Inserts one seeded Plan row ("custom-unconfigured", price 0.00) so
--      the model has a real example row without inventing a commercial
--      price — see docs/PHASE_18_COMMERCIAL_PRICING_ARCHITECTURE.md and
--      docs/PHASE_19A_COMMERCIAL_FOUNDATION_REPORT.md.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
CREATE TYPE "PlanBillingInterval" AS ENUM ('monthly', 'yearly', 'one_time', 'custom');
CREATE TYPE "SubscriptionStatus" AS ENUM ('trialing', 'active', 'cancelled', 'expired', 'inactive');
CREATE TYPE "PlatformFeeType" AS ENUM ('none', 'fixed', 'percentage', 'percentage_plus_fixed');
CREATE TYPE "FeePayer" AS ENUM ('organizer', 'attendee', 'split');
CREATE TYPE "TaxMode" AS ENUM ('none', 'configured');
CREATE TYPE "TaxBasis" AS ENUM ('base_amount', 'base_plus_fee');

-- ---------------------------------------------------------------------------
-- 2. Plan
-- ---------------------------------------------------------------------------
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "billingInterval" "PlanBillingInterval" NOT NULL DEFAULT 'custom',
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "eventLimit" INTEGER,
    "visitorLimit" INTEGER,
    "exhibitorLimit" INTEGER,
    "stallLimit" INTEGER,
    "teamMemberLimit" INTEGER,
    "features" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- ---------------------------------------------------------------------------
-- 3. Subscription
-- ---------------------------------------------------------------------------
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'inactive',
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "subscriptions_organizerId_idx" ON "subscriptions"("organizerId");
CREATE INDEX "subscriptions_planId_idx" ON "subscriptions"("planId");

ALTER TABLE "subscriptions"
    ADD CONSTRAINT "subscriptions_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. PricingVersion
-- ---------------------------------------------------------------------------
CREATE TABLE "pricing_versions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "platformFeeType" "PlatformFeeType" NOT NULL DEFAULT 'none',
    "platformFeePercent" DECIMAL(5,2),
    "platformFeeFixedAmount" DECIMAL(10,2),
    "feePaidBy" "FeePayer" NOT NULL DEFAULT 'organizer',
    "taxMode" "TaxMode" NOT NULL DEFAULT 'none',
    "taxPercent" DECIMAL(5,2),
    "taxBasis" "TaxBasis",
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pricing_versions_code_key" ON "pricing_versions"("code");
CREATE INDEX "pricing_versions_active_effectiveFrom_idx" ON "pricing_versions"("active", "effectiveFrom");

-- Two seed rows: LEGACY (inactive, backfill target only) and LAUNCH (active,
-- what every new payment references starting now). Deterministic ids so
-- application code / tests can reference them by constant if useful, though
-- the intended lookup path is always getActivePricingVersion(), never a
-- hardcoded id.
INSERT INTO "pricing_versions"
    ("id", "code", "description", "platformFeeType", "feePaidBy", "taxMode", "currency", "effectiveFrom", "active", "updatedAt")
VALUES
    ('pv-legacy-unversioned', 'legacy-unversioned',
     'Backfill target for every Payment created before Phase 19A introduced pricing versioning. No fee or tax was ever actually charged on these — this row records that honestly rather than inventing a historical rate. Never selectable for new payments (active=false).',
     'none', 'organizer', 'none', 'INR', '2020-01-01 00:00:00', false, CURRENT_TIMESTAMP),
    ('pv-launch-2026', 'launch-2026',
     'Initial commercial configuration at Phase 19A: platform transaction fee = none (0), tax = unconfigured (not 0% — genuinely not yet decided). See docs/PHASE_18_COMMERCIAL_PRICING_ARCHITECTURE.md and docs/PHASE_19A_COMMERCIAL_FOUNDATION_REPORT.md. This is a provisional starting configuration, not a final business decision, and can be superseded by a new PricingVersion at any time without altering this one or any payment that already references it.',
     'none', 'organizer', 'none', 'INR', CURRENT_TIMESTAMP, true, CURRENT_TIMESTAMP);

-- One example Plan row demonstrating the model without inventing a real
-- commercial price (price = 0.00, all limits unlimited/null, inactive by
-- default since it's illustrative, not an actual offering).
INSERT INTO "plans"
    ("id", "code", "name", "description", "billingInterval", "price", "currency", "active", "updatedAt")
VALUES
    ('plan-custom-unconfigured', 'custom-unconfigured', 'Custom (Unconfigured)',
     'Placeholder plan demonstrating the Plan model. Not a real commercial offering — no SaaS plan names or prices have been finalized (see Phase 18 report). Inactive so it can never be accidentally selected as if it were real.',
     'custom', 0.00, 'INR', false, CURRENT_TIMESTAMP);

-- ---------------------------------------------------------------------------
-- 5. Payment: commercial breakdown columns
-- ---------------------------------------------------------------------------
ALTER TABLE "payments"
    ADD COLUMN "baseAmount" DECIMAL(10,2),
    ADD COLUMN "platformFeeAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN "gatewayFeeAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN "organizerAmount" DECIMAL(10,2),
    ADD COLUMN "platformRevenueAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN "feePaidBy" "FeePayer" NOT NULL DEFAULT 'organizer',
    ADD COLUMN "pricingVersionId" TEXT;

-- Backfill: baseAmount and organizerAmount both equal the existing `amount`
-- for every historical row, because no fee/tax/discount has ever actually
-- been charged (see server/src/routes/bookings.ts's pre-Phase-19A
-- `amount = unitPrice * quantity`, and the equivalent for stalls) — this is
-- not an approximation, it is exactly what happened. Every historical
-- payment is tagged with the LEGACY pricing version so it stays honestly
-- distinguishable from a payment made under a real configured version.
UPDATE "payments"
SET
    "baseAmount" = "amount",
    "organizerAmount" = "amount",
    "pricingVersionId" = 'pv-legacy-unversioned'
WHERE "baseAmount" IS NULL;

ALTER TABLE "payments"
    ALTER COLUMN "baseAmount" SET NOT NULL,
    ALTER COLUMN "organizerAmount" SET NOT NULL,
    ALTER COLUMN "pricingVersionId" SET NOT NULL;

ALTER TABLE "payments"
    ADD CONSTRAINT "payments_pricingVersionId_fkey" FOREIGN KEY ("pricingVersionId") REFERENCES "pricing_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "payments_pricingVersionId_idx" ON "payments"("pricingVersionId");
