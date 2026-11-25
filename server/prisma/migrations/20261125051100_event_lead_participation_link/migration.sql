ALTER TABLE "event_leads"
ADD COLUMN "eventExhibitorParticipationId" TEXT;

CREATE INDEX "event_leads_eventExhibitorParticipationId_idx"
ON "event_leads"("eventExhibitorParticipationId");

ALTER TABLE "event_leads"
ADD CONSTRAINT "event_leads_eventExhibitorParticipationId_fkey"
FOREIGN KEY ("eventExhibitorParticipationId")
REFERENCES "event_exhibitor_participations"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
