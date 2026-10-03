-- Postgres refuses to use a new enum value in the transaction that adds it. The 001f migration
-- (20260925000000_universal_event_modules_001f) adds EXHIBITION and PARTNERS and then backfills
-- rows that use them in the same migration, so it fails on any database that already has events
-- linked to exhibitions. Adding the values here, in a migration of their own that commits first,
-- lets 001f run. On databases that already ran 001f these are no-ops.
ALTER TYPE "EventModule" ADD VALUE IF NOT EXISTS 'EXHIBITION';
ALTER TYPE "EventModule" ADD VALUE IF NOT EXISTS 'PARTNERS';
