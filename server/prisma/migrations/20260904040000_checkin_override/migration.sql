-- Additive: new nullable-by-default column, no existing data affected.
ALTER TABLE "check_ins" ADD COLUMN "isOverride" BOOLEAN NOT NULL DEFAULT false;
