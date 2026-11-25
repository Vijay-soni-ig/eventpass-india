import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { NON_CONSUMING_TICKET_STATUSES } from "./entitlementService";

type InventoryClient = typeof prisma | Prisma.TransactionClient;

export interface TicketInventoryUsage {
  legacyBookings: number;
  activeReservations: number;
  paidOrders: number;
  consumed: number;
}

const emptyUsage = (): TicketInventoryUsage => ({
  legacyBookings: 0,
  activeReservations: 0,
  paidOrders: 0,
  consumed: 0,
});

/**
 * Aggregates the three mutually exclusive inventory sources for mapped Event
 * ticket types:
 * - legacy bookings still consuming stock under the established status rule;
 * - ACTIVE, unexpired Event reservations (including a pending checkout hold);
 * - PAID Event orders (including partially-refunded orders).
 *
 * A successful Event payment converts its reservation to CONVERTED in the same
 * payment transaction, so the paid order replaces, rather than adds to, that
 * reservation. Failed/cancelled/refunded Event orders do not consume stock;
 * a still-ACTIVE reservation after provider-order initialization failure keeps
 * holding stock until its own expiry.
 */
async function aggregateMappedTicketInventory(
  client: InventoryClient,
  ticketTypes: Array<{ id: string; legacyTicketTypeId: string | null }>,
  now: Date,
  userId?: string,
): Promise<Map<string, TicketInventoryUsage>> {
  const ids = ticketTypes.map((ticket) => ticket.id);
  if (ids.length === 0) return new Map();

  const userFilter = userId ?? null;

  // Keep all three sources in one SQL statement so PostgreSQL evaluates them
  // against one MVCC snapshot. Payment settlement atomically changes an ACTIVE
  // reservation to CONVERTED and its order to PAID; separate aggregate queries
  // could otherwise straddle that commit and under-count or double-count it.
  const rows = await client.$queryRaw<Array<{
    id: string;
    legacyBookings: number;
    activeReservations: number;
    paidOrders: number;
    consumed: number;
  }>>`
    WITH mapped AS (
      SELECT "id", "legacyTicketTypeId"
      FROM "event_ticket_types"
      WHERE "id" IN (${Prisma.join(ids)})
    ),
    usage_rows AS (
      SELECT
        m."id" AS event_ticket_type_id,
        SUM(tb."quantity")::bigint AS legacy_bookings,
        0::bigint AS active_reservations,
        0::bigint AS paid_orders
      FROM mapped m
      JOIN "ticket_bookings" tb ON tb."ticketTypeId" = m."legacyTicketTypeId"
      WHERE m."legacyTicketTypeId" IS NOT NULL
        AND tb."paymentStatus" NOT IN ('failed', 'refunded')
        AND (${userFilter}::text IS NULL OR tb."buyerUserId" = ${userFilter})
      GROUP BY m."id"

      UNION ALL

      SELECT
        r."eventTicketTypeId",
        0::bigint,
        SUM(r."quantity")::bigint,
        0::bigint
      FROM "event_ticket_reservations" r
      LEFT JOIN "event_ticket_orders" o ON o."reservationId" = r."id"
      WHERE r."eventTicketTypeId" IN (${Prisma.join(ids)})
        AND r."status" = 'ACTIVE'
        AND r."expiresAt" > ${now}
        AND (o."id" IS NULL OR o."status" <> 'PAID')
        AND (${userFilter}::text IS NULL OR r."userId" = ${userFilter})
      GROUP BY r."eventTicketTypeId"

      UNION ALL

      SELECT
        r."eventTicketTypeId",
        0::bigint,
        0::bigint,
        SUM(o."quantity")::bigint
      FROM "event_ticket_orders" o
      JOIN "event_ticket_reservations" r ON r."id" = o."reservationId"
      WHERE r."eventTicketTypeId" IN (${Prisma.join(ids)})
        AND o."status" = 'PAID'
        AND (${userFilter}::text IS NULL OR o."userId" = ${userFilter})
      GROUP BY r."eventTicketTypeId"
    )
    SELECT
      m."id",
      COALESCE(SUM(u.legacy_bookings), 0)::int AS "legacyBookings",
      COALESCE(SUM(u.active_reservations), 0)::int AS "activeReservations",
      COALESCE(SUM(u.paid_orders), 0)::int AS "paidOrders",
      (
        COALESCE(SUM(u.legacy_bookings), 0) +
        COALESCE(SUM(u.active_reservations), 0) +
        COALESCE(SUM(u.paid_orders), 0)
      )::int AS consumed
    FROM mapped m
    LEFT JOIN usage_rows u ON u.event_ticket_type_id = m."id"
    GROUP BY m."id"
  `;

  return new Map(rows.map((row) => [row.id, {
    legacyBookings: row.legacyBookings,
    activeReservations: row.activeReservations,
    paidOrders: row.paidOrders,
    consumed: row.consumed,
  }]));
}

/** Inventory usage keyed by canonical EventTicketType id. */
export async function getEventTicketInventoryUsage(
  client: InventoryClient,
  eventTicketTypeIds: string[],
  now = new Date(),
  userId?: string,
): Promise<Map<string, TicketInventoryUsage>> {
  const ids = [...new Set(eventTicketTypeIds)];
  if (ids.length === 0) return new Map();

  const ticketTypes = await client.eventTicketType.findMany({
    where: { id: { in: ids } },
    select: { id: true, legacyTicketTypeId: true },
  });
  return aggregateMappedTicketInventory(client, ticketTypes, now, userId);
}

