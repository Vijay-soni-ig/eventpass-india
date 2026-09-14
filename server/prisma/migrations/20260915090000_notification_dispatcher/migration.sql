-- FP-06: notification dispatcher. Adds STALL_RESERVATION_EXPIRED so the
-- dispatcher's IN_APP channel can write into the existing notifications
-- table/UI. Follows this repo's established enum-change pattern (create new
-- type, migrate the column, rename, drop old) rather than ALTER TYPE ADD
-- VALUE, which cannot run inside the same transaction the value is used in.

CREATE TYPE "NotificationType_new" AS ENUM (
    'EVENT_PUBLISHED',
    'EVENT_UPDATED',
    'EVENT_DATE_CHANGED',
    'EVENT_TICKETS_AVAILABLE',
    'ORGANIZER_PROFILE_UPDATED',
    'STALL_RESERVATION_EXPIRED'
);

ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");

ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
DROP TYPE "NotificationType_old";
