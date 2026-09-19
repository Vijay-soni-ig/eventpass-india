-- Registration Foundation: event-scoped visitor registration.
CREATE TYPE "EventRegistrationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');
CREATE TYPE "EventRegistrationSource" AS ENUM ('PUBLIC', 'ORGANIZER', 'ADMIN');

CREATE TABLE "event_registration_settings" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "capacity" INTEGER,
  "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "event_registration_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_registrations" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "userId" TEXT,
  "fullName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "companyName" TEXT,
  "status" "EventRegistrationStatus" NOT NULL DEFAULT 'PENDING',
  "source" "EventRegistrationSource" NOT NULL DEFAULT 'PUBLIC',
  "consentAccepted" BOOLEAN NOT NULL DEFAULT false,
  "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "idempotencyKey" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_registration_settings_eventId_key" ON "event_registration_settings"("eventId");
CREATE UNIQUE INDEX "event_registrations_eventId_email_key" ON "event_registrations"("eventId", "email");
CREATE UNIQUE INDEX "event_registrations_eventId_idempotencyKey_key" ON "event_registrations"("eventId", "idempotencyKey");
CREATE INDEX "event_registrations_eventId_status_createdAt_idx" ON "event_registrations"("eventId", "status", "createdAt");
CREATE INDEX "event_registrations_userId_eventId_idx" ON "event_registrations"("userId", "eventId");
CREATE INDEX "event_registrations_email_idx" ON "event_registrations"("email");

ALTER TABLE "event_registration_settings"
  ADD CONSTRAINT "event_registration_settings_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_registrations"
  ADD CONSTRAINT "event_registrations_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_registrations"
  ADD CONSTRAINT "event_registrations_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
