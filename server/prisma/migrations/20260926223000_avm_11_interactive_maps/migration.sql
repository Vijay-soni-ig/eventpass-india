-- AVM-11 interactive venue maps
CREATE TYPE "VenueMapStatus" AS ENUM ('draft', 'published', 'archived');
CREATE TYPE "VenueMapObjectType" AS ENUM ('entrance', 'zone', 'space', 'facility', 'seating', 'parking', 'custom');

CREATE TABLE "venue_maps" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "floorId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "backgroundUrl" TEXT,
  "canvasWidth" DECIMAL(12,2) NOT NULL,
  "canvasHeight" DECIMAL(12,2) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "VenueMapStatus" NOT NULL DEFAULT 'draft',
  "publishedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "venue_maps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "venue_map_objects" (
  "id" TEXT NOT NULL,
  "venueMapId" TEXT NOT NULL,
  "type" "VenueMapObjectType" NOT NULL,
  "label" TEXT,
  "description" TEXT,
  "spaceId" TEXT,
  "entranceId" TEXT,
  "x" DECIMAL(12,2) NOT NULL,
  "y" DECIMAL(12,2) NOT NULL,
  "width" DECIMAL(12,2) NOT NULL,
  "height" DECIMAL(12,2) NOT NULL,
  "rotation" DECIMAL(7,2) NOT NULL DEFAULT 0,
  "zIndex" INTEGER NOT NULL DEFAULT 0,
  "isVisible" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "venue_map_objects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "venue_maps_venueId_name_key" ON "venue_maps"("venueId","name");
CREATE INDEX "venue_maps_venueId_status_idx" ON "venue_maps"("venueId","status");
CREATE INDEX "venue_maps_floorId_status_idx" ON "venue_maps"("floorId","status");
CREATE INDEX "venue_map_objects_venueMapId_zIndex_idx" ON "venue_map_objects"("venueMapId","zIndex");
CREATE INDEX "venue_map_objects_spaceId_idx" ON "venue_map_objects"("spaceId");
CREATE INDEX "venue_map_objects_entranceId_idx" ON "venue_map_objects"("entranceId");

ALTER TABLE "venue_maps"
  ADD CONSTRAINT "venue_maps_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_maps"
  ADD CONSTRAINT "venue_maps_floorId_fkey"
  FOREIGN KEY ("floorId") REFERENCES "venue_floors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "venue_map_objects"
  ADD CONSTRAINT "venue_map_objects_venueMapId_fkey"
  FOREIGN KEY ("venueMapId") REFERENCES "venue_maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_map_objects"
  ADD CONSTRAINT "venue_map_objects_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "venue_spaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "venue_map_objects"
  ADD CONSTRAINT "venue_map_objects_entranceId_fkey"
  FOREIGN KEY ("entranceId") REFERENCES "venue_entrances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
