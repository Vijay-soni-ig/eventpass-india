-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('pending', 'verified');

-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('owner', 'finance', 'operations', 'marketing', 'scanner');

-- CreateEnum
CREATE TYPE "TeamMemberStatus" AS ENUM ('active', 'invited');

-- CreateEnum
CREATE TYPE "ExhibitionStatus" AS ENUM ('draft', 'live', 'paused', 'completed');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('public', 'private');

-- CreateEnum
CREATE TYPE "StallType" AS ENUM ('premium', 'standard', 'basic');

-- CreateEnum
CREATE TYPE "StallStatus" AS ENUM ('available', 'reserved', 'sold');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('paid', 'pending', 'refunded');

-- CreateTable
CREATE TABLE "exhibitor_businesses" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "companyName" TEXT,
    "businessType" TEXT,
    "address" TEXT,
    "gst" TEXT,
    "pan" TEXT,
    "website" TEXT,
    "logoUrl" TEXT,
    "brandPrimaryColor" TEXT,
    "brandSecondaryColor" TEXT,
    "kycStatus" "KycStatus" NOT NULL DEFAULT 'pending',
    "bankAccountName" TEXT,
    "bankAccountNumber" TEXT,
    "bankIfsc" TEXT,
    "taxCategory" TEXT,
    "invoicePreference" TEXT,
    "bankVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exhibitor_businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "invitedEmail" TEXT NOT NULL,
    "userId" TEXT,
    "role" "TeamRole" NOT NULL,
    "status" "TeamMemberStatus" NOT NULL DEFAULT 'invited',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exhibitions" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "venue" TEXT,
    "city" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "coverImageUrl" TEXT,
    "floorPlanUrl" TEXT,
    "status" "ExhibitionStatus" NOT NULL DEFAULT 'draft',
    "visibility" "Visibility" NOT NULL DEFAULT 'public',
    "refundPolicy" TEXT,
    "terms" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exhibitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_types" (
    "id" TEXT NOT NULL,
    "exhibitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stalls" (
    "id" TEXT NOT NULL,
    "exhibitionId" TEXT NOT NULL,
    "code" TEXT,
    "stallType" "StallType",
    "size" TEXT,
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "StallStatus" NOT NULL DEFAULT 'available',
    "posX" DECIMAL(10,2),
    "posY" DECIMAL(10,2),
    "width" DECIMAL(10,2),
    "height" DECIMAL(10,2),
    "buyerName" TEXT,
    "buyerEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stalls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_bookings" (
    "id" TEXT NOT NULL,
    "exhibitionId" TEXT NOT NULL,
    "ticketTypeId" TEXT,
    "buyerUserId" TEXT,
    "attendeeName" TEXT,
    "attendeeEmail" TEXT,
    "attendeePhone" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'paid',
    "qrCode" TEXT NOT NULL,
    "checkInStatus" BOOLEAN NOT NULL DEFAULT false,
    "checkInTime" TIMESTAMP(3),
    "visitDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stall_bookings" (
    "id" TEXT NOT NULL,
    "stallId" TEXT NOT NULL,
    "exhibitionId" TEXT NOT NULL,
    "buyerUserId" TEXT,
    "buyerName" TEXT,
    "buyerEmail" TEXT,
    "amountPaid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'paid',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stall_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exhibitor_businesses_ownerId_key" ON "exhibitor_businesses"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_bookings_qrCode_key" ON "ticket_bookings"("qrCode");

-- AddForeignKey
ALTER TABLE "exhibitor_businesses" ADD CONSTRAINT "exhibitor_businesses_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "exhibitor_businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exhibitions" ADD CONSTRAINT "exhibitions_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_exhibitionId_fkey" FOREIGN KEY ("exhibitionId") REFERENCES "exhibitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stalls" ADD CONSTRAINT "stalls_exhibitionId_fkey" FOREIGN KEY ("exhibitionId") REFERENCES "exhibitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_bookings" ADD CONSTRAINT "ticket_bookings_exhibitionId_fkey" FOREIGN KEY ("exhibitionId") REFERENCES "exhibitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_bookings" ADD CONSTRAINT "ticket_bookings_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "ticket_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_bookings" ADD CONSTRAINT "ticket_bookings_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stall_bookings" ADD CONSTRAINT "stall_bookings_stallId_fkey" FOREIGN KEY ("stallId") REFERENCES "stalls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stall_bookings" ADD CONSTRAINT "stall_bookings_exhibitionId_fkey" FOREIGN KEY ("exhibitionId") REFERENCES "exhibitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stall_bookings" ADD CONSTRAINT "stall_bookings_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
