-- Remove legacy geographic coordinates from universal Events and Exhibitions.
-- Venue/address discovery now uses explicit city and venue text; no geocoding
-- or inferred coordinates are stored or returned.
ALTER TABLE "exhibitions"
  DROP COLUMN IF EXISTS "latitude",
  DROP COLUMN IF EXISTS "longitude";

ALTER TABLE "events"
  DROP COLUMN IF EXISTS "latitude",
  DROP COLUMN IF EXISTS "longitude";
