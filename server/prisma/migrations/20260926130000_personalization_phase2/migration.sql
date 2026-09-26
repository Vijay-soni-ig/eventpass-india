ALTER TYPE "VisitorEventInteractionType" ADD VALUE IF NOT EXISTS 'RECOMMENDATION_IMPRESSION';

ALTER TABLE "visitor_event_interactions" ALTER COLUMN "eventId" DROP NOT NULL;

CREATE TABLE "visitor_preferences" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "preferredCategoryIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "preferredCities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "visitor_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "visitor_preferences_userId_key" ON "visitor_preferences"("userId");
CREATE INDEX "visitor_preferences_updatedAt_idx" ON "visitor_preferences"("updatedAt");

ALTER TABLE "visitor_preferences" ADD CONSTRAINT "visitor_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
