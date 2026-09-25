CREATE TYPE "EventVendorServiceStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

CREATE TABLE "event_vendor_services" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "status" "EventVendorServiceStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_vendor_services_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_vendor_profiles" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "contactName" TEXT,
  "contactEmail" TEXT,
  "contactPhone" TEXT,
  "serviceArea" TEXT,
  "operatingHours" TEXT,
  "bookingNotes" TEXT,
  "displayWebsite" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_vendor_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_vendor_profile_services" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_vendor_profile_services_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_vendor_services_eventId_name_key" ON "event_vendor_services"("eventId","name");
CREATE INDEX "event_vendor_services_eventId_status_sortOrder_idx" ON "event_vendor_services"("eventId","status","sortOrder");
CREATE INDEX "event_vendor_services_eventId_category_idx" ON "event_vendor_services"("eventId","category");
CREATE UNIQUE INDEX "event_vendor_profiles_participantId_key" ON "event_vendor_profiles"("participantId");
CREATE INDEX "event_vendor_profiles_eventId_idx" ON "event_vendor_profiles"("eventId");
CREATE UNIQUE INDEX "event_vendor_profile_services_profileId_serviceId_key" ON "event_vendor_profile_services"("profileId","serviceId");
CREATE INDEX "event_vendor_profile_services_serviceId_idx" ON "event_vendor_profile_services"("serviceId");

ALTER TABLE "event_vendor_services" ADD CONSTRAINT "event_vendor_services_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_vendor_profiles" ADD CONSTRAINT "event_vendor_profiles_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_vendor_profiles" ADD CONSTRAINT "event_vendor_profiles_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_vendor_profile_services" ADD CONSTRAINT "event_vendor_profile_services_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "event_vendor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_vendor_profile_services" ADD CONSTRAINT "event_vendor_profile_services_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "event_vendor_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
