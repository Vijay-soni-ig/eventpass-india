-- Event ticket inventory/reservation foundation.
CREATE TYPE "EventTicketReservationStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

CREATE TABLE "event_ticket_reservations" (
  "id" TEXT NOT NULL,
  "eventTicketTypeId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "attendeeName" TEXT NOT NULL,
  "attendeeEmail" TEXT NOT NULL,
  "attendeePhone" TEXT,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "status" "EventTicketReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "idempotencyKey" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_ticket_reservations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_ticket_reservations_userId_idempotencyKey_key"
  ON "event_ticket_reservations"("userId", "idempotencyKey");
CREATE INDEX "event_ticket_reservations_eventTicketTypeId_status_expiresAt_idx"
  ON "event_ticket_reservations"("eventTicketTypeId", "status", "expiresAt");
CREATE INDEX "event_ticket_reservations_eventId_status_expiresAt_idx"
  ON "event_ticket_reservations"("eventId", "status", "expiresAt");
CREATE INDEX "event_ticket_reservations_userId_status_expiresAt_idx"
  ON "event_ticket_reservations"("userId", "status", "expiresAt");

ALTER TABLE "event_ticket_reservations"
  ADD CONSTRAINT "event_ticket_reservations_eventTicketTypeId_fkey"
  FOREIGN KEY ("eventTicketTypeId") REFERENCES "event_ticket_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_ticket_reservations"
  ADD CONSTRAINT "event_ticket_reservations_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_ticket_reservations"
  ADD CONSTRAINT "event_ticket_reservations_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
