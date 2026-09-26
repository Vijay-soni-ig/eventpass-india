CREATE TYPE "DashboardOwnerType" AS ENUM ('PLATFORM', 'ORGANIZER', 'EXHIBITOR');

CREATE TABLE "dashboards" (
  "id" TEXT NOT NULL,
  "ownerType" "DashboardOwnerType" NOT NULL,
  "ownerId" TEXT,
  "name" TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "dashboards_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dashboards_owner_id_check" CHECK (
    ("ownerType" = 'PLATFORM' AND "ownerId" IS NULL)
    OR
    ("ownerType" IN ('ORGANIZER', 'EXHIBITOR') AND "ownerId" IS NOT NULL)
  )
);

CREATE TABLE "dashboard_widgets" (
  "id" TEXT NOT NULL,
  "dashboardId" TEXT NOT NULL,
  "widgetType" TEXT NOT NULL,
  "x" INTEGER NOT NULL DEFAULT 0,
  "y" INTEGER NOT NULL DEFAULT 0,
  "width" INTEGER NOT NULL DEFAULT 3,
  "height" INTEGER NOT NULL DEFAULT 2,
  "configuration" JSONB,
  "isVisible" BOOLEAN NOT NULL DEFAULT true,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "dashboard_widgets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dashboard_widgets_layout_check" CHECK (
    "x" >= 0 AND "y" >= 0 AND
    "width" BETWEEN 1 AND 12 AND
    "height" BETWEEN 1 AND 20
  ),
  CONSTRAINT "dashboard_widgets_dashboard_id_fkey"
    FOREIGN KEY ("dashboardId") REFERENCES "dashboards"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "dashboards_owner_idx" ON "dashboards"("ownerType", "ownerId", "archivedAt");
CREATE INDEX "dashboards_default_idx" ON "dashboards"("ownerType", "ownerId", "isDefault");
CREATE INDEX "dashboard_widgets_dashboard_idx" ON "dashboard_widgets"("dashboardId", "isVisible", "archivedAt");
CREATE INDEX "dashboard_widgets_type_idx" ON "dashboard_widgets"("widgetType", "archivedAt");

CREATE UNIQUE INDEX "dashboards_default_platform_unique"
  ON "dashboards"("ownerType")
  WHERE "ownerType" = 'PLATFORM' AND "isDefault" = true AND "archivedAt" IS NULL;

CREATE UNIQUE INDEX "dashboards_default_owner_unique"
  ON "dashboards"("ownerType", "ownerId")
  WHERE "ownerType" IN ('ORGANIZER', 'EXHIBITOR') AND "isDefault" = true AND "archivedAt" IS NULL;
