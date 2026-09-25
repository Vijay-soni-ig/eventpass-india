CREATE TYPE "EventSponsorPackageStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

CREATE TABLE "event_sponsor_packages" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "benefits" JSONB,
  "deliverables" JSONB,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "status" "EventSponsorPackageStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_sponsor_packages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_sponsor_profiles" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "packageId" TEXT,
  "amountOverride" DECIMAL(12,2),
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "benefitsOverride" JSONB,
  "deliverablesOverride" JSONB,
  "logoUrl" TEXT,
  "brandPrimaryColor" TEXT,
  "brandSecondaryColor" TEXT,
  "displayWebsite" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_sponsor_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_sponsor_packages_eventId_name_key" ON "event_sponsor_packages"("eventId", "name");
CREATE INDEX "event_sponsor_packages_eventId_status_sortOrder_idx" ON "event_sponsor_packages"("eventId", "status", "sortOrder");
CREATE UNIQUE INDEX "event_sponsor_profiles_participantId_key" ON "event_sponsor_profiles"("participantId");
CREATE INDEX "event_sponsor_profiles_eventId_packageId_idx" ON "event_sponsor_profiles"("eventId", "packageId");

ALTER TABLE "event_sponsor_packages"
  ADD CONSTRAINT "event_sponsor_packages_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_sponsor_profiles"
  ADD CONSTRAINT "event_sponsor_profiles_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_sponsor_profiles"
  ADD CONSTRAINT "event_sponsor_profiles_participantId_fkey"
  FOREIGN KEY ("participantId") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_sponsor_profiles"
  ADD CONSTRAINT "event_sponsor_profiles_packageId_fkey"
  FOREIGN KEY ("packageId") REFERENCES "event_sponsor_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