/**
 * Inventory usage keyed by legacy TicketType id. Unmapped legacy Exhibitions
 * retain their existing booking-only accounting; mapped Exhibitions include
 * both the legacy bookings and any Event reservations/orders for that mirror.
 */
export async function getLegacyTicketInventoryUsage(
  client: InventoryClient,
  legacyTicketTypeIds: string[],
  now = new Date(),
  userId?: string,
): Promise<Map<string, TicketInventoryUsage>> {
  const ids = [...new Set(legacyTicketTypeIds)];
  if (ids.length === 0) return new Map();

  const mirrors = await client.eventTicketType.findMany({
    where: { legacyTicketTypeId: { in: ids } },
    select: { id: true, legacyTicketTypeId: true },
  });
  const mappedUsage = await aggregateMappedTicketInventory(client, mirrors, now, userId);
  const mirrorByLegacyId = new Map(
    mirrors.map((mirror) => [mirror.legacyTicketTypeId!, mirror.id]),
  );
  const unmappedIds = ids.filter((id) => !mirrorByLegacyId.has(id));

  const legacyOnlyBookings = unmappedIds.length
    ? await client.ticketBooking.groupBy({
        by: ["ticketTypeId"],
        where: {
          ticketTypeId: { in: unmappedIds },
          paymentStatus: { notIn: [...NON_CONSUMING_TICKET_STATUSES] },
          ...(userId ? { buyerUserId: userId } : {}),
        },
        _sum: { quantity: true },
      })
    : [];
  const legacyOnlyByTicketType = new Map(
    legacyOnlyBookings.map((row) => [row.ticketTypeId, row._sum.quantity ?? 0]),
  );

  const result = new Map<string, TicketInventoryUsage>();
  for (const id of ids) {
    const mirrorId = mirrorByLegacyId.get(id);
    if (mirrorId) {
      result.set(id, mappedUsage.get(mirrorId) ?? emptyUsage());
    } else {
      const legacyBookings = legacyOnlyByTicketType.get(id) ?? 0;
      result.set(id, {
        legacyBookings,
        activeReservations: 0,
        paidOrders: 0,
        consumed: legacyBookings,
      });
    }
  }
  return result;
}

export class InsufficientTicketInventoryError extends Error {
  constructor(public readonly remaining: number) {
    super(
      remaining > 0
        ? `Only ${remaining} ticket(s) remaining for this ticket type`
        : "This ticket type is sold out",
    );
    this.name = "InsufficientTicketInventoryError";
  }
}

/**
 * Claims the same parent Event lock used by Event reservations before
 * locking the mapped EventTicketType and legacy TicketType rows. The Event
 * lock serializes legacy bookings against Event reservation writes and
 * catalog-mirror updates, then the fresh aggregate is checked in the same
 * transaction as the caller's TicketBooking insert.
 */
export async function assertLegacyTicketInventoryAvailable(
  tx: Prisma.TransactionClient,
  ticketTypeId: string,
  quantityRequested: number,
): Promise<number> {
  const snapshot = await tx.ticketType.findUnique({
    where: { id: ticketTypeId },
    select: { id: true, exhibition: { select: { eventId: true } } },
  });
  if (!snapshot) throw new InsufficientTicketInventoryError(0);

  const eventId = snapshot.exhibition.eventId;
  if (eventId) {
    const eventLocked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "events" WHERE "id" = ${eventId} FOR UPDATE
    `;
    if (eventLocked.length === 0) throw new Error("TICKET_EVENT_NOT_FOUND");
  }

  const mirror = await tx.eventTicketType.findUnique({
    where: { legacyTicketTypeId: ticketTypeId },
    select: { id: true, eventId: true },
  });
  if (mirror) {
    if (!eventId || mirror.eventId !== eventId) {
      throw new Error("TICKET_MAPPING_MISMATCH");
    }
    const mirrorLocked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "event_ticket_types"
      WHERE "id" = ${mirror.id} AND "eventId" = ${eventId}
      FOR UPDATE
    `;
    if (mirrorLocked.length === 0) throw new Error("TICKET_MAPPING_MISMATCH");
  }

  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "ticket_types" WHERE "id" = ${ticketTypeId} FOR UPDATE
  `;
  if (locked.length === 0) throw new InsufficientTicketInventoryError(0);

  const current = await tx.ticketType.findUnique({
    where: { id: ticketTypeId },
    select: { quantity: true, exhibition: { select: { eventId: true } } },
  });
  if (!current || current.exhibition.eventId !== eventId) {
    throw new Error("TICKET_MAPPING_MISMATCH");
  }

  const usage = await getLegacyTicketInventoryUsage(tx, [ticketTypeId], new Date());
  const consumed = usage.get(ticketTypeId)?.consumed ?? 0;
  const remaining = current.quantity - consumed;
  if (quantityRequested > remaining) {
    throw new InsufficientTicketInventoryError(remaining);
  }
  return remaining;
}
