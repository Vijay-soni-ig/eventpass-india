-- AlterTable
ALTER TABLE "exhibitions" ADD COLUMN     "eventId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "exhibitions_eventId_key" ON "exhibitions"("eventId");

-- AddForeignKey
ALTER TABLE "exhibitions" ADD CONSTRAINT "exhibitions_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

