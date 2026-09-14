-- FP-06: fix a real correctness bug found while building the notification
-- dispatcher. notification_intents/notification_deliveries were created with
-- bare TIMESTAMP (no time zone) columns. On any Postgres session whose
-- configured time zone isn't UTC, this breaks in two ways:
--   1. Binding a JS Date directly as a raw SQL parameter into a TIMESTAMP
--      column gets serialized through the session's time zone, storing a
--      value offset from the intended instant.
--   2. Comparing a stored TIMESTAMP value against NOW() (or NOW() - INTERVAL
--      ...) is *also* wrong even for a correctly-stored value: NOW() returns
--      TIMESTAMPTZ, and Postgres's implicit cast to TIMESTAMP for the
--      comparison ALSO applies the session time zone — so a value stored via
--      an explicit UTC-literal cast (avoiding bug #1) still compares
--      incorrectly against NOW(), since the two sides end up on different
--      time-zone bases. This is what made a brand-new 0-millisecond-old lock
--      register as "more than 5 minutes stale," letting a concurrent claim
--      immediately reclaim a row another worker had just claimed —
--      reproduced deterministically via
--      server/tests/phase31_notificationDispatcher.test.ts.
-- TIMESTAMPTZ always represents an absolute instant regardless of session
-- time zone, which is the correct type for every column here — none of them
-- are "wall clock in some particular zone" values.
ALTER TABLE "notification_intents"
  ALTER COLUMN "available_at" TYPE TIMESTAMPTZ,
  ALTER COLUMN "locked_at" TYPE TIMESTAMPTZ,
  ALTER COLUMN "completed_at" TYPE TIMESTAMPTZ,
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ,
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ;

ALTER TABLE "notification_deliveries"
  ALTER COLUMN "available_at" TYPE TIMESTAMPTZ,
  ALTER COLUMN "locked_at" TYPE TIMESTAMPTZ,
  ALTER COLUMN "sent_at" TYPE TIMESTAMPTZ,
  ALTER COLUMN "delivered_at" TYPE TIMESTAMPTZ,
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ,
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ;

ALTER TABLE "notification_channel_preferences"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ,
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ;
