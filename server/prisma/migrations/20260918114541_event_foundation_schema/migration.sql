-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('EXHIBITION', 'CONFERENCE', 'WORKSHOP', 'SEMINAR', 'CONCERT', 'FESTIVAL', 'SPORTS', 'COMMUNITY', 'OTHER');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventModule" AS ENUM ('REGISTRATION', 'TICKETING', 'EXHIBITORS', 'STALL_BOOKING', 'FLOOR_PLAN', 'CHECK_IN', 'LEADS', 'SPEAKERS', 'SESSIONS', 'SPONSORS', 'VENDORS', 'VOLUNTEERS', 'SEATING', 'ANALYTICS');

-- CreateTable
CREATE TABLE "event_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "parentCategoryId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT,
    "description" TEXT,
    "eventType" "EventType" NOT NULL,
    "categoryId" TEXT,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "Visibility" NOT NULL DEFAULT 'public',
    "startDate" DATE,
    "endDate" DATE,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "venue" TEXT,
    "city" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "coverImageUrl" TEXT,
    "refundPolicy" TEXT,
    "terms" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_module_enablements" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "moduleType" "EventModule" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_module_enablements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_categories_slug_key" ON "event_categories"("slug");

-- CreateIndex
CREATE INDEX "event_categories_parentCategoryId_idx" ON "event_categories"("parentCategoryId");

-- CreateIndex
CREATE INDEX "event_categories_active_idx" ON "event_categories"("active");

-- CreateIndex
CREATE INDEX "event_categories_active_sortOrder_idx" ON "event_categories"("active", "sortOrder");

-- CreateIndex
CREATE INDEX "events_organizerId_idx" ON "events"("organizerId");

-- CreateIndex
CREATE INDEX "events_ownerId_idx" ON "events"("ownerId");

-- CreateIndex
CREATE INDEX "events_status_visibility_idx" ON "events"("status", "visibility");

-- CreateIndex
CREATE INDEX "events_eventType_idx" ON "events"("eventType");

-- CreateIndex
CREATE INDEX "events_categoryId_idx" ON "events"("categoryId");

-- CreateIndex
CREATE INDEX "events_startDate_idx" ON "events"("startDate");

-- CreateIndex
CREATE INDEX "event_module_enablements_eventId_idx" ON "event_module_enablements"("eventId");

-- CreateIndex
CREATE INDEX "event_module_enablements_moduleType_enabled_idx" ON "event_module_enablements"("moduleType", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "event_module_enablements_eventId_moduleType_key" ON "event_module_enablements"("eventId", "moduleType");

-- AddForeignKey
ALTER TABLE "event_categories" ADD CONSTRAINT "event_categories_parentCategoryId_fkey" FOREIGN KEY ("parentCategoryId") REFERENCES "event_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "event_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_module_enablements" ADD CONSTRAINT "event_module_enablements_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

