-- AVM-03: reusable venue zones / areas
CREATE TYPE "VenueZoneStatus" AS ENUM ('active', 'inactive', 'archived');
CREATE TYPE "VenueZoneType" AS ENUM (
  'public_area',
  'exhibition_area',
  'registration',
  'lobby',
  'meeting',
  'food_beverage',
  'service',
  'restricted',
  'other'
);

CREATE TABLE "venue_zones" (
  "id" TEXT NOT NULL,
  "floorId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "description" TEXT,
  "type" "VenueZoneType" NOT NULL DEFAULT 'other',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "status" "VenueZoneStatus" NOT NULL DEFAULT 'active',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "venue_zones_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "venue_zones_floorId_name_key" ON "venue_zones"("floorId", "name");
CREATE UNIQUE INDEX "venue_zones_floorId_code_key" ON "venue_zones"("floorId", "code");
CREATE INDEX "venue_zones_floorId_status_sortOrder_idx" ON "venue_zones"("floorId", "status", "sortOrder");
CREATE INDEX "venue_zones_floorId_type_idx" ON "venue_zones"("floorId", "type");

ALTER TABLE "venue_zones"
  ADD CONSTRAINT "venue_zones_floorId_fkey"
  FOREIGN KEY ("floorId") REFERENCES "venue_floors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
