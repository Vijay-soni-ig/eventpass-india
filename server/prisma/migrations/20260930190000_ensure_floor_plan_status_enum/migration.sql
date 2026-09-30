-- Ensure the Prisma enum used by FloorPlan exists on fresh databases.
-- This is idempotent because some environments may already have the type.
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
