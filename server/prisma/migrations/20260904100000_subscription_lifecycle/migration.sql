-- Phase 20B — Subscription Lifecycle
--
-- Purely a data migration — no schema change. The Plan/Subscription models
-- (server/prisma/schema.prisma) added in Phase 19A already have every
-- column this phase needs (price, currency, active, eventLimit/
-- visitorLimit/exhibitorLimit/stallLimit/teamMemberLimit, features JSON;
-- Subscription's status/currentPeriodStart/currentPeriodEnd/trialEndsAt).
-- See docs/PHASE_20B_SUBSCRIPTION_LIFECYCLE_REPORT.md §16 for why no
-- schema change was needed.
--
-- Two things happen here:
--   1. Insert the three real commercial Plan rows recommended by
--      docs/PHASE_20A_COMMERCIAL_MODEL_REPORT.md §7-8 (Starter/Growth/
--      Enterprise). The pre-existing 'plan-custom-unconfigured' row
--      (created by the Phase 19A migration as an FK placeholder, never a
--      real offer) is left completely untouched — not renamed, not
--      repurposed, not deleted.
--   2. Backfill a Starter trialing Subscription for every Organizer that
--      already exists at the time this migration runs and doesn't yet
--      have one — so no pre-existing organizer is left without a
--      subscription record once the lifecycle goes live. This is a
--      one-time catch-up for whatever already exists in a given
--      environment's database; server/prisma/seed.ts separately creates
--      the same row (idempotently, same deterministic id) for its own
--      fixture organizer so a from-scratch dev setup (migrate then seed,
--      no pre-existing organizers to backfill) is covered too.
--
-- Uses explicit literal timestamps rather than CURRENT_TIMESTAMP for the
-- same reason documented in migration 20260904080100_fix_pricing_version_timezone:
-- CURRENT_TIMESTAMP evaluates in the Postgres session's local timezone but
-- is stored in a timezone-naive column Prisma always reads back as UTC.
-- Nothing here is ever compared against `new Date()` the way
-- PricingVersion.effectiveFrom was, so the bug that migration fixed
-- couldn't actually recur here — but there is no reason to reintroduce the
-- same footgun when an explicit literal costs nothing.

INSERT INTO "plans"
    ("id", "code", "name", "description", "billingInterval", "price", "currency", "active",
     "eventLimit", "visitorLimit", "exhibitorLimit", "stallLimit", "teamMemberLimit", "features",
     "createdAt", "updatedAt")
VALUES
    ('plan-starter', 'starter', 'Starter',
     'First exhibition free, administered as a trialing Subscription (see subscriptionService.ts) rather than a coded discount. INR 14,999/event thereafter. Recommended by docs/PHASE_20A_COMMERCIAL_MODEL_REPORT.md Sections 7-8. Price is not yet collected anywhere -- Razorpay/subscription billing remains deferred.',
     'custom', 14999.00, 'INR', true,
     1, 1000, 25, 25, 3,
     '{"exhibition_management":true,"stall_management":true,"ticket_management":true,"exhibitor_management":true,"visitor_registration":true,"qr_checkin":true,"lead_management":true,"analytics":true,"documents":true,"team_management":true,"refunds":true,"payments":true,"supportLevel":"community"}'::jsonb,
     '2026-09-04 00:00:00', '2026-09-04 00:00:00'),
    ('plan-growth', 'growth', 'Growth',
     'INR 24,999/event, or INR 1,49,000/year for the Growth Annual unlimited-events package. Recommended by docs/PHASE_20A_COMMERCIAL_MODEL_REPORT.md Sections 7-8. Price is not yet collected anywhere -- Razorpay/subscription billing remains deferred.',
     'custom', 24999.00, 'INR', true,
     5, 10000, 150, 150, 10,
     '{"exhibition_management":true,"stall_management":true,"ticket_management":true,"exhibitor_management":true,"visitor_registration":true,"qr_checkin":true,"lead_management":true,"analytics":true,"documents":true,"team_management":true,"refunds":true,"payments":true,"supportLevel":"priority"}'::jsonb,
     '2026-09-04 00:00:00', '2026-09-04 00:00:00'),
    ('plan-enterprise', 'enterprise', 'Enterprise',
     'Custom/negotiated pricing -- the 0.00 stored here is a placeholder marker, exactly like plan-custom-unconfigured''s own price, never a real committed figure or a free tier. All limits are NULL, using this schema''s own pre-existing "nullable limit = unlimited" convention (see Plan''s doc comment) rather than an invented large number.',
     'custom', 0.00, 'INR', true,
     NULL, NULL, NULL, NULL, NULL,
     '{"exhibition_management":true,"stall_management":true,"ticket_management":true,"exhibitor_management":true,"visitor_registration":true,"qr_checkin":true,"lead_management":true,"analytics":true,"documents":true,"team_management":true,"refunds":true,"payments":true,"supportLevel":"dedicated","pricingModel":"custom"}'::jsonb,
     '2026-09-04 00:00:00', '2026-09-04 00:00:00')
ON CONFLICT ("id") DO NOTHING;

-- Backfill: existing organizers never blocked, never left without a
-- subscription record. Deterministic id ('sub-trial-' || organizer id) so
-- this is naturally idempotent if this migration or the seed script's own
-- equivalent upsert ever runs again against the same organizer.
INSERT INTO "subscriptions"
    ("id", "organizerId", "planId", "status", "currentPeriodStart", "currentPeriodEnd", "trialEndsAt",
     "createdAt", "updatedAt")
SELECT
    'sub-trial-' || o."id", o."id", 'plan-starter', 'trialing', NULL, NULL, NULL,
    '2026-09-04 00:00:00', '2026-09-04 00:00:00'
FROM "organizers" o
WHERE NOT EXISTS (SELECT 1 FROM "subscriptions" s WHERE s."organizerId" = o."id")
ON CONFLICT ("id") DO NOTHING;
