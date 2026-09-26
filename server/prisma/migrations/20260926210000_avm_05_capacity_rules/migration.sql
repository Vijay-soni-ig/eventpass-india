CREATE TYPE "VenueCapacityRuleStatus" AS ENUM ('active', 'inactive', 'archived');

CREATE TABLE "venue_capacity_rules" (
  "id" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "maxOccupancy" INTEGER NOT NULL,
  "seatedCapacity" INTEGER,
  "standingCapacity" INTEGER,
  "wheelchairCapacity" INTEGER,
  "notes" TEXT,
  "status" "VenueCapacityRuleStatus" NOT NULL DEFAULT 'active',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "venue_capacity_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "venue_capacity_rules_spaceId_name_key" ON "venue_capacity_rules"("spaceId", "name");
CREATE INDEX "venue_capacity_rules_spaceId_status_idx" ON "venue_capacity_rules"("spaceId", "status");

ALTER TABLE "venue_capacity_rules"
  ADD CONSTRAINT "venue_capacity_rules_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "venue_spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
