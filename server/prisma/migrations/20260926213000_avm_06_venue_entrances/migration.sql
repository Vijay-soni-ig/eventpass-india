CREATE TYPE "VenueEntranceStatus" AS ENUM ('active', 'inactive', 'archived');
CREATE TYPE "VenueEntranceType" AS ENUM ('main', 'secondary', 'emergency', 'service', 'staff', 'other');

CREATE TABLE "venue_entrances" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "floorId" TEXT,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "description" TEXT,
  "type" "VenueEntranceType" NOT NULL DEFAULT 'main',
  "isAccessible" BOOLEAN NOT NULL DEFAULT true,
  "isEmergencyExit" BOOLEAN NOT NULL DEFAULT false,
  "isPublic" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "status" "VenueEntranceStatus" NOT NULL DEFAULT 'active',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "venue_entrances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "venue_entrances_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "venue_entrances_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "venue_floors"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "venue_entrances_venueId_name_key" ON "venue_entrances"("venueId", "name");
CREATE UNIQUE INDEX "venue_entrances_venueId_code_key" ON "venue_entrances"("venueId", "code");
CREATE INDEX "venue_entrances_venueId_status_sortOrder_idx" ON "venue_entrances"("venueId", "status", "sortOrder");
CREATE INDEX "venue_entrances_venueId_type_idx" ON "venue_entrances"("venueId", "type");
CREATE INDEX "venue_entrances_floorId_idx" ON "venue_entrances"("floorId");