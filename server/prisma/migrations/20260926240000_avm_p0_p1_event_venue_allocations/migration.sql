-- AVM P0/P1: event-to-venue allocation foundation
CREATE TYPE "EventVenueAllocationStatus" AS ENUM ('active', 'inactive', 'archived');
CREATE TYPE "EventVenueAllocationScope" AS ENUM ('venue', 'building', 'floor', 'zone', 'space');

CREATE TABLE "event_venue_allocations" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "buildingId" TEXT,
  "floorId" TEXT,
  "zoneId" TEXT,
  "spaceId" TEXT,
  "scopeType" "EventVenueAllocationScope" NOT NULL,
  "label" TEXT,
  "status" "EventVenueAllocationStatus" NOT NULL DEFAULT 'active',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_venue_allocations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "event_venue_allocations_eventId_status_idx" ON "event_venue_allocations"("eventId", "status");
CREATE INDEX "event_venue_allocations_venueId_status_idx" ON "event_venue_allocations"("venueId", "status");
CREATE INDEX "event_venue_allocations_buildingId_status_idx" ON "event_venue_allocations"("buildingId", "status");
CREATE INDEX "event_venue_allocations_floorId_status_idx" ON "event_venue_allocations"("floorId", "status");
CREATE INDEX "event_venue_allocations_zoneId_status_idx" ON "event_venue_allocations"("zoneId", "status");
CREATE INDEX "event_venue_allocations_spaceId_status_idx" ON "event_venue_allocations"("spaceId", "status");

ALTER TABLE "event_venue_allocations" ADD CONSTRAINT "event_venue_allocations_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_venue_allocations" ADD CONSTRAINT "event_venue_allocations_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_venue_allocations" ADD CONSTRAINT "event_venue_allocations_buildingId_fkey"
  FOREIGN KEY ("buildingId") REFERENCES "venue_buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_venue_allocations" ADD CONSTRAINT "event_venue_allocations_floorId_fkey"
  FOREIGN KEY ("floorId") REFERENCES "venue_floors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_venue_allocations" ADD CONSTRAINT "event_venue_allocations_zoneId_fkey"
  FOREIGN KEY ("zoneId") REFERENCES "venue_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_venue_allocations" ADD CONSTRAINT "event_venue_allocations_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "venue_spaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
