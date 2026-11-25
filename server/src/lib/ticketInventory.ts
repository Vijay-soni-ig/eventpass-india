import { Prisma } from "@prisma/client";
import { NON_CONSUMING_TICKET_STATUSES } from "./entitlementService";

type TicketInventoryClient = Pick<Prisma.TransactionClient, "$queryRaw">;

export interface TicketInventorySource {
  legacyTicketTypeId?: string | null;
  eventTicketTypeId?: string | null;
}

export interface TicketInventoryUsage {
  legacyBookedQuantity: number;
  activeReservationQuantity: number;
  paidOrderQuantity: number;
  totalConsumedQuantity: number;
}

/**
 * Computes consuming quantity for one canonical Event ticket type and,
 * when mapped, its legacy Exhibition TicketType.
 *
 * Keep every source in one SQL statement. PostgreSQL READ COMMITTED gives
 * each statement its own MVCC snapshot, even inside an interactive
 * transaction. Separate aggregates could therefore straddle the atomic
 * PAYMENT_PENDING/ACTIVE -> PAID/CONVERTED transition: the reservation
 * aggregate could see the converted state while the order aggregate still
 * sees the pre-payment state, under-counting inventory and permitting an
 * oversell. One statement gives all three sums the same snapshot.
 *
 * Legacy TicketBooking semantics intentionally reuse the existing
 * entitlement rule: only failed and fully refunded rows are non-consuming.
 * For Event inventory, an unexpired ACTIVE reservation consumes stock until
 * it is converted; a PAID EventTicketOrder consumes stock after conversion.
 * The relation predicate also de-duplicates a defensive ACTIVE+PAID
 * inconsistency rather than counting that purchase twice. Failed/cancelled/
 * refunded orders and expired/cancelled reservations do not consume stock.
 */
export async function getTicketInventoryUsage(
  client: TicketInventoryClient,
  source: TicketInventorySource,
  now: Date = new Date(),
): Promise<TicketInventoryUsage> {
  const legacyTicketTypeId = source.legacyTicketTypeId ?? null;
  const eventTicketTypeId = source.eventTicketTypeId ?? null;

  const rows = await client.$queryRaw<Array<{
    legacyBookedQuantity: bigint | number;
    activeReservationQuantity: bigint | number;
    paidOrderQuantity: bigint | number;
  }>>`
    SELECT
      COALESCE((
        SELECT SUM(tb."quantity")
        FROM "ticket_bookings" AS tb
        WHERE tb."ticketTypeId" = ${legacyTicketTypeId}
          AND tb."paymentStatus" NOT IN (${Prisma.join([...NON_CONSUMING_TICKET_STATUSES])})
      ), 0)::bigint AS "legacyBookedQuantity",
      COALESCE((
        SELECT SUM(r."quantity")
        FROM "event_ticket_reservations" AS r
        WHERE r."eventTicketTypeId" = ${eventTicketTypeId}
          AND r."status" = 'ACTIVE'
          AND r."expiresAt" > ${now}
          AND NOT EXISTS (
            SELECT 1
            FROM "event_ticket_orders" AS o
            WHERE o."reservationId" = r."id"
              AND o."status" = 'PAID'
          )
      ), 0)::bigint AS "activeReservationQuantity",
      COALESCE((
        SELECT SUM(o."quantity")
        FROM "event_ticket_orders" AS o
        INNER JOIN "event_ticket_reservations" AS r
          ON r."id" = o."reservationId"
        WHERE r."eventTicketTypeId" = ${eventTicketTypeId}
          AND o."status" = 'PAID'
      ), 0)::bigint AS "paidOrderQuantity"
  `;

  const row = rows[0];
  const legacyBookedQuantity = Number(row?.legacyBookedQuantity ?? 0);
  const activeReservationQuantity = Number(row?.activeReservationQuantity ?? 0);
  const paidOrderQuantity = Number(row?.paidOrderQuantity ?? 0);

  return {
    legacyBookedQuantity,
    activeReservationQuantity,
    paidOrderQuantity,
    totalConsumedQuantity: legacyBookedQuantity + activeReservationQuantity + paidOrderQuantity,
  };
}
