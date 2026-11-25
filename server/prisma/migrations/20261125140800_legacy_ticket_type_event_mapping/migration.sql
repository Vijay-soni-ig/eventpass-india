-- The current application intentionally disallows EventTicketType creation
-- for linked Exhibitions. If pre-existing rows are found anyway, stop rather
-- than silently create duplicate ticket names or guess a mapping by name.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM "event_ticket_types" ett
      JOIN "exhibitions" e ON e."eventId" = ett."eventId"
  ) THEN
    RAISE EXCEPTION
      'Cannot backfill legacy TicketType mappings: EventTicketType rows already exist for linked Exhibitions; reconcile them explicitly first';
  END IF;
END $$;

-- ETX-EVENT-931A — explicit, additive bridge from legacy Exhibition TicketType
-- to the canonical EventTicketType catalog. Existing TicketBooking, Payment,
-- CheckIn, and QR rows are not rewritten by this migration.
ALTER TABLE "event_ticket_types"
  ADD COLUMN "legacyTicketTypeId" TEXT;

CREATE UNIQUE INDEX "event_ticket_types_legacyTicketTypeId_key"
  ON "event_ticket_types"("legacyTicketTypeId");

ALTER TABLE "event_ticket_types"
  ADD CONSTRAINT "event_ticket_types_legacyTicketTypeId_fkey"
  FOREIGN KEY ("legacyTicketTypeId") REFERENCES "ticket_types"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Stable UUID v3-shaped IDs derived from the legacy TicketType id make this
-- additive backfill deterministic and safe to retry. The unique legacy FK
-- is the actual idempotency key.
WITH legacy_ticket_types AS (
  SELECT
    tt."id" AS "legacyTicketTypeId",
    e."eventId" AS "eventId",
    tt."name" AS "name",
    tt."price" AS "price",
    tt."quantity" AS "capacity",
    tt."visible" AS "visible",
    tt."createdAt" AS "createdAt",
    tt."updatedAt" AS "updatedAt",
    md5('event-ticket-type:' || tt."id") AS "stableHash",
    ROW_NUMBER() OVER (
      PARTITION BY e."eventId"
      ORDER BY tt."createdAt" ASC, tt."id" ASC
    ) - 1 AS "sortOrder"
  FROM "ticket_types" tt
  JOIN "exhibitions" e ON e."id" = tt."exhibitionId"
  WHERE e."eventId" IS NOT NULL
)
INSERT INTO "event_ticket_types" (
  "id",
  "eventId",
  "legacyTicketTypeId",
  "name",
  "description",
  "price",
  "currency",
  "capacity",
  "maxPerOrder",
  "maxPerAttendee",
  "saleStartsAt",
  "saleEndsAt",
  "status",
  "sortOrder",
  "createdAt",
  "updatedAt"
)
SELECT
  substr("stableHash", 1, 8) || '-' ||
  substr("stableHash", 9, 4) || '-3' ||
  substr("stableHash", 14, 3) || '-a' ||
  substr("stableHash", 18, 3) || '-' ||
  substr("stableHash", 21, 12),
  "eventId",
  "legacyTicketTypeId",
  "name",
  NULL,
  "price",
  'INR',
  GREATEST(0, "capacity"),
  CASE WHEN "capacity" > 0 THEN LEAST(10, "capacity") ELSE 1 END,
  NULL,
  NULL,
  NULL,
  CASE WHEN "visible" THEN 'ACTIVE'::"EventTicketTypeStatus" ELSE 'INACTIVE'::"EventTicketTypeStatus" END,
  "sortOrder"::INTEGER,
  "createdAt",
  "updatedAt"
FROM legacy_ticket_types
ON CONFLICT ("legacyTicketTypeId") DO NOTHING;
