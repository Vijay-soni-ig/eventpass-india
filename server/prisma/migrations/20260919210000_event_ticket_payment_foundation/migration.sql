CREATE TYPE "EventTicketOrderStatus" AS ENUM ('PAYMENT_PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED');
ALTER TYPE "EventTicketReservationStatus" ADD VALUE 'CONVERTED';

CREATE TABLE "event_ticket_orders" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(10,2) NOT NULL,
  "subtotal" DECIMAL(10,2) NOT NULL,
  "totalAmount" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "status" "EventTicketOrderStatus" NOT NULL DEFAULT 'PAYMENT_PENDING',
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_ticket_orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "event_ticket_orders_reservationId_key" ON "event_ticket_orders"("reservationId");
CREATE UNIQUE INDEX "event_ticket_orders_paymentId_key" ON "event_ticket_orders"("paymentId");
CREATE UNIQUE INDEX "event_ticket_orders_userId_idempotencyKey_key" ON "event_ticket_orders"("userId","idempotencyKey");
CREATE INDEX "event_ticket_orders_eventId_status_createdAt_idx" ON "event_ticket_orders"("eventId","status","createdAt");
CREATE INDEX "event_ticket_orders_userId_status_createdAt_idx" ON "event_ticket_orders"("userId","status","createdAt");
CREATE INDEX "event_ticket_orders_paymentId_idx" ON "event_ticket_orders"("paymentId");
ALTER TABLE "event_ticket_orders" ADD CONSTRAINT "event_ticket_orders_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_ticket_orders" ADD CONSTRAINT "event_ticket_orders_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "event_ticket_reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_ticket_orders" ADD CONSTRAINT "event_ticket_orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_ticket_orders" ADD CONSTRAINT "event_ticket_orders_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
