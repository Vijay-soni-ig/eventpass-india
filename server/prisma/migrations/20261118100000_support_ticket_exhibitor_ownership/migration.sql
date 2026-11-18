ALTER TABLE "support_tickets"
  ADD COLUMN "exhibitorBusinessId" TEXT;

CREATE INDEX "support_tickets_exhibitorBusinessId_status_updatedAt_idx"
  ON "support_tickets"("exhibitorBusinessId", "status", "updatedAt");

ALTER TABLE "support_tickets"
  ADD CONSTRAINT "support_tickets_exhibitorBusinessId_fkey"
  FOREIGN KEY ("exhibitorBusinessId") REFERENCES "exhibitor_businesses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "support_tickets"
  ADD CONSTRAINT "support_tickets_single_owner_check"
  CHECK (NOT ("organizerId" IS NOT NULL AND "exhibitorBusinessId" IS NOT NULL));
