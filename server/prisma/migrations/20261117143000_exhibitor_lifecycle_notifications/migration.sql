-- EXH-05A: exhibitor application and stall-payment lifecycle notifications.
-- This slice uses the existing in-app channel; external provider delivery remains separately gated.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EXHIBITOR_APPLICATION_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EXHIBITOR_APPLICATION_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EXHIBITOR_APPLICATION_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'STALL_BOOKING_CONFIRMED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'STALL_PAYMENT_FAILED';
