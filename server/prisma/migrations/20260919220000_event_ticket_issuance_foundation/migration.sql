-- QR Ticket Issuance Foundation
-- Creates universal event tickets independently of legacy TicketBooking.
-- One row represents one attendee ticket; quantity > 1 orders fan out into
-- multiple ticket rows during idempotent issuance.

CREATE TABLE "event_tickets" (
  "id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "event_ticket_order_id" TEXT NOT NULL,
  "event_ticket_type_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "attendee_name" TEXT NOT NULL,
  "attendee_email" TEXT NOT NULL,
  "attendee_phone" TEXT,
  "ticket_code" TEXT NOT NULL,
  "qr_token_hash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "checked_in_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "refunded_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "event_tickets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_tickets_order_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "event_tickets_type_fkey"
    FOREIGN KEY ("event_ticket_type_id") REFERENCES "event_ticket_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "event_tickets_user_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "event_tickets_ticket_order_fkey"
    FOREIGN KEY ("event_ticket_order_id") REFERENCES "event_ticket_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "event_tickets_ticket_code_key" ON "event_tickets"("ticket_code");
CREATE UNIQUE INDEX "event_tickets_qr_token_hash_key" ON "event_tickets"("qr_token_hash");
CREATE INDEX "event_tickets_user_id_status_created_at_idx" ON "event_tickets"("user_id","status","created_at");
CREATE INDEX "event_tickets_event_id_status_idx" ON "event_tickets"("event_id","status");
CREATE INDEX "event_tickets_order_id_idx" ON "event_tickets"("event_ticket_order_id");
CREATE INDEX "event_tickets_qr_token_hash_idx" ON "event_tickets"("qr_token_hash");
