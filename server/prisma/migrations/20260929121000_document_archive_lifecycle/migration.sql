ALTER TABLE "documents" ADD COLUMN "archivedAt" TIMESTAMP(3);
CREATE INDEX "documents_exhibitorBusinessId_archivedAt_idx" ON "documents"("exhibitorBusinessId", "archivedAt");
