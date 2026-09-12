-- FP-02: visual Floor Plan persistence foundation.
-- Commercial Stall inventory remains authoritative; these tables only store
-- presentation/layout metadata and references to existing Stall records.

CREATE TABLE "floor_plans" (
    "id" TEXT NOT NULL,
    "exhibitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "backgroundUrl" TEXT,
    "canvasWidth" DECIMAL(12, 2) NOT NULL,
    "canvasHeight" DECIMAL(12, 2) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "floor_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "floor_plans_status_check" CHECK ("status" IN ('draft', 'published', 'archived')),
    CONSTRAINT "floor_plans_canvas_width_check" CHECK ("canvasWidth" > 0 AND "canvasWidth" <= 100000),
    CONSTRAINT "floor_plans_canvas_height_check" CHECK ("canvasHeight" > 0 AND "canvasHeight" <= 100000),
    CONSTRAINT "floor_plans_exhibition_fkey" FOREIGN KEY ("exhibitionId") REFERENCES "exhibitions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "floor_plan_objects" (
    "id" TEXT NOT NULL,
    "floorPlanId" TEXT NOT NULL,
    "stallId" TEXT NOT NULL,
    "x" DECIMAL(12, 2) NOT NULL,
    "y" DECIMAL(12, 2) NOT NULL,
    "width" DECIMAL(12, 2) NOT NULL,
    "height" DECIMAL(12, 2) NOT NULL,
    "rotation" DECIMAL(7, 2) NOT NULL DEFAULT 0,
    "zIndex" INTEGER NOT NULL DEFAULT 0,
    "labelVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "floor_plan_objects_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "floor_plan_objects_x_check" CHECK ("x" >= 0),
    CONSTRAINT "floor_plan_objects_y_check" CHECK ("y" >= 0),
    CONSTRAINT "floor_plan_objects_width_check" CHECK ("width" > 0 AND "width" <= 100000),
    CONSTRAINT "floor_plan_objects_height_check" CHECK ("height" > 0 AND "height" <= 100000),
    CONSTRAINT "floor_plan_objects_rotation_check" CHECK ("rotation" >= -360 AND "rotation" <= 360),
    CONSTRAINT "floor_plan_objects_floor_plan_fkey" FOREIGN KEY ("floorPlanId") REFERENCES "floor_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "floor_plan_objects_stall_fkey" FOREIGN KEY ("stallId") REFERENCES "stalls"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "floor_plans_exhibition_name_key" ON "floor_plans"("exhibitionId", "name");
CREATE UNIQUE INDEX "floor_plan_objects_floor_plan_stall_key" ON "floor_plan_objects"("floorPlanId", "stallId");
CREATE INDEX "floor_plans_exhibition_status_idx" ON "floor_plans"("exhibitionId", "status");
CREATE INDEX "floor_plan_objects_floor_plan_idx" ON "floor_plan_objects"("floorPlanId");
CREATE INDEX "floor_plan_objects_stall_idx" ON "floor_plan_objects"("stallId");
