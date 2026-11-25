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
  const result = new Map(ticketTypes.map((ticket) => [ticket.id, emptyUsage()]));
  if (ticketTypes.length === 0) return result;

  const eventTicketTypeIds = ticketTypes.map((ticket) => ticket.id);
  const legacyTicketTypeIds = ticketTypes
    .map((ticket) => ticket.legacyTicketTypeId)
    .filter((id): id is string => Boolean(id));

  const legacyBookings = legacyTicketTypeIds.length
    ? await client.ticketBooking.groupBy({
        by: ["ticketTypeId"],
        where: {
          ticketTypeId: { in: legacyTicketTypeIds },
          paymentStatus: { notIn: [...NON_CONSUMING_TICKET_STATUSES] },
          ...(userId ? { buyerUserId: userId } : {}),
        },
        _sum: { quantity: true },
      })
    : [];

  const activeReservations = await client.eventTicketReservation.groupBy({
    by: ["eventTicketTypeId"],
    where: {
      eventTicketTypeId: { in: eventTicketTypeIds },
      status: "ACTIVE",
      expiresAt: { gt: now },
      ...(userId ? { userId } : {}),
    },
    _sum: { quantity: true },
  });

  const paidOrders = await client.eventTicketOrder.findMany({
    where: {
      status: "PAID",
      reservation: { eventTicketTypeId: { in: eventTicketTypeIds } },
      ...(userId ? { userId } : {}),
    },
    select: {
      quantity: true,
      reservation: { select: { eventTicketTypeId: true } },
    },
  });

  const legacyByTicketType = new Map(
    legacyBookings.map((row) => [row.ticketTypeId, row._sum.quantity ?? 0]),
  );
  const reservationsByTicketType = new Map(
    activeReservations.map((row) => [row.eventTicketTypeId, row._sum.quantity ?? 0]),
  );

  for (const ticket of ticketTypes) {
    const usage = result.get(ticket.id)!;
    usage.legacyBookings = ticket.legacyTicketTypeId
      ? legacyByTicketType.get(ticket.legacyTicketTypeId) ?? 0
      : 0;
    usage.activeReservations = reservationsByTicketType.get(ticket.id) ?? 0;
  }

  for (const order of paidOrders) {
    const usage = result.get(order.reservation.eventTicketTypeId);
    if (usage) usage.paidOrders += order.quantity;
  }

  for (const usage of result.values()) {
    usage.consumed = usage.legacyBookings + usage.activeReservations + usage.paidOrders;
  }

  return result;
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
