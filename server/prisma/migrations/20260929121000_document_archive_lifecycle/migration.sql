ALTER TABLE "documents" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "documents" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "documents_exhibitorBusinessId_archivedAt_idx" ON "documents"("exhibitorBusinessId", "archivedAt");
