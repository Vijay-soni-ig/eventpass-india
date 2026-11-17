CREATE TYPE "ExhibitionAddOnStatus" AS ENUM ('active', 'inactive');

CREATE TABLE "exhibition_add_ons" (
  "id" TEXT NOT NULL,
  "exhibitionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "price" DECIMAL(10,2) NOT NULL,
  "maxQuantityPerBooking" INTEGER NOT NULL DEFAULT 1,
  "availableFrom" TIMESTAMP(3),
  "availableUntil" TIMESTAMP(3),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "status" "ExhibitionAddOnStatus" NOT NULL DEFAULT 'active',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "exhibition_add_ons_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "exhibition_add_ons_exhibitionId_status_archivedAt_sortOrder_idx"
  ON "exhibition_add_ons"("exhibitionId", "status", "archivedAt", "sortOrder");
CREATE INDEX "exhibition_add_ons_availableFrom_availableUntil_idx"
  ON "exhibition_add_ons"("availableFrom", "availableUntil");

ALTER TABLE "exhibition_add_ons"
  ADD CONSTRAINT "exhibition_add_ons_exhibitionId_fkey"
  FOREIGN KEY ("exhibitionId") REFERENCES "exhibitions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
