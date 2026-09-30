-- Ensure the Prisma enum used by FloorPlan exists on fresh databases.
-- Some older migrations created floor_plans.status as TEXT, while Prisma now
-- models it as FloorPlanStatus. Normalize both fresh and upgraded databases.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'FloorPlanStatus'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."FloorPlanStatus" AS ENUM ('draft', 'published', 'archived');
  END IF;
END
$$;

ALTER TABLE "floor_plans"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "floor_plans"
  ALTER COLUMN "status" TYPE "public"."FloorPlanStatus"
  USING "status"::"public"."FloorPlanStatus";

ALTER TABLE "floor_plans"
  ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."FloorPlanStatus";
