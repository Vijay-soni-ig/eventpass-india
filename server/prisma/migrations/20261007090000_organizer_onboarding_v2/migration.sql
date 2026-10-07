-- Organizer onboarding v2: capture non-event organizer profile context.
ALTER TABLE "organizers" ADD COLUMN "discoverySource" TEXT;
ALTER TABLE "organizers" ADD COLUMN "eventFrequency" TEXT;
ALTER TABLE "organizers" ADD COLUMN "averageEventSize" TEXT;
