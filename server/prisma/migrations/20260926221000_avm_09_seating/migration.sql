-- AVM-09 Venue Seating
CREATE TYPE "VenueSeatingAreaStatus" AS ENUM ('active', 'inactive', 'archived');
CREATE TYPE "VenueSeatingType" AS ENUM ('fixed','movable','bleacher','auditorium','classroom','theater','banquet','cabaret','other');

CREATE TABLE "venue_seating_areas" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "floorId" TEXT,
  "spaceId" TEXT,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "description" TEXT,
  "type" "VenueSeatingType" NOT NULL DEFAULT 'fixed',
  "capacity" INTEGER NOT NULL,
  "accessibleSeats" INTEGER NOT NULL DEFAULT 0,
  "rowCount" INTEGER,
  "seatsPerRow" INTEGER,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "status" "VenueSeatingAreaStatus" NOT NULL DEFAULT 'active',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "venue_seating_areas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "venue_seating_areas_venueId_name_key" ON "venue_seating_areas"("venueId","name");
CREATE UNIQUE INDEX "venue_seating_areas_venueId_code_key" ON "venue_seating_areas"("venueId","code");
CREATE INDEX "venue_seating_areas_venueId_status_sortOrder_idx" ON "venue_seating_areas"("venueId","status","sortOrder");
CREATE INDEX "venue_seating_areas_venueId_type_idx" ON "venue_seating_areas"("venueId","type");
CREATE INDEX "venue_seating_areas_floorId_idx" ON "venue_seating_areas"("floorId");
CREATE INDEX "venue_seating_areas_spaceId_idx" ON "venue_seating_areas"("spaceId");
ALTER TABLE "venue_seating_areas" ADD CONSTRAINT "venue_seating_areas_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_seating_areas" ADD CONSTRAINT "venue_seating_areas_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "venue_floors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "venue_seating_areas" ADD CONSTRAINT "venue_seating_areas_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "venue_spaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
