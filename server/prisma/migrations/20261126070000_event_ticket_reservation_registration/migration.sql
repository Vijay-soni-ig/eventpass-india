ALTER TABLE "event_ticket_reservations"
ADD COLUMN "eventRegistrationId" TEXT;

CREATE INDEX "event_ticket_reservations_eventRegistrationId_idx"
ON "event_ticket_reservations"("eventRegistrationId");

ALTER TABLE "event_ticket_reservations"
ADD CONSTRAINT "event_ticket_reservations_eventRegistrationId_fkey"
FOREIGN KEY ("eventRegistrationId") REFERENCES "event_registrations"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
