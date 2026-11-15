ALTER TYPE "ExhibitorMemberStatus" ADD VALUE 'revoked';

ALTER TABLE "exhibitor_memberships"
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "revokedByUserId" TEXT;
