-- AVM-12: connect universal Events to reusable physical Venues
ALTER TABLE "events" ADD COLUMN "venueId" TEXT;

CREATE INDEX "events_venue_id_idx" ON "events"("venueId");

ALTER TABLE "events"
  ADD CONSTRAINT "events_venue_id_fkey"
  FOREIGN KEY ("venueId") REFERENCES "venues"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
