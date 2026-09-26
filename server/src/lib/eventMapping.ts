import type { Prisma, Exhibition, ExhibitionStatus, EventModule } from "@prisma/client";

/**
 * ETX-EVENT-001B/001C — the single, shared Exhibition -> Event field mapping.
 *
 * Exhibition remains the operational source of truth. Every writer of an
 * Event row derived from an Exhibition (the 001B backfill, and the 001C
 * create/update linking added to routes/exhibitions.ts) goes through this
 * module so there is exactly one place that can drift, not several —
 * see docs/product/UNIVERSAL_EVENT_FOUNDATION.md's dual-source-of-truth
 * section. Never touches TicketType, Stall, FloorPlan, FloorPlanObject,
 * TicketBooking, StallBooking, ExhibitionExhibitor, CheckIn, Lead, Payment,
 * Refund, or PaymentEvent.
 */
export const EVENT_STATUS_FROM_EXHIBITION_STATUS: Record<ExhibitionStatus, "DRAFT" | "PUBLISHED" | "PAUSED" | "COMPLETED"> = {
  draft: "DRAFT",
  live: "PUBLISHED",
  paused: "PAUSED",
  completed: "COMPLETED",
};

/**
 * The default module bundle every EXHIBITION-typed Event is enabled with at
 * creation time — matches today's actual Exhibition feature set. Never
 * required to be enabled manually by the organizer.
 */
export const DEFAULT_EXHIBITION_MODULES: EventModule[] = [
  "EXHIBITION",
  "TICKETING",
  "EXHIBITORS",
  "STALL_BOOKING",
  "FLOOR_PLAN",
  "LEADS",
  "CHECK_IN",
  "ANALYTICS",
];

/**
 * Exhibition.category is free-text. Event.categoryId is a real FK to
 * EventCategory. Rather than inventing a taxonomy or a manual mapping table,
 * every category string is deterministically slugified and upserted by that
 * slug — the same input always resolves to the same category row, so this
 * is safe to call repeatedly (backfill reruns, every Exhibition update) and
 * never fabricates a category for a null/empty value.
 */
export function slugifyCategoryName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function resolveCategoryIdFromName(tx: Prisma.TransactionClient, rawCategory: string | null): Promise<string | null> {
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

/** The mirrored-field subset of Event, derived from an Exhibition row + a resolved categoryId. */
export function mirroredEventFieldsFromExhibition(exhibition: Exhibition, categoryId: string | null) {
  return {
    organizerId: exhibition.organizerId,
    ownerId: exhibition.ownerId,
    title: exhibition.name,
    description: exhibition.description,
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
  };
}

/**
 * Called once, inside the SAME transaction as `tx.exhibition.create(...)`,
 * immediately after it. Creates the paired Event (eventType EXHIBITION),
 * enables the default Exhibition module bundle, and points
 * `exhibition.eventId` at the new row — all in the caller's transaction, so
 * "Exhibition created" and "Event exists and is linked" commit or roll back
 * together. There is no code path that creates an Exhibition without this
 * running in the same transaction, so a newly created Exhibition can never
 * be left with eventId = null (unlike the 001B backfill, which exists only
 * to close that gap for exhibitions that predate this).
 */
export async function linkNewEventToExhibition(tx: Prisma.TransactionClient, exhibition: Exhibition, venueId?: string | null): Promise<void> {
  const categoryId = await resolveCategoryIdFromName(tx, exhibition.category);
  const event = await tx.event.create({
    data: { ...mirroredEventFieldsFromExhibition(exhibition, categoryId), venueId: venueId ?? null, eventType: "EXHIBITION" },
  });
  await tx.eventModuleEnablement.createMany({
    data: DEFAULT_EXHIBITION_MODULES.map((moduleType) => ({ eventId: event.id, moduleType })),
  });
  await tx.exhibition.update({ where: { id: exhibition.id }, data: { eventId: event.id } });
}

/**
 * Called inside the SAME transaction as `tx.exhibition.update(...)`. A
 * no-op unless the Exhibition already has a linked Event (true for every
 * Exhibition created after this ticket, and for every pre-existing one
 * once the 001B backfill has run). Never creates an Event and never
 * changes which Event an Exhibition is linked to — only mirrors fields
 * onto the existing link.
 */
export async function syncLinkedEventFields(tx: Prisma.TransactionClient, exhibition: Exhibition): Promise<void> {
  if (!exhibition.eventId) return;
  const categoryId = await resolveCategoryIdFromName(tx, exhibition.category);
  await tx.event.update({
    where: { id: exhibition.eventId },
    data: mirroredEventFieldsFromExhibition(exhibition, categoryId),
  });
}
