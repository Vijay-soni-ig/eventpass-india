ALTER TABLE "organizer_memberships"
  ADD COLUMN "invitationTokenHash" TEXT,
  ADD COLUMN "invitationExpiresAt" TIMESTAMP(3),
  ADD COLUMN "invitationAcceptedAt" TIMESTAMP(3);

ALTER TABLE "exhibitor_memberships"
  ADD COLUMN "invitationTokenHash" TEXT,
  ADD COLUMN "invitationExpiresAt" TIMESTAMP(3),
  ADD COLUMN "invitationAcceptedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "organizer_memberships_invitationTokenHash_key" ON "organizer_memberships"("invitationTokenHash");
CREATE UNIQUE INDEX "exhibitor_memberships_invitationTokenHash_key" ON "exhibitor_memberships"("invitationTokenHash");
