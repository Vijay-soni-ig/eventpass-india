-- Normalize the legacy TEXT floor_plans.status column to the Prisma enum.
-- The existing partial index predicate was compiled against TEXT, so it must
-- be recreated after the column type changes.

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

DROP INDEX IF EXISTS "floor_plans_one_published_per_exhibition_idx";

ALTER TABLE "floor_plans"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "floor_plans"
  ALTER COLUMN "status" TYPE "public"."FloorPlanStatus"
  USING "status"::text::"public"."FloorPlanStatus";

ALTER TABLE "floor_plans"
  ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."FloorPlanStatus";

CREATE UNIQUE INDEX "floor_plans_one_published_per_exhibition_idx"
ON "floor_plans" ("exhibitionId")
WHERE "status" = 'published'::"public"."FloorPlanStatus";
