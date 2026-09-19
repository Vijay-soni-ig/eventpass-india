import { prisma } from "./prisma";
import {
  EVENT_STATUS_FROM_EXHIBITION_STATUS,
  resolveCategoryIdFromName,
  mirroredEventFieldsFromExhibition,
  DEFAULT_EXHIBITION_MODULES,
  slugifyCategoryName,
} from "./eventMapping";

export { slugifyCategoryName };

/**
 * ETX-EVENT-001B — one-off backfill for Exhibitions that predate ETX-EVENT-001C's
 * live create/update linking (server/src/lib/eventMapping.ts). Exhibition
 * remains the operational source of truth. Never touches TicketType, Stall,
 * FloorPlan, FloorPlanObject, TicketBooking, StallBooking,
 * ExhibitionExhibitor, CheckIn, Lead, Payment, Refund, or PaymentEvent.
 */

export interface EventBackfillResult {
  /** Exhibitions found with no Event link at the start of this run. */
  pending: number;
  /** Exhibitions newly linked to a freshly created Event by this run. */
  linked: number;
  /** Exhibitions that already had a link before this run started. */
  alreadyLinked: number;
}

/**
 * Idempotently creates exactly one Event per Exhibition that doesn't already
 * have one, and points Exhibition.eventId at it.
 *
 * Safe to run any number of times:
 *  - An Exhibition with a non-null eventId is never revisited (the pending
 *    query excludes it).
 *  - Event creation + the Exhibition.eventId update happen inside a single
 *    transaction per exhibition, so an interrupted run never leaves an
 *    orphaned Event with no Exhibition pointing at it — the transaction
 *    either fully commits (Event created AND linked) or fully rolls back
 *    (nothing created), and the next run picks the exhibition back up from
 *    the pending query.
 *  - A second check inside the transaction guards the (currently
 *    theoretical, since callers run this serially) case of two concurrent
 *    runs racing on the same exhibition.
 *
 * As of ETX-EVENT-001C, new Exhibitions are linked at creation time (see
 * routes/exhibitions.ts + eventMapping.ts) — this function now only matters
 * for Exhibitions that existed before that change shipped. Does not cut over
 * any read or write path to Event — Exhibition rows, columns, and every
 * dependent table are untouched.
 */
export async function backfillEvents(): Promise<EventBackfillResult> {
  const pending = await prisma.exhibition.findMany({ where: { eventId: null } });
  let linked = 0;

  for (const exhibition of pending) {
    await prisma.$transaction(async (tx) => {
      const current = await tx.exhibition.findUnique({ where: { id: exhibition.id }, select: { eventId: true } });
      if (current?.eventId) return;

      const categoryId = await resolveCategoryIdFromName(tx, exhibition.category);
      const event = await tx.event.create({
        data: { ...mirroredEventFieldsFromExhibition(exhibition, categoryId), eventType: "EXHIBITION" },
      });
      await tx.eventModuleEnablement.createMany({
        data: DEFAULT_EXHIBITION_MODULES.map((moduleType) => ({ eventId: event.id, moduleType })),
      });
      await tx.exhibition.update({ where: { id: exhibition.id }, data: { eventId: event.id } });
      linked += 1;
    });
  }

  const alreadyLinked = pending.length - linked;
  return { pending: pending.length, linked, alreadyLinked };
}

export interface EventBackfillMismatch {
  exhibitionId: string;
  field: string;
  exhibitionValue: unknown;
  eventValue: unknown;
}

/**
 * Verifies the backfill invariant for every currently-linked Exhibition:
 * exactly one Event, with every mapped field matching, and the correct
 * organizer/owner. Returns an empty array when everything is consistent.
 * Read-only — never mutates anything.
 */
export async function verifyEventBackfillInvariants(): Promise<EventBackfillMismatch[]> {
  const exhibitions = await prisma.exhibition.findMany({
    where: { NOT: { eventId: null } },
    include: { event: { include: { category: true } } },
  });

  const mismatches: EventBackfillMismatch[] = [];
  const push = (exhibitionId: string, field: string, exhibitionValue: unknown, eventValue: unknown) => {
    mismatches.push({ exhibitionId, field, exhibitionValue, eventValue });
  };

  for (const exhibition of exhibitions) {
    const event = exhibition.event;
    if (!event) {
      push(exhibition.id, "event", exhibition.eventId, null);
      continue;
    }
    if (event.title !== exhibition.name) push(exhibition.id, "title/name", exhibition.name, event.title);
    if (event.description !== exhibition.description) push(exhibition.id, "description", exhibition.description, event.description);
    if (event.organizerId !== exhibition.organizerId) push(exhibition.id, "organizerId", exhibition.organizerId, event.organizerId);
    if (event.ownerId !== exhibition.ownerId) push(exhibition.id, "ownerId", exhibition.ownerId, event.ownerId);
    if (event.status !== EVENT_STATUS_FROM_EXHIBITION_STATUS[exhibition.status]) push(exhibition.id, "status", exhibition.status, event.status);
    if (event.visibility !== exhibition.visibility) push(exhibition.id, "visibility", exhibition.visibility, event.visibility);
    if (event.venue !== exhibition.venue) push(exhibition.id, "venue", exhibition.venue, event.venue);
    if (event.city !== exhibition.city) push(exhibition.id, "city", exhibition.city, event.city);
    if (event.latitude !== exhibition.latitude) push(exhibition.id, "latitude", exhibition.latitude, event.latitude);
    if (event.longitude !== exhibition.longitude) push(exhibition.id, "longitude", exhibition.longitude, event.longitude);
    if (event.coverImageUrl !== exhibition.coverImageUrl) push(exhibition.id, "coverImageUrl", exhibition.coverImageUrl, event.coverImageUrl);
    if (event.refundPolicy !== exhibition.refundPolicy) push(exhibition.id, "refundPolicy", exhibition.refundPolicy, event.refundPolicy);
    if (event.terms !== exhibition.terms) push(exhibition.id, "terms", exhibition.terms, event.terms);
    if (event.startDate?.getTime() !== exhibition.startDate?.getTime()) push(exhibition.id, "startDate", exhibition.startDate, event.startDate);
    if (event.endDate?.getTime() !== exhibition.endDate?.getTime()) push(exhibition.id, "endDate", exhibition.endDate, event.endDate);
    if (event.eventType !== "EXHIBITION") push(exhibition.id, "eventType", "EXHIBITION", event.eventType);

    const expectedCategoryName = exhibition.category?.trim() || null;
    const actualCategoryName = event.category?.name ?? null;
    if (expectedCategoryName !== actualCategoryName) push(exhibition.id, "category", expectedCategoryName, actualCategoryName);
  }

  return mismatches;
}
