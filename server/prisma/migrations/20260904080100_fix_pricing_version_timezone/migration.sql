-- ============================================================================
-- Fix: the previous migration (20260904080000_commercial_foundation) used
-- CURRENT_TIMESTAMP to set pricing_versions."effectiveFrom" for the launch
-- version. CURRENT_TIMESTAMP is evaluated in the Postgres session's
-- configured timezone (IST, UTC+5:30 on this server) but written into a
-- "timestamp without time zone" column, which Prisma's client always reads
-- back and compares as if it were UTC. The result: the launch version's
-- effectiveFrom appeared ~5.5 hours in the FUTURE relative to
-- application-side `new Date()`, making getActivePricingVersion() find zero
-- rows — live-reproduced while running this phase's automated tests.
--
-- Per this project's own migration discipline, the already-applied prior
-- migration's file is never edited (that would change its checksum and
-- break `prisma migrate deploy` everywhere it's already been applied) —
-- the fix is a new, additive migration instead, exactly the same principle
-- PricingVersion immutability itself is built on: correct forward with a
-- new state, never rewrite history in place.
--
-- Uses an explicit, unambiguous past date (matching the pattern the legacy
-- version's own effectiveFrom already used) instead of CURRENT_TIMESTAMP,
-- so this can't recur.
-- ============================================================================

UPDATE "pricing_versions"
SET "effectiveFrom" = '2026-01-01 00:00:00'
WHERE "id" = 'pv-launch-2026';
