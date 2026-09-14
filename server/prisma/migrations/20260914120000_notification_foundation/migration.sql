-- Notification Foundation: durable outbox, delivery tracking, and channel preferences.
-- This migration is intentionally additive. It does not alter existing notification behavior.

CREATE TABLE "notification_intents" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "event_key" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "completed_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_intents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_intents_idempotency_key_key"
    ON "notification_intents"("idempotency_key");
CREATE INDEX "notification_intents_status_available_at_idx"
    ON "notification_intents"("status", "available_at");
CREATE INDEX "notification_intents_event_type_entity_id_idx"
    ON "notification_intents"("event_type", "entity_id");

CREATE TABLE "notification_deliveries" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "intent_id" TEXT NOT NULL,
    "recipient_user_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "provider" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "template_key" TEXT,
    "rendered_payload" JSONB,
    "provider_message_id" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notification_deliveries_intent_id_fkey"
        FOREIGN KEY ("intent_id") REFERENCES "notification_intents"("id") ON DELETE CASCADE,
    CONSTRAINT "notification_deliveries_recipient_user_id_fkey"
        FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "notification_deliveries_intent_recipient_channel_key"
    ON "notification_deliveries"("intent_id", "recipient_user_id", "channel");
CREATE INDEX "notification_deliveries_status_available_at_idx"
    ON "notification_deliveries"("status", "available_at");
CREATE INDEX "notification_deliveries_recipient_channel_status_idx"
    ON "notification_deliveries"("recipient_user_id", "channel", "status");
CREATE INDEX "notification_deliveries_provider_message_id_idx"
    ON "notification_deliveries"("provider_message_id");

CREATE TABLE "notification_channel_preferences" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "user_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_channel_preferences_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notification_channel_preferences_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "notification_channel_preferences_user_event_channel_key"
    ON "notification_channel_preferences"("user_id", "event_type", "channel");
CREATE INDEX "notification_channel_preferences_event_type_channel_idx"
    ON "notification_channel_preferences"("event_type", "channel");
