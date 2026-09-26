-- AVM-08 Venue Facilities
CREATE TYPE "VenueFacilityStatus" AS ENUM ('active', 'inactive', 'archived');
CREATE TYPE "VenueFacilityType" AS ENUM (
  'restroom',
  'accessible_restroom',
  'first_aid',
  'medical_room',
  'information_desk',
  'cloakroom',
  'food_beverage',
  'atm',
  'wifi',
  'charging_station',
  'prayer_room',
  'security',
  'lost_found',
  'baby_care',
  'drinking_water',
  'elevator',
  'escalator',
  'other'
);

CREATE TABLE "venue_facilities" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "floorId" TEXT,
  "spaceId" TEXT,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "description" TEXT,
  "type" "VenueFacilityType" NOT NULL DEFAULT 'other',
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "isAccessible" BOOLEAN NOT NULL DEFAULT true,
  "isPublic" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "status" "VenueFacilityStatus" NOT NULL DEFAULT 'active',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "venue_facilities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "venue_facilities_venueId_name_key" ON "venue_facilities"("venueId", "name");
CREATE UNIQUE INDEX "venue_facilities_venueId_code_key" ON "venue_facilities"("venueId", "code");
CREATE INDEX "venue_facilities_venueId_status_sortOrder_idx" ON "venue_facilities"("venueId", "status", "sortOrder");
CREATE INDEX "venue_facilities_venueId_type_idx" ON "venue_facilities"("venueId", "type");
CREATE INDEX "venue_facilities_floorId_idx" ON "venue_facilities"("floorId");
CREATE INDEX "venue_facilities_spaceId_idx" ON "venue_facilities"("spaceId");

ALTER TABLE "venue_facilities" ADD CONSTRAINT "venue_facilities_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_facilities" ADD CONSTRAINT "venue_facilities_floorId_fkey"
  FOREIGN KEY ("floorId") REFERENCES "venue_floors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "venue_facilities" ADD CONSTRAINT "venue_facilities_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "venue_spaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
