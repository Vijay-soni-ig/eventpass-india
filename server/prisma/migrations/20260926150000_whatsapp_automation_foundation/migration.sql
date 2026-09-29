-- WhatsApp Automation foundation: consent, provider status timestamps, and the WHATSAPP notification channel.
CREATE TYPE "WhatsAppConsentStatus" AS ENUM ('OPTED_IN', 'OPTED_OUT');

CREATE TABLE "whatsapp_consents" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "user_id" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "status" "WhatsAppConsentStatus" NOT NULL DEFAULT 'OPTED_OUT',
    "source" TEXT NOT NULL,
    "consent_text" TEXT NOT NULL,
    "consented_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "whatsapp_consents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "whatsapp_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "whatsapp_consents_user_id_key" ON "whatsapp_consents"("user_id");
CREATE INDEX "whatsapp_consents_phone_e164_idx" ON "whatsapp_consents"("phone_e164");
CREATE INDEX "whatsapp_consents_status_idx" ON "whatsapp_consents"("status");

ALTER TABLE "notification_deliveries"
  ADD COLUMN "provider_status_at" TIMESTAMPTZ,
  ADD COLUMN "read_at" TIMESTAMPTZ;
