-- Registration lifecycle notifications extend the existing notification enum.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REGISTRATION_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REGISTRATION_CONFIRMED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REGISTRATION_CANCELLED';
