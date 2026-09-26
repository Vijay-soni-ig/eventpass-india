CREATE TYPE "VisitorEventInteractionType" AS ENUM ('VIEW', 'CLICK', 'SAVE', 'REGISTER', 'PURCHASE', 'CHECK_IN', 'SEARCH');

CREATE TABLE "visitor_event_interactions" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "eventId" TEXT NOT NULL,
  "type" "VisitorEventInteractionType" NOT NULL,
  "sessionId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "visitor_event_interactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "visitor_event_interactions_userId_createdAt_idx" ON "visitor_event_interactions"("userId", "createdAt");
CREATE INDEX "visitor_event_interactions_eventId_createdAt_idx" ON "visitor_event_interactions"("eventId", "createdAt");
CREATE INDEX "visitor_event_interactions_userId_eventId_type_createdAt_idx" ON "visitor_event_interactions"("userId", "eventId", "type", "createdAt");
CREATE INDEX "visitor_event_interactions_sessionId_createdAt_idx" ON "visitor_event_interactions"("sessionId", "createdAt");

ALTER TABLE "visitor_event_interactions" ADD CONSTRAINT "visitor_event_interactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "visitor_event_interactions" ADD CONSTRAINT "visitor_event_interactions_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
