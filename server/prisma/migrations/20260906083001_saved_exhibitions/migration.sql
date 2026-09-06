-- CreateTable
CREATE TABLE "saved_exhibitions" (
    "id" TEXT NOT NULL,
    "exhibitionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_exhibitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_exhibitions_exhibitionId_idx" ON "saved_exhibitions"("exhibitionId");

-- CreateIndex
CREATE INDEX "saved_exhibitions_userId_idx" ON "saved_exhibitions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "saved_exhibitions_userId_exhibitionId_key" ON "saved_exhibitions"("userId", "exhibitionId");

-- AddForeignKey
ALTER TABLE "saved_exhibitions" ADD CONSTRAINT "saved_exhibitions_exhibitionId_fkey" FOREIGN KEY ("exhibitionId") REFERENCES "exhibitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_exhibitions" ADD CONSTRAINT "saved_exhibitions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
