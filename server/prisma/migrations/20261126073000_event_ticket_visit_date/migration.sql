-- Preserve the legacy Exhibition booking visit date when new purchases
-- move through the canonical Event reservation/order/issuance lifecycle.
-- Existing reservations and issued tickets remain valid with NULL visitDate.
ALTER TABLE "event_ticket_reservations"
  ADD COLUMN "visitDate" DATE;

ALTER TABLE "event_tickets"
  ADD COLUMN "visit_date" DATE;
