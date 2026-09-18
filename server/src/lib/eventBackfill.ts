import type { Prisma, ExhibitionStatus } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * ETX-EVENT-001B — deterministic Exhibition → Event field mapping.
 *
 * Exhibition remains the operational source of truth. This backfill only
 * ever *creates* Event rows and *sets* Exhibition.eventId — it never reads
 * back from Event to influence Exhibition, and it never touches TicketType,
 * Stall, FloorPlan, FloorPlanObject, TicketBooking, StallBooking,
 * ExhibitionExhibitor, CheckIn, Lead, Payment, Refund, or PaymentEvent.
 */
const EVENT_STATUS_FROM_EXHIBITION_STATUS: Record<ExhibitionStatus, "DRAFT" | "PUBLISHED" | "PAUSED" | "COMPLETED"> = {
  draft: "DRAFT",
  live: "PUBLISHED",
  paused: "PAUSED",
  completed: "COMPLETED",
};

/**
 * Exhibition.category is free-text (verified against the current dataset:
 * "Technology", "Fashion", "Food & Lifestyle", "Healthcare", "Education",
 * and null — no two values collide once slugified). Event.categoryId is a
 * real FK to EventCategory. Rather than inventing a taxonomy or a manual
 * mapping table, this backfill performs a deterministic, lossless transform
 * of each existing string into a category: slugify it, then upsert an
 * EventCategory by that slug. Same input always produces the same slug,
 * so re-running never creates a duplicate category, and no category is
 * fabricated that doesn't already exist as literal Exhibition data.
 */
export function slugifyCategoryName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function resolveCategoryId(tx: Prisma.TransactionClient, rawCategory: string | null): Promise<string | null> {
  const trimmed = rawCategory?.trim();
  if (!trimmed) return null;
  const slug = slugifyCategoryName(trimmed);
  if (!slug) return null;
  const category = await tx.eventCategory.upsert({
    where: { slug },
    update: {},
    create: { name: trimmed, slug, active: true, sortOrder: 0 },
  });
  return category.id;
}

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
 * Does not cut over any read or write path to Event — Exhibition rows,
 * columns, and every dependent table are untouched.
 */
export async function backfillEvents(): Promise<EventBackfillResult> {
  const pending = await prisma.exhibition.findMany({ where: { eventId: null } });
  let linked = 0;

  for (const exhibition of pending) {
    await prisma.$transaction(async (tx) => {
      const current = await tx.exhibition.findUnique({ where: { id: exhibition.id }, select: { eventId: true } });
      if (current?.eventId) return;

      const categoryId = await resolveCategoryId(tx, exhibition.category);
      const event = await tx.event.create({
        data: {
          organizerId: exhibition.organizerId,
          ownerId: exhibition.ownerId,
          title: exhibition.name,
          description: exhibition.description,
          eventType: "EXHIBITION",
          categoryId,
          status: EVENT_STATUS_FROM_EXHIBITION_STATUS[exhibition.status],
          visibility: exhibition.visibility,
          startDate: exhibition.startDate,
          endDate: exhibition.endDate,
          venue: exhibition.venue,
          city: exhibition.city,
          latitude: exhibition.latitude,
          longitude: exhibition.longitude,
          coverImageUrl: exhibition.coverImageUrl,
          refundPolicy: exhibition.refundPolicy,
          terms: exhibition.terms,
        },
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
