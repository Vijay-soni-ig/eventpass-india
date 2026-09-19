-- Registration -> Ticketing bridge
-- Keep registration optional so existing ticket bookings and legacy exhibition
-- flows remain unchanged. Removing a registration never deletes a ticket.

ALTER TABLE "ticket_bookings"
  ADD COLUMN "eventRegistrationId" TEXT;

CREATE INDEX "ticket_bookings_eventRegistrationId_idx"
  ON "ticket_bookings"("eventRegistrationId");

ALTER TABLE "ticket_bookings"
  ADD CONSTRAINT "ticket_bookings_eventRegistrationId_fkey"
  FOREIGN KEY ("eventRegistrationId") REFERENCES "event_registrations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
