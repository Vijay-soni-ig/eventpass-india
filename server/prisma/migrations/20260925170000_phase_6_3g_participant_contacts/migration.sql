CREATE TYPE "EventParticipantContactType" AS ENUM ('PRIMARY', 'SECONDARY', 'OPERATIONS', 'SALES', 'OTHER');

CREATE TABLE "event_participant_contacts" (
  "id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "participant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "designation" TEXT,
  "contact_type" "EventParticipantContactType" NOT NULL DEFAULT 'SECONDARY',
  "email" TEXT,
  "phone" TEXT,
  "whatsapp" TEXT,
  "notes" TEXT,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "event_participant_contacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_participant_contacts_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "event_participant_contacts_participant_id_fkey"
    FOREIGN KEY ("participant_id") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "event_participant_contacts_event_id_participant_id_archived_at_created_at_idx"
  ON "event_participant_contacts"("event_id", "participant_id", "archived_at", "created_at");
CREATE INDEX "event_participant_contacts_participant_id_is_primary_archived_at_idx"
  ON "event_participant_contacts"("participant_id", "is_primary", "archived_at");
CREATE INDEX "event_participant_contacts_participant_id_email_idx"
  ON "event_participant_contacts"("participant_id", "email");
