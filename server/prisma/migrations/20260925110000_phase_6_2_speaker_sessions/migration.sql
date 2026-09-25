-- Phase 6.2: speaker session/schedule relationship foundation
CREATE TYPE "EventSessionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');
CREATE TYPE "EventSessionSpeakerRole" AS ENUM ('PRIMARY', 'MODERATOR', 'PANELIST');

CREATE TABLE "event_sessions" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "date" DATE NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  "room" TEXT,
  "status" "EventSessionStatus" NOT NULL DEFAULT 'DRAFT',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_session_speakers" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "role" "EventSessionSpeakerRole" NOT NULL DEFAULT 'PRIMARY',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_session_speakers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_session_speakers_sessionId_participantId_key" ON "event_session_speakers"("sessionId", "participantId");
CREATE INDEX "event_sessions_eventId_date_startTime_idx" ON "event_sessions"("eventId", "date", "startTime");
CREATE INDEX "event_sessions_eventId_status_sortOrder_idx" ON "event_sessions"("eventId", "status", "sortOrder");
CREATE INDEX "event_session_speakers_participantId_idx" ON "event_session_speakers"("participantId");
CREATE INDEX "event_session_speakers_sessionId_role_sortOrder_idx" ON "event_session_speakers"("sessionId", "role", "sortOrder");

ALTER TABLE "event_sessions" ADD CONSTRAINT "event_sessions_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_session_speakers" ADD CONSTRAINT "event_session_speakers_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "event_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_session_speakers" ADD CONSTRAINT "event_session_speakers_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
