CREATE TYPE "VenueParkingAreaStatus" AS ENUM ('active', 'inactive', 'archived');
CREATE TYPE "VenueParkingType" AS ENUM ('surface', 'covered', 'basement', 'multilevel', 'valet', 'other');

CREATE TABLE "venue_parking_areas" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "description" TEXT,
  "type" "VenueParkingType" NOT NULL DEFAULT 'surface',
  "totalSpaces" INTEGER NOT NULL,
  "accessibleSpaces" INTEGER NOT NULL DEFAULT 0,
  "evChargingSpaces" INTEGER NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "status" "VenueParkingAreaStatus" NOT NULL DEFAULT 'active',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "venue_parking_areas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "venue_parking_areas_venueId_name_key" ON "venue_parking_areas"("venueId", "name");
CREATE UNIQUE INDEX "venue_parking_areas_venueId_code_key" ON "venue_parking_areas"("venueId", "code");
CREATE INDEX "venue_parking_areas_venueId_status_sortOrder_idx" ON "venue_parking_areas"("venueId", "status", "sortOrder");
CREATE INDEX "venue_parking_areas_venueId_type_idx" ON "venue_parking_areas"("venueId", "type");

ALTER TABLE "venue_parking_areas"
  ADD CONSTRAINT "venue_parking_areas_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
