import type { Prisma } from "@prisma/client";
import { NON_CONSUMING_TICKET_STATUSES } from "./entitlementService";

type TicketInventoryClient = Pick<
  Prisma.TransactionClient,
  "ticketBooking" | "eventTicketReservation" | "eventTicketOrder"
>;

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

  const [legacyBookings, activeReservations, paidOrders] = await Promise.all([
    legacyTicketTypeId
      ? client.ticketBooking.aggregate({
          where: {
            ticketTypeId: legacyTicketTypeId,
            paymentStatus: { notIn: [...NON_CONSUMING_TICKET_STATUSES] },
          },
          _sum: { quantity: true },
        })
      : Promise.resolve(null),
    eventTicketTypeId
      ? client.eventTicketReservation.aggregate({
          where: {
            eventTicketTypeId,
            status: "ACTIVE",
            expiresAt: { gt: now },
            OR: [
              { order: { is: null } },
              { order: { is: { status: { not: "PAID" } } } },
            ],
          },
          _sum: { quantity: true },
        })
      : Promise.resolve(null),
    eventTicketTypeId
      ? client.eventTicketOrder.aggregate({
          where: {
            status: "PAID",
            reservation: { eventTicketTypeId },
          },
          _sum: { quantity: true },
        })
      : Promise.resolve(null),
  ]);

  const legacyBookedQuantity = legacyBookings?._sum.quantity ?? 0;
  const activeReservationQuantity = activeReservations?._sum.quantity ?? 0;
  const paidOrderQuantity = paidOrders?._sum.quantity ?? 0;

  return {
    legacyBookedQuantity,
    activeReservationQuantity,
    paidOrderQuantity,
    totalConsumedQuantity: legacyBookedQuantity + activeReservationQuantity + paidOrderQuantity,
  };
}
