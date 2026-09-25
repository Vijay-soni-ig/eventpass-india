-- Phase 6.3F: private participant documents
CREATE TYPE "EventParticipantDocumentKind" AS ENUM ('IDENTITY', 'CERTIFICATE', 'AGREEMENT', 'OTHER');

CREATE TABLE "event_participant_documents" (
  "id" TEXT NOT NULL,
  "participant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" "EventParticipantDocumentKind" NOT NULL,
  "description" TEXT,
  "file_url" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "file_size_bytes" INTEGER NOT NULL,
  "uploaded_by_user_id" TEXT,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_participant_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_participant_documents_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "event_participant_documents_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "event_participant_documents_participant_id_archived_at_created_at_idx"
  ON "event_participant_documents"("participant_id", "archived_at", "created_at");
CREATE INDEX "event_participant_documents_participant_id_kind_idx"
  ON "event_participant_documents"("participant_id", "kind");

