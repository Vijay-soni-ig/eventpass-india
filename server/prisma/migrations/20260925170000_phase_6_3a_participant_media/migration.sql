-- Phase 6.3A: shared participant media and profile presentation foundation.
CREATE TYPE "EventParticipantMediaKind" AS ENUM ('PROFILE_IMAGE', 'LOGO', 'GALLERY');
CREATE TYPE "EventParticipantMediaVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

CREATE TABLE "event_participant_media" (
  "id" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "kind" "EventParticipantMediaKind" NOT NULL,
  "visibility" "EventParticipantMediaVisibility" NOT NULL DEFAULT 'PUBLIC',
  "fileUrl" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSizeBytes" INTEGER NOT NULL,
  "altText" TEXT,
  "caption" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "archivedAt" TIMESTAMP(3),
  "uploadedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "event_participant_media_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "event_participant_media_participantId_kind_active_archivedAt_idx"
  ON "event_participant_media"("participantId", "kind", "active", "archivedAt");

CREATE INDEX "event_participant_media_participantId_visibility_active_archivedAt_sortOrder_idx"
  ON "event_participant_media"("participantId", "visibility", "active", "archivedAt", "sortOrder");

ALTER TABLE "event_participant_media"
  ADD CONSTRAINT "event_participant_media_participantId_fkey"
  FOREIGN KEY ("participantId") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_participant_media"
  ADD CONSTRAINT "event_participant_media_uploadedByUserId_fkey"
  FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
