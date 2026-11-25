import type { Prisma, Exhibition, ExhibitionStatus, EventModule } from "@prisma/client";

/**
 * ETX-EVENT-001B/001C — the single, shared Exhibition -> Event field mapping.
 *
 * Exhibition remains the operational source of truth. Every writer of an
 * Event row derived from an Exhibition (the 001B backfill, and the 001C
 * create/update linking added to routes/exhibitions.ts) goes through this
 * module so there is exactly one place that can drift, not several —
 * see docs/product/UNIVERSAL_EVENT_FOUNDATION.md's dual-source-of-truth
 * section. The Exhibition -> Event field mapper does not rewrite
 * legacy TicketType or operational rows. The separate ticket-catalog helper
 * below reads TicketType and writes only its EventTicketType mirror; it never
 * rewrites TicketBooking, StallBooking, CheckIn, Lead, Payment, Refund, or
 * PaymentEvent.
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
  // Legacy Exhibition.category is free text, so it may match a platform
  // category that has since been archived. Do not silently reattach that
  // inactive taxonomy entry to the canonical Event: preserve the legacy
  // string on Exhibition, but leave Event.categoryId null until an active
  // category is selected/created by platform policy.
  const existing = await tx.eventCategory.findUnique({
    where: { slug },
    select: { id: true, active: true },
  });
  if (existing) return existing.active ? existing.id : null;

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
    coverImageUrl: exhibition.coverImageUrl,
    refundPolicy: exhibition.refundPolicy,
    terms: exhibition.terms,
  };
}

/**
 * Mirrors one Exhibition-owned TicketType into its paired Event ticket
 * catalog row. Exhibition remains the write source for linked Exhibitions;
 * the nullable unique legacy FK is the explicit mapping used by the later
 * checkout cutover. This does not create reservations, orders, payments,
 * or issued tickets.
 */
export async function syncLegacyTicketTypeToEventTicketType(
  tx: Prisma.TransactionClient,
  eventId: string,
  ticketTypeId: string,
): Promise<boolean> {
  // All linked Exhibition ticket writers and the future Event reservation
  // path serialize on Event first. Re-read the legacy row only after taking
  // that lock so a backfill cannot mirror a stale pre-update snapshot.
  await tx.$queryRaw`SELECT "id" FROM "events" WHERE "id" = ${eventId} FOR UPDATE`;
  const ticketType = await tx.ticketType.findUnique({ where: { id: ticketTypeId } });
  if (!ticketType) return false;

  const sortOrder = await tx.ticketType.count({
    where: {
      exhibitionId: ticketType.exhibitionId,
      OR: [
        { createdAt: { lt: ticketType.createdAt } },
        { createdAt: ticketType.createdAt, id: { lt: ticketType.id } },
      ],
    },
  });

  const mirrored = {
    eventId,
    name: ticketType.name,
    description: null,
    price: ticketType.price,
    currency: "INR",
    capacity: Math.max(0, ticketType.quantity),
    maxPerOrder: ticketType.quantity > 0 ? Math.min(10, ticketType.quantity) : 1,
    maxPerAttendee: null,
    saleStartsAt: null,
    saleEndsAt: null,
    status: ticketType.visible ? "ACTIVE" as const : "INACTIVE" as const,
    sortOrder,
  };

  const existing = await tx.eventTicketType.findUnique({
    where: { legacyTicketTypeId: ticketType.id },
  });
  if (!existing) {
    await tx.eventTicketType.create({
      data: {
        legacyTicketTypeId: ticketType.id,
        createdAt: ticketType.createdAt,
        updatedAt: ticketType.updatedAt,
        ...mirrored,
      },
    });
    return true;
  }

  const changed =
    existing.eventId !== mirrored.eventId ||
    existing.name !== mirrored.name ||
    existing.description !== mirrored.description ||
    Number(existing.price) !== Number(mirrored.price) ||
    existing.currency !== mirrored.currency ||
    existing.capacity !== mirrored.capacity ||
    existing.maxPerOrder !== mirrored.maxPerOrder ||
    existing.maxPerAttendee !== mirrored.maxPerAttendee ||
    existing.saleStartsAt !== mirrored.saleStartsAt ||
    existing.saleEndsAt !== mirrored.saleEndsAt ||
    existing.status !== mirrored.status ||
    existing.sortOrder !== mirrored.sortOrder;

  if (changed) {
    await tx.eventTicketType.update({ where: { id: existing.id }, data: mirrored });
  }
  return true;
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
  const legacyTicketTypes = await tx.ticketType.findMany({
    where: { exhibitionId: exhibition.id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  for (const ticketType of legacyTicketTypes) {
    await syncLegacyTicketTypeToEventTicketType(tx, event.id, ticketType.id);
  }
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
