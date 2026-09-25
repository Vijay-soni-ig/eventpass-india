CREATE TABLE "event_partner_profiles" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "partnerCategory" TEXT,
  "relationshipSummary" TEXT,
  "contributionSummary" TEXT,
  "engagementModel" TEXT,
  "displayLabel" TEXT,
  "displayDescription" TEXT,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "showContact" BOOLEAN NOT NULL DEFAULT false,
  "showWebsite" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_partner_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_partner_profiles_participantId_key" ON "event_partner_profiles"("participantId");
CREATE INDEX "event_partner_profiles_eventId_displayOrder_idx" ON "event_partner_profiles"("eventId","displayOrder");

ALTER TABLE "event_partner_profiles"
  ADD CONSTRAINT "event_partner_profiles_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_partner_profiles"
  ADD CONSTRAINT "event_partner_profiles_participantId_fkey"
  FOREIGN KEY ("participantId") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
