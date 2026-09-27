-- MARKET-02B: organizer demo requests reuse the platform support workflow,
-- but are explicitly typed and retain marketing attribution fields.
CREATE TYPE "SupportTicketKind" AS ENUM ('support', 'demo_request');

ALTER TABLE "support_tickets"
  ADD COLUMN "kind" "SupportTicketKind" NOT NULL DEFAULT 'support',
  ADD COLUMN "companyName" TEXT,
  ADD COLUMN "eventType" TEXT,
  ADD COLUMN "expectedEventsPerYear" TEXT,
  ADD COLUMN "source" TEXT,
  ADD COLUMN "utmSource" TEXT,
  ADD COLUMN "utmMedium" TEXT,
  ADD COLUMN "utmCampaign" TEXT,
  ADD COLUMN "utmTerm" TEXT,
  ADD COLUMN "utmContent" TEXT;

CREATE INDEX "support_tickets_kind_status_createdAt_idx"
  ON "support_tickets" ("kind", "status", "createdAt");

CREATE INDEX "support_tickets_requesterEmail_kind_createdAt_idx"
  ON "support_tickets" ("requesterEmail", "kind", "createdAt");

CREATE INDEX "support_tickets_companyName_kind_createdAt_idx"
  ON "support_tickets" ("companyName", "kind", "createdAt");

CREATE INDEX "support_tickets_source_createdAt_idx"
  ON "support_tickets" ("source", "createdAt");
