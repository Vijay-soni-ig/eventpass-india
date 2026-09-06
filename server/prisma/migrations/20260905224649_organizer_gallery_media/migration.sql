-- CreateTable
CREATE TABLE "organizer_gallery_media" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "caption" TEXT,
    "altText" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizer_gallery_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organizer_gallery_media_organizerId_idx" ON "organizer_gallery_media"("organizerId");

-- CreateIndex
CREATE INDEX "organizer_gallery_media_organizerId_sortOrder_idx" ON "organizer_gallery_media"("organizerId", "sortOrder");

-- AddForeignKey
ALTER TABLE "organizer_gallery_media" ADD CONSTRAINT "organizer_gallery_media_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_gallery_media" ADD CONSTRAINT "organizer_gallery_media_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
