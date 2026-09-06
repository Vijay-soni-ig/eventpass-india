-- CreateTable
CREATE TABLE "exhibition_media" (
    "id" TEXT NOT NULL,
    "exhibitionId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "altText" TEXT,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exhibition_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exhibition_schedule" (
    "id" TEXT NOT NULL,
    "exhibitionId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exhibition_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exhibition_faqs" (
    "id" TEXT NOT NULL,
    "exhibitionId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exhibition_faqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exhibition_highlights" (
    "id" TEXT NOT NULL,
    "exhibitionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "iconKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exhibition_highlights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exhibition_audience" (
    "id" TEXT NOT NULL,
    "exhibitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exhibition_audience_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exhibition_media_exhibitionId_active_idx" ON "exhibition_media"("exhibitionId", "active");

-- CreateIndex
CREATE INDEX "exhibition_media_exhibitionId_sortOrder_idx" ON "exhibition_media"("exhibitionId", "sortOrder");

-- CreateIndex
CREATE INDEX "exhibition_schedule_exhibitionId_active_idx" ON "exhibition_schedule"("exhibitionId", "active");

-- CreateIndex
CREATE INDEX "exhibition_schedule_exhibitionId_date_idx" ON "exhibition_schedule"("exhibitionId", "date");

-- CreateIndex
CREATE INDEX "exhibition_faqs_exhibitionId_active_idx" ON "exhibition_faqs"("exhibitionId", "active");

-- CreateIndex
CREATE INDEX "exhibition_highlights_exhibitionId_active_idx" ON "exhibition_highlights"("exhibitionId", "active");

-- CreateIndex
CREATE INDEX "exhibition_audience_exhibitionId_active_idx" ON "exhibition_audience"("exhibitionId", "active");

-- AddForeignKey
ALTER TABLE "exhibition_media" ADD CONSTRAINT "exhibition_media_exhibitionId_fkey" FOREIGN KEY ("exhibitionId") REFERENCES "exhibitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exhibition_schedule" ADD CONSTRAINT "exhibition_schedule_exhibitionId_fkey" FOREIGN KEY ("exhibitionId") REFERENCES "exhibitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exhibition_faqs" ADD CONSTRAINT "exhibition_faqs_exhibitionId_fkey" FOREIGN KEY ("exhibitionId") REFERENCES "exhibitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exhibition_highlights" ADD CONSTRAINT "exhibition_highlights_exhibitionId_fkey" FOREIGN KEY ("exhibitionId") REFERENCES "exhibitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exhibition_audience" ADD CONSTRAINT "exhibition_audience_exhibitionId_fkey" FOREIGN KEY ("exhibitionId") REFERENCES "exhibitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
