-- CreateTable
CREATE TABLE "organizer_onboarding_profiles" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "discoverySources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "eventFrequency" TEXT,
    "typicalEventSize" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizer_onboarding_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizer_onboarding_profiles_organizerId_key" ON "organizer_onboarding_profiles"("organizerId");

-- CreateIndex
CREATE INDEX "organizer_onboarding_profiles_eventFrequency_idx" ON "organizer_onboarding_profiles"("eventFrequency");

-- CreateIndex
CREATE INDEX "organizer_onboarding_profiles_typicalEventSize_idx" ON "organizer_onboarding_profiles"("typicalEventSize");

-- AddForeignKey
ALTER TABLE "organizer_onboarding_profiles" ADD CONSTRAINT "organizer_onboarding_profiles_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
