CREATE TABLE "stall_booking_add_on_snapshots" (
  "id" TEXT NOT NULL,
  "stallBookingId" TEXT NOT NULL,
  "exhibitionAddOnId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "unitPrice" DECIMAL(10,2) NOT NULL,
  "quantity" INTEGER NOT NULL,
  "lineTotal" DECIMAL(10,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stall_booking_add_on_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stall_booking_add_on_snapshots_stallBookingId_idx"
  ON "stall_booking_add_on_snapshots"("stallBookingId");
CREATE INDEX "stall_booking_add_on_snapshots_exhibitionAddOnId_idx"
  ON "stall_booking_add_on_snapshots"("exhibitionAddOnId");

ALTER TABLE "stall_booking_add_on_snapshots"
  ADD CONSTRAINT "stall_booking_add_on_snapshots_stallBookingId_fkey"
  FOREIGN KEY ("stallBookingId") REFERENCES "stall_bookings"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stall_booking_add_on_snapshots"
  ADD CONSTRAINT "stall_booking_add_on_snapshots_exhibitionAddOnId_fkey"
  FOREIGN KEY ("exhibitionAddOnId") REFERENCES "exhibition_add_ons"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
