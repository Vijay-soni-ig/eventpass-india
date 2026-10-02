-- CreateEnum
CREATE TYPE "FloorPlanElementType" AS ENUM ('aisle', 'entrance', 'exit', 'stage', 'restroom', 'food', 'info', 'pillar', 'label');

-- CreateTable
CREATE TABLE "floor_plan_elements" (
    "id" TEXT NOT NULL,
    "floorPlanId" TEXT NOT NULL,
    "type" "FloorPlanElementType" NOT NULL,
    "label" TEXT,
    "x" DECIMAL(12,2) NOT NULL,
    "y" DECIMAL(12,2) NOT NULL,
    "width" DECIMAL(12,2) NOT NULL,
    "height" DECIMAL(12,2) NOT NULL,
    "rotation" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "zIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "floor_plan_elements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "floor_plan_elements_floorPlanId_idx" ON "floor_plan_elements"("floorPlanId");

-- AddForeignKey
ALTER TABLE "floor_plan_elements" ADD CONSTRAINT "floor_plan_elements_floorPlanId_fkey" FOREIGN KEY ("floorPlanId") REFERENCES "floor_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
