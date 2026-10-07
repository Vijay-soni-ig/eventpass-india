-- Grandfather all organizers that already existed when organizer-first
-- onboarding activation was introduced. Activation is intentionally a one-time
-- gate, so these organizers keep uninterrupted workspace access.
UPDATE "organizer_onboarding_profiles"
SET "completedAt" = COALESCE("completedAt", NOW()),
    "updatedAt" = NOW()
WHERE "completedAt" IS NULL;

INSERT INTO "organizer_onboarding_profiles"
  ("id", "organizerId", "discoverySources", "completedAt", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  o."id",
  ARRAY[]::TEXT[],
  NOW(),
  NOW(),
  NOW()
FROM "organizers" o
WHERE NOT EXISTS (
  SELECT 1
  FROM "organizer_onboarding_profiles" p
  WHERE p."organizerId" = o."id"
);
