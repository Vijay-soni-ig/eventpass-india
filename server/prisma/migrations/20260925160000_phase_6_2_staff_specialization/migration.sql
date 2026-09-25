CREATE TYPE "EventStaffAvailability" AS ENUM ('AVAILABLE', 'ON_LEAVE', 'UNAVAILABLE', 'ON_CALL');

CREATE TABLE "event_staff_profiles" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "department" TEXT,
  "assignmentArea" TEXT,
  "roleDescription" TEXT,
  "availability" "EventStaffAvailability" NOT NULL DEFAULT 'AVAILABLE',
  "availabilityNote" TEXT,
  "shiftStart" TEXT,
  "shiftEnd" TEXT,
  "operationalNotes" TEXT,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_staff_profiles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "event_staff_profiles_participantId_key" ON "event_staff_profiles"("participantId");
CREATE INDEX "event_staff_profiles_eventId_department_displayOrder_idx" ON "event_staff_profiles"("eventId", "department", "displayOrder");
CREATE INDEX "event_staff_profiles_eventId_availability_idx" ON "event_staff_profiles"("eventId", "availability");
ALTER TABLE "event_staff_profiles" ADD CONSTRAINT "event_staff_profiles_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_staff_profiles" ADD CONSTRAINT "event_staff_profiles_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
