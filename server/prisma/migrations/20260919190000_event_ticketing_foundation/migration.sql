-- ETX-TICKET-001 — universal Event-native ticket catalog.
CREATE TYPE "EventTicketTypeStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

CREATE TABLE "event_ticket_types" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "capacity" INTEGER NOT NULL,
  "maxPerOrder" INTEGER NOT NULL DEFAULT 10,
  "maxPerAttendee" INTEGER,
  "saleStartsAt" TIMESTAMP(3),
  "saleEndsAt" TIMESTAMP(3),
  "status" "EventTicketTypeStatus" NOT NULL DEFAULT 'ACTIVE',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "event_ticket_types_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "event_ticket_types_eventId_status_sortOrder_idx"
  ON "event_ticket_types"("eventId", "status", "sortOrder");

CREATE INDEX "event_ticket_types_eventId_saleStartsAt_saleEndsAt_idx"
  ON "event_ticket_types"("eventId", "saleStartsAt", "saleEndsAt");

ALTER TABLE "event_ticket_types"
  ADD CONSTRAINT "event_ticket_types_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "events"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
