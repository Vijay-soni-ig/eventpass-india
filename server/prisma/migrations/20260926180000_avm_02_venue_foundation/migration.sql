-- AVM-02: reusable physical venue foundation
CREATE TYPE "VenueStatus" AS ENUM ('active', 'inactive', 'archived');
CREATE TYPE "VenueBuildingStatus" AS ENUM ('active', 'inactive', 'archived');
CREATE TYPE "VenueFloorStatus" AS ENUM ('active', 'inactive', 'archived');

CREATE TABLE "venues" (
  "id" TEXT NOT NULL,
  "organizerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "description" TEXT,
  "address" TEXT,
  "city" TEXT,
  "state" TEXT,
  "country" TEXT NOT NULL DEFAULT 'India',
  "postalCode" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "status" "VenueStatus" NOT NULL DEFAULT 'active',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "venue_buildings" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "status" "VenueBuildingStatus" NOT NULL DEFAULT 'active',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "venue_buildings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "venue_floors" (
  "id" TEXT NOT NULL,
  "buildingId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "level" INTEGER NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "status" "VenueFloorStatus" NOT NULL DEFAULT 'active',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "venue_floors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "venues_organizerId_name_key" ON "venues"("organizerId", "name");
CREATE UNIQUE INDEX "venues_organizerId_code_key" ON "venues"("organizerId", "code");
CREATE INDEX "venues_organizerId_status_idx" ON "venues"("organizerId", "status");
CREATE INDEX "venues_organizerId_city_idx" ON "venues"("organizerId", "city");

CREATE UNIQUE INDEX "venue_buildings_venueId_name_key" ON "venue_buildings"("venueId", "name");
CREATE UNIQUE INDEX "venue_buildings_venueId_code_key" ON "venue_buildings"("venueId", "code");
CREATE INDEX "venue_buildings_venueId_status_sortOrder_idx" ON "venue_buildings"("venueId", "status", "sortOrder");

CREATE UNIQUE INDEX "venue_floors_buildingId_name_key" ON "venue_floors"("buildingId", "name");
CREATE UNIQUE INDEX "venue_floors_buildingId_level_key" ON "venue_floors"("buildingId", "level");
CREATE UNIQUE INDEX "venue_floors_buildingId_code_key" ON "venue_floors"("buildingId", "code");
CREATE INDEX "venue_floors_buildingId_status_sortOrder_idx" ON "venue_floors"("buildingId", "status", "sortOrder");

ALTER TABLE "venues"
  ADD CONSTRAINT "venues_organizerId_fkey"
  FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "venue_buildings"
  ADD CONSTRAINT "venue_buildings_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "venue_floors"
  ADD CONSTRAINT "venue_floors_buildingId_fkey"
  FOREIGN KEY ("buildingId") REFERENCES "venue_buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
