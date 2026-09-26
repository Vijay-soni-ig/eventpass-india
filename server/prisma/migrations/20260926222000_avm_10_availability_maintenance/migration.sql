-- AVM-10: reusable venue availability and maintenance blocks
CREATE TYPE "VenueAvailabilityBlockStatus" AS ENUM ('active', 'inactive', 'archived');
CREATE TYPE "VenueAvailabilityBlockType" AS ENUM ('closed', 'reserved', 'unavailable', 'other');
CREATE TYPE "VenueMaintenanceBlockStatus" AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled', 'archived');
CREATE TYPE "VenueMaintenanceType" AS ENUM ('inspection', 'cleaning', 'repair', 'upgrade', 'safety', 'other');

CREATE TABLE "venue_availability_blocks" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "floorId" TEXT,
  "spaceId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "type" "VenueAvailabilityBlockType" NOT NULL DEFAULT 'closed',
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" "VenueAvailabilityBlockStatus" NOT NULL DEFAULT 'active',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "venue_availability_blocks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "venue_maintenance_blocks" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "floorId" TEXT,
  "spaceId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "type" "VenueMaintenanceType" NOT NULL DEFAULT 'inspection',
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" "VenueMaintenanceBlockStatus" NOT NULL DEFAULT 'scheduled',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "venue_maintenance_blocks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "venue_availability_blocks_venueId_status_startsAt_endsAt_idx" ON "venue_availability_blocks"("venueId", "status", "startsAt", "endsAt");
CREATE INDEX "venue_availability_blocks_floorId_startsAt_endsAt_idx" ON "venue_availability_blocks"("floorId", "startsAt", "endsAt");
CREATE INDEX "venue_availability_blocks_spaceId_startsAt_endsAt_idx" ON "venue_availability_blocks"("spaceId", "startsAt", "endsAt");
CREATE INDEX "venue_maintenance_blocks_venueId_status_startsAt_endsAt_idx" ON "venue_maintenance_blocks"("venueId", "status", "startsAt", "endsAt");
CREATE INDEX "venue_maintenance_blocks_floorId_startsAt_endsAt_idx" ON "venue_maintenance_blocks"("floorId", "startsAt", "endsAt");
CREATE INDEX "venue_maintenance_blocks_spaceId_startsAt_endsAt_idx" ON "venue_maintenance_blocks"("spaceId", "startsAt", "endsAt");

ALTER TABLE "venue_availability_blocks" ADD CONSTRAINT "venue_availability_blocks_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_availability_blocks" ADD CONSTRAINT "venue_availability_blocks_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "venue_floors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "venue_availability_blocks" ADD CONSTRAINT "venue_availability_blocks_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "venue_spaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "venue_maintenance_blocks" ADD CONSTRAINT "venue_maintenance_blocks_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_maintenance_blocks" ADD CONSTRAINT "venue_maintenance_blocks_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "venue_floors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "venue_maintenance_blocks" ADD CONSTRAINT "venue_maintenance_blocks_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "venue_spaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
