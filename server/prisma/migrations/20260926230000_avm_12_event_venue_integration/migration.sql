-- AVM-12: connect universal Events to reusable physical Venues
ALTER TABLE "events" ADD COLUMN "venue_id" TEXT;

CREATE INDEX "events_venue_id_idx" ON "events"("venue_id");

ALTER TABLE "events"
  ADD CONSTRAINT "events_venue_id_fkey"
  FOREIGN KEY ("venue_id") REFERENCES "venues"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
