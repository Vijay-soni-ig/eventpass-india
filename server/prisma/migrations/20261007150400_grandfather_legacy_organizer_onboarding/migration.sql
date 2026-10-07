-- Grandfather all organizers that already existed when organizer-first
-- onboarding activation was introduced. Activation is intentionally a one-time
-- gate, so these organizers keep uninterrupted workspace access.
ALTER TABLE "organizers" ADD COLUMN "onboardingActivatedAt" TIMESTAMP(3);

UPDATE "organizers"
SET "onboardingActivatedAt" = COALESCE("onboardingActivatedAt", NOW()),
    "updatedAt" = NOW()
WHERE "onboardingActivatedAt" IS NULL;
