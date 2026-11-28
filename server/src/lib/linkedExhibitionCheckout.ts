import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** Both cutover flags are explicit opt-ins; unset or anything but "true" is off. */
export function linkedExhibitionCheckoutFlagsEnabled(): boolean {
  return (
    process.env.LINKED_EXHIBITION_EVENT_RESERVATIONS_ENABLED === "true" &&
    process.env.LINKED_EXHIBITION_EVENT_CHECKOUT_ENABLED === "true"
  );
}

/**
 * True when new ticket purchases for this Exhibition must use the Universal
 * Event lifecycle instead of the legacy TicketBooking flow.
 *
 * This is the server-side twin of the public `linkedEventCheckoutEnabled`
 * field in routes/public.ts and must stay in step with it: both flags on, a
 * published public EXHIBITION Event linked back to a live public Exhibition
 * with TICKETING enabled, and every visible legacy ticket type mapped into the
 * Event catalog. With the flags off (the default) no query is made.
 */
export async function linkedExhibitionCheckoutActive(db: Db, exhibitionId: string): Promise<{ active: false } | { active: true; eventId: string }> {
  if (!linkedExhibitionCheckoutFlagsEnabled()) return { active: false };

  const exhibition = await db.exhibition.findUnique({
    where: { id: exhibitionId },
    select: {
      id: true,
      eventId: true,
      status: true,
      visibility: true,
      ticketTypes: { where: { visible: true }, select: { id: true } },
    },
  });
  if (!exhibition?.eventId || exhibition.status !== "live" || exhibition.visibility !== "public") return { active: false };

  const event = await db.event.findFirst({
    where: { id: exhibition.eventId, exhibition: { id: exhibition.id } },
    select: {
      id: true,
      eventType: true,
      status: true,
      visibility: true,
      archivedAt: true,
      moduleEnablements: { where: { moduleType: "TICKETING", enabled: true }, select: { id: true } },
    },
  });
  if (
    !event ||
    event.eventType !== "EXHIBITION" ||
    event.status !== "PUBLISHED" ||
    event.visibility !== "public" ||
    event.archivedAt !== null ||
    event.moduleEnablements.length === 0
  ) {
    return { active: false };
  }

  const legacyIds = exhibition.ticketTypes.map((ticket) => ticket.id);
  if (legacyIds.length === 0) return { active: false };
  const mapped = await db.eventTicketType.count({ where: { eventId: event.id, legacyTicketTypeId: { in: legacyIds } } });
  if (mapped !== legacyIds.length) return { active: false };

  return { active: true, eventId: event.id };
}
