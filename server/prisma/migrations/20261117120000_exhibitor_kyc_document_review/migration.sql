CREATE TYPE "ExhibitorKycStatus" AS ENUM ('pending', 'submitted', 'under_review', 'verified', 'resubmission_required');
CREATE TYPE "DocumentCategory" AS ENUM ('gst_certificate', 'pan_card', 'identity_proof', 'authorization_letter', 'bank_proof', 'general');
CREATE TYPE "DocumentReviewStatus" AS ENUM ('not_required', 'not_submitted', 'pending_review', 'approved', 'rejected');

ALTER TABLE "exhibitor_businesses"
  ADD COLUMN "kycWorkflowStatus" "ExhibitorKycStatus" NOT NULL DEFAULT 'pending';

ALTER TABLE "documents"
  ADD COLUMN "category" "DocumentCategory" NOT NULL DEFAULT 'general',
  ADD COLUMN "reviewStatus" "DocumentReviewStatus" NOT NULL DEFAULT 'not_required',
  ADD COLUMN "reviewedByUserId" TEXT,
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedAt" TIMESTAMP(3);

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_reviewedByUserId_fkey"
  FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "documents_exhibitorBusinessId_reviewStatus_archivedAt_idx"
  ON "documents"("exhibitorBusinessId", "reviewStatus", "archivedAt");

CREATE INDEX "exhibitor_businesses_kycWorkflowStatus_idx"
  ON "exhibitor_businesses"("kycWorkflowStatus");
