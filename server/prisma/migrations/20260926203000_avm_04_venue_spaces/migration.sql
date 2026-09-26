CREATE TYPE "VenueSpaceStatus" AS ENUM ('active', 'inactive', 'archived');
CREATE TYPE "VenueSpaceType" AS ENUM ('room', 'meeting_room', 'conference_room', 'auditorium', 'hall', 'office', 'storage', 'service_room', 'other');

CREATE TABLE "venue_spaces" (
  "id" TEXT NOT NULL,
  "zoneId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "description" TEXT,
  "type" "VenueSpaceType" NOT NULL DEFAULT 'room',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "status" "VenueSpaceStatus" NOT NULL DEFAULT 'active',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "venue_spaces_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "venue_spaces_zoneId_name_key" ON "venue_spaces"("zoneId", "name");
CREATE UNIQUE INDEX "venue_spaces_zoneId_code_key" ON "venue_spaces"("zoneId", "code");
CREATE INDEX "venue_spaces_zoneId_status_sortOrder_idx" ON "venue_spaces"("zoneId", "status", "sortOrder");
CREATE INDEX "venue_spaces_zoneId_type_idx" ON "venue_spaces"("zoneId", "type");

ALTER TABLE "venue_spaces"
  ADD CONSTRAINT "venue_spaces_zoneId_fkey"
  FOREIGN KEY ("zoneId") REFERENCES "venue_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
