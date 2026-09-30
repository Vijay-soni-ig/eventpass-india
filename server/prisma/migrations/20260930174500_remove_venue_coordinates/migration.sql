-- Remove unused venue coordinates. Venue location is represented by the validated
-- address, city, state/province, country and postal/ZIP fields.
ALTER TABLE "venues"
  DROP COLUMN IF EXISTS "latitude",
  DROP COLUMN IF EXISTS "longitude";
