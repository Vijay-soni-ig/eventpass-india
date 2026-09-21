ALTER TYPE "EventModule" ADD VALUE IF NOT EXISTS 'PARTICIPANTS';

CREATE TYPE "EventParticipantType" AS ENUM ('SPEAKER','SPONSOR','VENDOR','PARTNER','STAFF','CUSTOM');
CREATE TYPE "EventParticipantStatus" AS ENUM ('ACTIVE','INACTIVE','ARCHIVED');

CREATE TABLE "event_participants" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "participantType" "EventParticipantType" NOT NULL,
  "customType" TEXT,
  "name" TEXT NOT NULL,
  "title" TEXT,
  "organization" TEXT,
  "bio" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "website" TEXT,
  "photoUrl" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "status" "EventParticipantStatus" NOT NULL DEFAULT 'ACTIVE',
  "isPublic" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "event_participants_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "event_participants_eventId_participantType_status_idx"
  ON "event_participants"("eventId","participantType","status");
CREATE INDEX "event_participants_eventId_isPublic_sortOrder_idx"
  ON "event_participants"("eventId","isPublic","sortOrder");
CREATE INDEX "event_participants_eventId_name_idx"
  ON "event_participants"("eventId","name");

ALTER TABLE "event_participants"
  ADD CONSTRAINT "event_participants_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "events"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
