-- ============================================================================
-- EVENTPASS V2 — Organizer bootstrap uniqueness
--
-- Fixes a live-reproduced race: two genuinely concurrent first-use calls to
-- resolveOrganizerId() for the same brand-new user could both pass the
-- "does this user already have an organizer?" check and both create a
-- separate Organizer + owner OrganizerMembership, silently producing two
-- tenants for one user.
--
-- This does NOT restrict OrganizerMembership in any way — a user can still
-- belong to (and even hold the "owner" role on) any number of organizers,
-- e.g. their own plus ones they're later invited to. It only makes the
-- automatic self-bootstrap-a-new-organizer action itself idempotent per
-- user, via a dedicated nullable+unique column that is populated solely by
-- that one code path (server/src/lib/organizer.ts resolveOrganizerId), never
-- by the invite flow or any other route.
--
-- Additive and non-destructive: adds one nullable column, backfills it from
-- existing data where unambiguous, then adds the unique constraint + FK.
-- Verified against the live dev database before writing this migration:
-- zero users hold more than one active "owner" membership, and zero
-- organizers have more than one active "owner" member — so every existing
-- organizer backfills unambiguously with no data conflicts.
-- ============================================================================

ALTER TABLE "organizers" ADD COLUMN "bootstrappedByUserId" TEXT;

-- Backfill: for each organizer that currently has exactly one distinct user
-- holding an active "owner" membership, treat that user as the one who
-- bootstrapped it. An organizer with zero or more-than-one such user (none
-- exist today, per the pre-migration check above) is deliberately left NULL
-- rather than guessed at — NULL never violates the uniqueness constraint
-- added below.
UPDATE "organizers" o
SET "bootstrappedByUserId" = owners."userId"
FROM (
    SELECT "organizerId", MIN("userId") AS "userId"
    FROM "organizer_memberships"
    WHERE role = 'owner' AND status = 'active' AND "userId" IS NOT NULL
    GROUP BY "organizerId"
    HAVING COUNT(DISTINCT "userId") = 1
) owners
WHERE owners."organizerId" = o.id;

ALTER TABLE "organizers" ADD CONSTRAINT "organizers_bootstrappedByUserId_key" UNIQUE ("bootstrappedByUserId");

ALTER TABLE "organizers"
    ADD CONSTRAINT "organizers_bootstrappedByUserId_fkey"
    FOREIGN KEY ("bootstrappedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
