-- 001F Universal Event Categories/Modules
-- The EventCategory and EventModuleEnablement tables were introduced by
-- 001A. This migration only expands the module enum for the production
-- 001F contract; existing rows remain valid and existing Exhibition events
-- retain their current enablements.
ALTER TYPE "EventModule" ADD VALUE IF NOT EXISTS 'EXHIBITION';
ALTER TYPE "EventModule" ADD VALUE IF NOT EXISTS 'PARTNERS';

-- Backfill the compatibility bundle for every already-linked Exhibition Event.
-- ON CONFLICT keeps the migration idempotent and preserves any explicit
-- enablement/configuration already present.
INSERT INTO "event_module_enablements" ("id", "eventId", "moduleType", "enabled", "createdAt", "updatedAt")
SELECT gen_random_uuid(), e."id", modules."moduleType"::"EventModule", true, NOW(), NOW()
FROM "events" e
JOIN "exhibitions" ex ON ex."eventId" = e."id"
CROSS JOIN (
  VALUES
    ('EXHIBITION'),
    ('TICKETING'),
    ('EXHIBITORS'),
    ('STALL_BOOKING'),
    ('FLOOR_PLAN'),
    ('LEADS'),
    ('CHECK_IN'),
    ('ANALYTICS')
) AS modules("moduleType")
ON CONFLICT ("eventId", "moduleType") DO NOTHING;
