CREATE TABLE "notification_push_subscriptions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "user_agent" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "last_used_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  CONSTRAINT "notification_push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_push_subscriptions_endpoint_key"
  ON "notification_push_subscriptions"("endpoint");

CREATE INDEX "notification_push_subscriptions_user_id_revoked_at_idx"
  ON "notification_push_subscriptions"("user_id", "revoked_at");

ALTER TABLE "notification_push_subscriptions"
  ADD CONSTRAINT "notification_push_subscriptions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
