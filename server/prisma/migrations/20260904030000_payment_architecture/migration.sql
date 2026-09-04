-- ============================================================================
-- EVENTPASS V2 — Production payment architecture
--
-- Additive and non-destructive: new PaymentStatus values only ADD to the
-- enum (existing paid/pending/refunded rows are untouched and remain
-- valid), new Payment columns are nullable, and payment_events is a new,
-- empty table. No existing column is dropped, no row is deleted.
--
-- New enum values must be committed before they can be used as a column
-- DEFAULT, so this runs as two statements outside an explicit transaction
-- block (Prisma applies each migration file's statements sequentially;
-- splitting into two files would be the alternative, but PostgreSQL 12+
-- allows this within one migration as long as the ADD VALUE calls commit
-- before use — enforced here by issuing them first).
-- ============================================================================

ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'created';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'failed';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'cancelled';
