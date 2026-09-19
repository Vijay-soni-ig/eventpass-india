-- Universal QR check-in foundation
CREATE TYPE "EventTicketCheckInMethod" AS ENUM ('QR', 'MANUAL');

CREATE TABLE "event_ticket_check_ins" (
  "id" TEXT NOT NULL,
  "event_ticket_id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "scanned_by_user_id" TEXT NOT NULL,
  "method" "EventTicketCheckInMethod" NOT NULL DEFAULT 'QR',
  "scanned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "event_ticket_check_ins_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_ticket_check_ins_ticket_fkey"
    FOREIGN KEY ("event_ticket_id") REFERENCES "event_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "event_ticket_check_ins_event_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "event_ticket_check_ins_scanner_fkey"
    FOREIGN KEY ("scanned_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "event_ticket_check_ins_ticket_id_scanned_at_idx"
  ON "event_ticket_check_ins"("event_ticket_id","scanned_at");
CREATE INDEX "event_ticket_check_ins_event_id_scanned_at_idx"
  ON "event_ticket_check_ins"("event_id","scanned_at");
CREATE INDEX "event_ticket_check_ins_scanned_by_user_id_scanned_at_idx"
  ON "event_ticket_check_ins"("scanned_by_user_id","scanned_at");
