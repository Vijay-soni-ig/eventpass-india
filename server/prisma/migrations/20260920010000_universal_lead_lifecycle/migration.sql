CREATE TYPE "EventLeadStatus" AS ENUM ('NEW','CONTACTED','INTERESTED','QUALIFIED','NEGOTIATION','CONVERTED','LOST','ARCHIVED');
CREATE TYPE "EventLeadPriority" AS ENUM ('LOW','MEDIUM','HIGH');
CREATE TYPE "EventLeadSource" AS ENUM ('QR_SCAN','MANUAL','REGISTRATION','TICKET_CHECK_IN','IMPORT');
CREATE TYPE "EventLeadInteractionType" AS ENUM ('NOTE','CALL','EMAIL','WHATSAPP','MEETING','OTHER');
CREATE TYPE "EventLeadFollowUpStatus" AS ENUM ('OPEN','COMPLETED','CANCELLED');

CREATE TABLE "event_leads" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "exhibitorBusinessId" TEXT,
  "exhibitionExhibitorId" TEXT,
  "stallId" TEXT,
  "visitorUserId" TEXT,
  "registrationId" TEXT,
  "ticketId" TEXT,
  "visitorName" TEXT NOT NULL,
  "visitorEmail" TEXT,
  "visitorPhone" TEXT,
  "companyName" TEXT,
  "source" "EventLeadSource" NOT NULL DEFAULT 'MANUAL',
  "status" "EventLeadStatus" NOT NULL DEFAULT 'NEW',
  "priority" "EventLeadPriority" NOT NULL DEFAULT 'MEDIUM',
  "notes" TEXT,
  "assignedToUserId" TEXT,
  "capturedByUserId" TEXT,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_leads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_lead_interactions" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "type" "EventLeadInteractionType" NOT NULL DEFAULT 'NOTE',
  "note" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_lead_interactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_lead_follow_ups" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "assignedToUserId" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "status" "EventLeadFollowUpStatus" NOT NULL DEFAULT 'OPEN',
  "note" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_lead_follow_ups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "event_leads_eventId_status_createdAt_idx" ON "event_leads"("eventId","status","createdAt");
CREATE INDEX "event_leads_eventId_exhibitorBusinessId_status_idx" ON "event_leads"("eventId","exhibitorBusinessId","status");
CREATE INDEX "event_leads_exhibitorBusinessId_createdAt_idx" ON "event_leads"("exhibitorBusinessId","createdAt");
CREATE INDEX "event_leads_visitorEmail_idx" ON "event_leads"("visitorEmail");
CREATE INDEX "event_leads_visitorPhone_idx" ON "event_leads"("visitorPhone");
CREATE INDEX "event_leads_ticketId_idx" ON "event_leads"("ticketId");
CREATE INDEX "event_leads_registrationId_idx" ON "event_leads"("registrationId");
CREATE INDEX "event_lead_interactions_leadId_createdAt_idx" ON "event_lead_interactions"("leadId","createdAt");
CREATE INDEX "event_lead_interactions_createdByUserId_createdAt_idx" ON "event_lead_interactions"("createdByUserId","createdAt");
CREATE INDEX "event_lead_follow_ups_leadId_status_dueAt_idx" ON "event_lead_follow_ups"("leadId","status","dueAt");
CREATE INDEX "event_lead_follow_ups_assignedToUserId_status_dueAt_idx" ON "event_lead_follow_ups"("assignedToUserId","status","dueAt");

ALTER TABLE "event_leads" ADD CONSTRAINT "event_leads_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_leads" ADD CONSTRAINT "event_leads_exhibitorBusinessId_fkey" FOREIGN KEY ("exhibitorBusinessId") REFERENCES "exhibitor_businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_leads" ADD CONSTRAINT "event_leads_exhibitionExhibitorId_fkey" FOREIGN KEY ("exhibitionExhibitorId") REFERENCES "exhibition_exhibitors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_leads" ADD CONSTRAINT "event_leads_stallId_fkey" FOREIGN KEY ("stallId") REFERENCES "stalls"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_leads" ADD CONSTRAINT "event_leads_visitorUserId_fkey" FOREIGN KEY ("visitorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_leads" ADD CONSTRAINT "event_leads_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "event_registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_leads" ADD CONSTRAINT "event_leads_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "event_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_leads" ADD CONSTRAINT "event_leads_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_leads" ADD CONSTRAINT "event_leads_capturedByUserId_fkey" FOREIGN KEY ("capturedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "event_lead_interactions" ADD CONSTRAINT "event_lead_interactions_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "event_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_lead_interactions" ADD CONSTRAINT "event_lead_interactions_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_lead_follow_ups" ADD CONSTRAINT "event_lead_follow_ups_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "event_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_lead_follow_ups" ADD CONSTRAINT "event_lead_follow_ups_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
