-- Halls: an exhibition can have several halls, each with its own floor plan
-- lifecycle (one published plan and one draft per hall).
--
-- Existing floor plans move into a single "Main Hall" per exhibition, so
-- behaviour for current data is unchanged. Bookings and payments never read a
-- floor plan, so nothing commercial is touched.

-- CreateTable
CREATE TABLE "exhibition_halls" (
    "id" TEXT NOT NULL,
    "exhibitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exhibition_halls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exhibition_halls_exhibitionId_name_key" ON "exhibition_halls"("exhibitionId", "name");
CREATE UNIQUE INDEX "exhibition_halls_id_exhibitionId_key" ON "exhibition_halls"("id", "exhibitionId");
CREATE INDEX "exhibition_halls_exhibitionId_sortOrder_idx" ON "exhibition_halls"("exhibitionId", "sortOrder");

-- AddForeignKey
ALTER TABLE "exhibition_halls" ADD CONSTRAINT "exhibition_halls_exhibitionId_fkey" FOREIGN KEY ("exhibitionId") REFERENCES "exhibitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one "Main Hall" for every exhibition that already has floor plans.
ALTER TABLE "floor_plans" ADD COLUMN "hallId" TEXT;

INSERT INTO "exhibition_halls" ("id", "exhibitionId", "name", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, fp."exhibitionId", 'Main Hall', 0, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "exhibitionId" FROM "floor_plans") fp;

UPDATE "floor_plans" p
SET "hallId" = h."id"
FROM "exhibition_halls" h
WHERE h."exhibitionId" = p."exhibitionId";

ALTER TABLE "floor_plans" ALTER COLUMN "hallId" SET NOT NULL;

-- Plan names and the "one published plan" rule are now per hall.
DROP INDEX "floor_plans_one_published_per_exhibition_idx";
DROP INDEX "floor_plans_exhibition_name_key";

CREATE UNIQUE INDEX "floor_plans_hallId_name_key" ON "floor_plans"("hallId", "name");
CREATE UNIQUE INDEX "floor_plans_one_published_per_hall_idx"
ON "floor_plans" ("hallId")
WHERE "status" = 'published'::"public"."FloorPlanStatus";
CREATE INDEX "floor_plans_hallId_status_idx" ON "floor_plans"("hallId", "status");

-- A plan's hall must belong to the plan's own exhibition.
ALTER TABLE "floor_plans" ADD CONSTRAINT "floor_plans_hallId_exhibitionId_fkey" FOREIGN KEY ("hallId", "exhibitionId") REFERENCES "exhibition_halls"("id", "exhibitionId") ON DELETE CASCADE ON UPDATE CASCADE;
