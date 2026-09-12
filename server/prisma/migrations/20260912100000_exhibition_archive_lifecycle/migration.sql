-- UI-27 P1: preserve exhibitions and their operational/financial history by
-- replacing destructive deletion with a reversible archive marker.
-- The archive table is intentionally separate from Exhibition so the existing
-- Prisma model/status lifecycle remains backward-compatible. Public routes
-- already require visibility=public, so archiving sets visibility private and
-- the archive row records the original visibility/status for restoration.
CREATE TABLE "exhibition_archives" (
  "exhibitionId" TEXT NOT NULL,
  "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedByUserId" TEXT,
  "previousStatus" TEXT NOT NULL,
  "previousVisibility" TEXT NOT NULL,

  CONSTRAINT "exhibition_archives_pkey" PRIMARY KEY ("exhibitionId"),
  CONSTRAINT "exhibition_archives_exhibitionId_fkey"
    FOREIGN KEY ("exhibitionId") REFERENCES "exhibitions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "exhibition_archives_archivedByUserId_fkey"
    FOREIGN KEY ("archivedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "exhibition_archives_archivedByUserId_idx"
  ON "exhibition_archives"("archivedByUserId");
CREATE INDEX "exhibition_archives_archivedAt_idx"
  ON "exhibition_archives"("archivedAt");
