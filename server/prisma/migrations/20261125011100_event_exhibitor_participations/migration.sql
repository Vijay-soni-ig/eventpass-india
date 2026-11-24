CREATE TYPE "EventExhibitorParticipationStatus" AS ENUM ('APPLIED', 'CONFIRMED', 'REJECTED', 'WITHDRAWN');

CREATE TABLE "event_exhibitor_participations" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "exhibitorBusinessId" TEXT NOT NULL,
    "status" "EventExhibitorParticipationStatus" NOT NULL DEFAULT 'APPLIED',
    "applicationNote" TEXT,
    "reviewNote" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "event_exhibitor_participations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_exhibitor_participations_eventId_exhibitorBusinessId_key"
ON "event_exhibitor_participations"("eventId", "exhibitorBusinessId");

CREATE INDEX "event_exhibitor_participations_eventId_status_createdAt_idx"
ON "event_exhibitor_participations"("eventId", "status", "createdAt");

CREATE INDEX "event_exhibitor_participations_exhibitorBusinessId_status_c_idx"
ON "event_exhibitor_participations"("exhibitorBusinessId", "status", "createdAt");

CREATE INDEX "event_exhibitor_participations_reviewedByUserId_idx"
ON "event_exhibitor_participations"("reviewedByUserId");

ALTER TABLE "event_exhibitor_participations"
ADD CONSTRAINT "event_exhibitor_participations_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_exhibitor_participations"
ADD CONSTRAINT "event_exhibitor_participations_exhibitorBusinessId_fkey"
FOREIGN KEY ("exhibitorBusinessId") REFERENCES "exhibitor_businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_exhibitor_participations"
ADD CONSTRAINT "event_exhibitor_participations_reviewedByUserId_fkey"
FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
