import { prisma } from "./prisma";
import { logAudit } from "./audit";

export interface ReservationExpiryResult {
  expiredCount: number;
  reservationIds: string[];
}

/**
 * Releases expired universal ticket reservations so inventory does not depend
 * on another visitor hitting the same ticket type or opening their reservations
 * page. This is deliberately a small, idempotent batch operation: only ACTIVE
 * reservations whose TTL has elapsed are transitioned.
 */
export async function expireEventTicketReservations(params: {
  now?: Date;
  batchSize?: number;
} = {}): Promise<ReservationExpiryResult> {
  const now = params.now ?? new Date();
  const batchSize = Math.min(Math.max(params.batchSize ?? 500, 1), 5000);

  const candidates = await prisma.eventTicketReservation.findMany({
    where: { status: "ACTIVE", expiresAt: { lte: now } },
    orderBy: { expiresAt: "asc" },
    take: batchSize,
    select: { id: true, eventId: true, eventTicketTypeId: true, userId: true, quantity: true },
  });

  if (candidates.length === 0) return { expiredCount: 0, reservationIds: [] };

  const reservationIds: string[] = [];

  for (const reservation of candidates) {
    const updated = await prisma.eventTicketReservation.updateMany({
      where: { id: reservation.id, status: "ACTIVE", expiresAt: { lte: now } },
      data: { status: "EXPIRED" },
    });
    if (updated.count !== 1) continue;

    reservationIds.push(reservation.id);
    await logAudit({
      actorUserId: null,
      action: "eventTicketReservation.expired",
      entityType: "EventTicketReservation",
      entityId: reservation.id,
      metadata: {
        eventId: reservation.eventId,
        eventTicketTypeId: reservation.eventTicketTypeId,
        userId: reservation.userId,
        quantity: reservation.quantity,
      },
    });
  }

  return {
    expiredCount: reservationIds.length,
    reservationIds,
  };
  return {
    expiredCount: result.count,
    reservationIds: ids.slice(0, result.count),
  };
}
