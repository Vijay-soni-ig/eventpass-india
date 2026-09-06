-- AlterTable
ALTER TABLE "organizers" ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "coverImageUrl" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "publicEmail" TEXT,
ADD COLUMN     "publicPhone" TEXT,
ADD COLUMN     "publicProfileEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "state" TEXT;

-- CreateTable
CREATE TABLE "organizer_social_links" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizer_social_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizer_follows" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizer_follows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organizer_social_links_organizerId_idx" ON "organizer_social_links"("organizerId");

-- CreateIndex
CREATE INDEX "organizer_follows_organizerId_idx" ON "organizer_follows"("organizerId");

-- CreateIndex
CREATE INDEX "organizer_follows_userId_idx" ON "organizer_follows"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "organizer_follows_organizerId_userId_key" ON "organizer_follows"("organizerId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "organizers_slug_key" ON "organizers"("slug");

-- AddForeignKey
ALTER TABLE "organizer_social_links" ADD CONSTRAINT "organizer_social_links_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_follows" ADD CONSTRAINT "organizer_follows_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_follows" ADD CONSTRAINT "organizer_follows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
