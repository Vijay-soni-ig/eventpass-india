import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { NON_CONSUMING_TICKET_STATUSES } from "../lib/entitlementService";
import { publicReadRateLimit, publicSearchRateLimit } from "../middleware/rateLimit";
import { getPublishedFloorPlan } from "../lib/floorPlanQueries";
import { releaseExpiredReservations } from "../lib/stallReservationExpiry";

const router = Router();

// Phase 22.5 — this endpoint is INTENTIONALLY kept narrow, not consolidated
// into GET /discover: its only remaining consumer is the homepage's small
// teaser sections (src/pages/Index.tsx, which slices the result to its top
// 4-6 items and does its own trivial category-tab filter on that already-
// small set). It takes no query parameters and has no filtering/sorting/
// pagination logic of its own to duplicate — "one discovery engine" refers
// to eliminating ExhibitionListing.tsx's client-side search/filter/sort
// (now migrated to GET /discover, see below), not to merging every fixed
// list query in the app into the paginated search contract. If a future
// consumer needs search/filter/pagination here, it should call GET
// /discover instead of this endpoint growing new parameters.
router.get("/exhibitions", publicReadRateLimit, async (_req, res) => {
  // 001E-7 final public legacy-read audit: Event is canonical for the
  // homepage's universal identity/lifecycle fields. The linked Exhibition
  // remains only as the compatibility payload because Index.tsx and
  // ExhibitionCard still consume the legacy Exhibition contract.
  const events = await prisma.event.findMany({
    where: {
      status: "PUBLISHED",
      visibility: "public",
      archivedAt: null,
      exhibition: { status: "live", visibility: "public" },
    },
    select: {
      id: true,
      title: true,
      description: true,
      venue: true,
      city: true,
      latitude: true,
      longitude: true,
      startDate: true,
      endDate: true,
      coverImageUrl: true,
      createdAt: true,
      organizer: { select: { id: true, name: true, slug: true, logoUrl: true, kycStatus: true } },
      category: { select: { id: true, name: true, slug: true } },
      exhibition: {
        select: {
          id: true,
          ownerId: true,
          name: true,
          category: true,
          description: true,
          venue: true,
          city: true,
          latitude: true,
          longitude: true,
          startDate: true,
          endDate: true,
          coverImageUrl: true,
          floorPlanUrl: true,
          status: true,
          visibility: true,
          refundPolicy: true,
          terms: true,
          createdAt: true,
          updatedAt: true,
          ticketTypes: { where: { visible: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const exhibitions = events
    .filter((event): event is typeof event & { exhibition: NonNullable<typeof event.exhibition> } => Boolean(event.exhibition))
    .map((event) => ({
      ...event.exhibition,
      category: event.category,
      // Event is the source of truth for universal fields; preserve the
      // Exhibition response shape only for the legacy homepage consumer.
      name: event.title,
      description: event.description,
      venue: event.venue,
      city: event.city,
      latitude: event.latitude,
      longitude: event.longitude,
      startDate: event.startDate,
      endDate: event.endDate,
      coverImageUrl: event.coverImageUrl,
      organizer: event.organizer,
      eventId: event.id,
    }));

  res.json({ exhibitions });
});

// Phase 21C (P2-3): the frontend's "Sold Out" state must reflect actual
// remaining stock (quantity - still-consuming bookings), never the raw
// total allotment — see routes/bookings.ts's assertTicketTypeHasStock for
// the matching server-side enforcement this display value must agree with.
async function withRemainingStock<T extends { id: string; quantity: number }>(ticketTypes: T[]): Promise<(T & { remaining: number })[]> {
  if (ticketTypes.length === 0) return [];
  const sums = await prisma.ticketBooking.groupBy({
    by: ["ticketTypeId"],
    where: { ticketTypeId: { in: ticketTypes.map((t) => t.id) }, paymentStatus: { notIn: [...NON_CONSUMING_TICKET_STATUSES] } },
    _sum: { quantity: true },
  });
  const soldByTicketType = new Map(sums.map((s) => [s.ticketTypeId, s._sum.quantity ?? 0]));
  return ticketTypes.map((t) => ({ ...t, remaining: Math.max(0, t.quantity - (soldByTicketType.get(t.id) ?? 0)) }));
}

router.get("/events/:id/participants", publicSearchRateLimit, async (req, res) => {
  const event = await prisma.event.findFirst({
    where: { id: req.params.id, status: "PUBLISHED", visibility: "public", archivedAt: null },
    select: {
      id: true,
      moduleEnablements: {
        where: { moduleType: { in: ["PARTICIPANTS", "SPEAKERS", "SPONSORS", "PARTNERS", "VENDORS"] }, enabled: true },
        select: { moduleType: true },
      },
    },
  });
  if (!event || event.moduleEnablements.length === 0) return res.status(404).json({ error: "Event not found" });

  const enabledModules = new Set(event.moduleEnablements.map((module) => module.moduleType));
  const participantTypes = enabledModules.has("PARTICIPANTS")
    ? undefined
    : event.moduleEnablements.map((module) => module.moduleType === "SPEAKERS" ? "SPEAKER" : module.moduleType === "SPONSORS" ? "SPONSOR" : module.moduleType === "PARTNERS" ? "PARTNER" : "VENDOR");

  const search = req.query.q ? String(req.query.q).trim() : "";
  const requestedType = req.query.type ? String(req.query.type).trim().toUpperCase() : undefined;
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 24);
  const sort = String(req.query.sort ?? "featured");
  const allowedTypes = ["SPEAKER", "SPONSOR", "VENDOR", "PARTNER", "CUSTOM"] as const;
  const allowedSorts = ["featured", "name", "organization", "newest"] as const;

  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({ error: "page must be >= 1 and limit must be 1-100" });
  }
  if (requestedType && (!allowedTypes.includes(requestedType as typeof allowedTypes[number]) ||
      (participantTypes && !participantTypes.includes(requestedType as typeof participantTypes[number])))) {
    return res.status(400).json({ error: "Invalid participant type" });
  }
  if (!allowedSorts.includes(sort as typeof allowedSorts[number])) {
    return res.status(400).json({ error: "Invalid sort" });
  }

  const where = {
    eventId: event.id,
    status: "ACTIVE" as const,
    isPublic: true,
    archivedAt: null,
    participantType: requestedType
      ? requestedType as typeof allowedTypes[number]
      : participantTypes
        ? { in: participantTypes }
        : { not: "STAFF" as const },
    ...(search ? {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { title: { contains: search, mode: "insensitive" as const } },
        { organization: { contains: search, mode: "insensitive" as const } },
        { bio: { contains: search, mode: "insensitive" as const } },
      ],
    } : {}),
  };

  const orderBy = sort === "name"
    ? [{ name: "asc" as const }, { id: "asc" as const }]
    : sort === "organization"
      ? [{ organization: "asc" as const }, { name: "asc" as const }]
      : sort === "newest"
        ? [{ createdAt: "desc" as const }, { id: "desc" as const }]
        : [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }, { id: "asc" as const }];

  const [participants, total] = await Promise.all([
    prisma.eventParticipant.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        participantType: true,
        customType: true,
        name: true,
        title: true,
        organization: true,
        bio: true,
        photoUrl: true,
        sortOrder: true,
      },
    }),
    prisma.eventParticipant.count({ where }),
  ]);

  res.json({ participants, total, page, pageSize: limit, hasNextPage: page * limit < total });
});

router.get("/exhibitions/:id", publicReadRateLimit, async (req, res) => {
  await releaseExpiredReservations(req.params.id);

  // 001E: Event is authoritative for universal public identity/lifecycle.
  // Exhibition remains the operational/content compatibility payload.
  const event = await prisma.event.findFirst({
    where: { exhibition: { id: req.params.id } },
    include: {
      organizer: { select: { id: true, name: true, slug: true, logoUrl: true, kycStatus: true } },
      category: { select: { id: true, name: true, slug: true } },
      exhibition: {
        include: {
          organizer: { select: { id: true, name: true, slug: true, logoUrl: true, kycStatus: true } },
          ticketTypes: { where: { visible: true } },
          stalls: {
            where: { status: "available" },
            select: { id: true, code: true, stallType: true, size: true, price: true, status: true, posX: true, posY: true, width: true, height: true },
          },
          media: { where: { active: true }, orderBy: { sortOrder: "asc" } },
          schedules: { where: { active: true }, orderBy: [{ date: "asc" }, { sortOrder: "asc" }] },
          highlights: { where: { active: true }, orderBy: { sortOrder: "asc" } },
          audiences: { where: { active: true }, orderBy: { sortOrder: "asc" } },
          faqs: { where: { active: true }, orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });

  let exhibition = event?.exhibition ?? null;
  if (
    event &&
    exhibition &&
    (event.status === "PUBLISHED" || event.status === "COMPLETED") &&
    event.visibility === "public" &&
    event.archivedAt === null
  ) {
    const statusMap = { PUBLISHED: "live", COMPLETED: "completed" } as const;
    exhibition = {
      ...exhibition,
      organizer: event.organizer,
      name: event.title,
      description: event.description,
      venue: event.venue,
      city: event.city,
      latitude: event.latitude,
      longitude: event.longitude,
      startDate: event.startDate,
      endDate: event.endDate,
      coverImageUrl: event.coverImageUrl,
      refundPolicy: event.refundPolicy,
      terms: event.terms,
      status: statusMap[event.status],
      visibility: event.visibility,
    };
  } else if (event) {
    // A linked Event is authoritative. Never fall back to legacy Exhibition
    // visibility/lifecycle when the canonical Event is private/unpublished.
    exhibition = null;
  } else {
    // Legacy compatibility: only unlinked Exhibitions use the old lifecycle.
    exhibition = await prisma.exhibition.findFirst({
      where: { id: req.params.id, status: { in: ["live", "completed"] }, visibility: "public" },
      include: {
        organizer: { select: { id: true, name: true, slug: true, logoUrl: true, kycStatus: true } },
        ticketTypes: { where: { visible: true } },
        stalls: {
          where: { status: "available" },
          select: { id: true, code: true, stallType: true, size: true, price: true, status: true, posX: true, posY: true, width: true, height: true },
        },
        media: { where: { active: true }, orderBy: { sortOrder: "asc" } },
        schedules: { where: { active: true }, orderBy: [{ date: "asc" }, { sortOrder: "asc" }] },
        highlights: { where: { active: true }, orderBy: { sortOrder: "asc" } },
        audiences: { where: { active: true }, orderBy: { sortOrder: "asc" } },
        faqs: { where: { active: true }, orderBy: { sortOrder: "asc" } },
      },
    });
  }

  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });
  const ticketTypes = await withRemainingStock(exhibition.ticketTypes);
  res.json({ exhibition: { ...exhibition, ticketTypes, eventId: event?.id ?? exhibition.eventId ?? null } });
});

async function publicExhibitionExists(exhibitionId: string): Promise<boolean> {
  const event = await prisma.event.findFirst({
    where: { exhibition: { id: exhibitionId } },
    select: { status: true, visibility: true, archivedAt: true },
  });
  if (event) {
    return (event.status === "PUBLISHED" || event.status === "COMPLETED") && event.visibility === "public" && event.archivedAt === null;
  }
  const exhibition = await prisma.exhibition.findFirst({
    where: { id: exhibitionId, status: { in: ["live", "completed"] }, visibility: "public" },
    select: { id: true },
  });
  return Boolean(exhibition);
}

// Phase 24 — public exhibitor directory for the event-detail page. Same
// visibility gate as GET /exhibitions/:id above (404s the same way for a
// draft/paused/private/nonexistent event — no separate enumeration signal).
// Only `status: "confirmed"` participations are ever returned: every earlier
// ParticipationStatus (applied/approved/stall_pending/stall_reserved/
// payment_pending/rejected/cancelled) means the exhibitor isn't a settled,
// real participant yet and must never appear in a public "who's exhibiting"
// list. Selected business fields are deliberately the same public-safe
// subset PUBLIC_ORGANIZER_SELECT already establishes for organizers — never
// gst/pan/address/bankAccount*/suspended*.
const EXHIBITORS_PAGE_SIZE = 24;

router.get("/exhibitions/:id/exhibitors", publicReadRateLimit, async (req, res) => {
  const visible = await publicExhibitionExists(req.params.id);
  if (!visible) return res.status(404).json({ error: "Exhibition not found" });

  const exhibition = { id: req.params.id };
  const page = Math.max(1, Number(req.query.page) || 1);
  const where = { exhibitionId: exhibition.id, status: "confirmed" as const };

  const [participations, total] = await Promise.all([
    prisma.exhibitionExhibitor.findMany({
      where,
      orderBy: { confirmedAt: "asc" },
      skip: (page - 1) * EXHIBITORS_PAGE_SIZE,
      take: EXHIBITORS_PAGE_SIZE,
      select: {
        id: true,
        boothNumber: true,
        business: {
          select: { id: true, companyName: true, businessType: true, logoUrl: true, kycStatus: true },
        },
      },
    }),
    prisma.exhibitionExhibitor.count({ where }),
  ]);

  res.json({ exhibitors: participations, total, page, pageSize: EXHIBITORS_PAGE_SIZE });
});

// Phase 28 — public "get published floor plan" for an exhibition. Same
// visibility gate and 404-not-403 convention as GET /exhibitions/:id and
// GET /exhibitions/:id/exhibitors above: a private/draft/nonexistent
// exhibition, or one with no *published* floor plan, both resolve to a
// plain 404 with no distinguishing signal. `floor_plans`/`floor_plan_objects`
// are managed via raw SQL by server/src/routes/floorPlanLayout.ts (the
// organizer-only editor) because their Prisma client models aren't wired up
// for app-level use yet — this route mirrors that same raw-SQL style. Their
// columns are already declared as quoted camelCase identifiers in the FP-02
// migration (e.g. "canvasWidth", "publishedAt"), so no snake_case-vs-camelCase
// aliasing mismatch exists here; DECIMAL columns are still explicitly
// Number()-converted below since $queryRaw returns them as Prisma.Decimal,
// never left as-is or restated as a mismatched TS type. Only the public-safe
// stall fields are ever attached to an object — never buyerName/buyerEmail —
// matching the same private-field redaction PUBLIC_ORGANIZER_SELECT applies
// to organizers elsewhere in this file.
router.get("/exhibitions/:id/floor-plan", publicSearchRateLimit, async (req, res) => {
  const visible = await publicExhibitionExists(req.params.id);
  if (!visible) return res.status(404).json({ error: "Exhibition not found" });

  const exhibition = { id: req.params.id };

  // Phase 30 (FP-05): see the identical comment on GET /exhibitions/:id above.
  await releaseExpiredReservations(exhibition.id);

  const floorPlan = await getPublishedFloorPlan(exhibition.id);
  if (!floorPlan) return res.status(404).json({ error: "No published floor plan" });

  return res.json({ floorPlan });
});

// Phase 22.1 — public organizer profile. Only fields deliberately meant to
// be public are selected — never gst/pan/bank*, and never an internal id
// beyond what's needed to look up events. A disabled/suspended/nonexistent
// organizer all resolve to the same 404, so the public API never reveals
// which case it was (no enumeration signal).
const PUBLIC_ORGANIZER_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  logoUrl: true,
  coverImageUrl: true,
  website: true,
  city: true,
  state: true,
  country: true,
  publicEmail: true,
  publicPhone: true,
  kycStatus: true,
  createdAt: true,
  socialLinks: { where: { active: true }, orderBy: { sortOrder: "asc" as const }, select: { id: true, platform: true, url: true } },
  _count: {
    select: {
      follows: true,
      // 001E Progressive Read Cutover: canonical public event count.
      // Keep the legacy Exhibition count during the migration so older
      // consumers remain compatible while new consumers use events.
      // 001E: Event is canonical for public universal event counts.
      events: {
        where: {
          status: { in: ["PUBLISHED", "COMPLETED"] as ("PUBLISHED" | "COMPLETED")[] },
          visibility: "public" as const,
          archivedAt: null,
        },
      },
    },
  },
};

router.get("/organizers/:slug", publicReadRateLimit, async (req, res) => {
  const organizer = await prisma.organizer.findFirst({
    where: { slug: req.params.slug, publicProfileEnabled: true, suspended: false },
    select: PUBLIC_ORGANIZER_SELECT,
  });
  if (!organizer) return res.status(404).json({ error: "Organizer not found" });
  // 001E: public organizer event counts are canonical Event reads.
  res.json({ organizer });
});

const EVENTS_PAGE_SIZE = 20;

router.get("/organizers/:slug/events", publicReadRateLimit, async (req, res) => {
  const organizer = await prisma.organizer.findFirst({
    where: { slug: req.params.slug, publicProfileEnabled: true, suspended: false },
    select: { id: true },
  });
  if (!organizer) return res.status(404).json({ error: "Organizer not found" });

  const type = req.query.type === "past" ? "past" : "upcoming";
  const page = Math.max(1, Number(req.query.page) || 1);
  const now = new Date();

  // 001E Progressive Read Cutover: universal public event listing now reads
  // from Event, not Exhibition. Exhibition-specific detail remains on the
  // Exhibition relation and is deliberately not migrated here yet.
  const where =
    type === "past"
      ? { organizerId: organizer.id, visibility: "public" as const, status: "COMPLETED" as const }
      : { organizerId: organizer.id, visibility: "public" as const, status: "PUBLISHED" as const, endDate: { gte: now } };

  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      include: { category: { select: { id: true, name: true, slug: true } }, exhibition: { select: { id: true } } },
      orderBy: { startDate: type === "past" ? "desc" : "asc" },
      skip: (page - 1) * EVENTS_PAGE_SIZE,
      take: EVENTS_PAGE_SIZE,
    }),
    prisma.event.count({ where }),
  ]);

  // Preserve the existing response key during the progressive migration so
  // current clients do not break. Each item is now Event-shaped with the
  // legacy `name` alias. New consumers should use the canonical `events` key.
  const publicEvents = events.map((event) => ({ ...event, name: event.title }));
  res.json({ exhibitions: publicEvents, events: publicEvents, total, page, pageSize: EVENTS_PAGE_SIZE });
});

// Phase 22.2 — public gallery. Only active, non-archived items, and only
// safe public fields (never internal upload/audit metadata like
// createdByUserId). Same 404-not-403 not-found/private/suspended handling
// as the other public organizer routes above — no enumeration signal.
router.get("/organizers/:slug/gallery", publicReadRateLimit, async (req, res) => {
  const organizer = await prisma.organizer.findFirst({
    where: { slug: req.params.slug, publicProfileEnabled: true, suspended: false },
    select: { id: true },
  });
  if (!organizer) return res.status(404).json({ error: "Organizer not found" });

  const items = await prisma.organizerGalleryMedia.findMany({
    where: { organizerId: organizer.id, active: true, archivedAt: null },
    orderBy: { sortOrder: "asc" },
    select: { id: true, imageUrl: true, caption: true, altText: true, isFeatured: true },
  });
  res.json({ items });
});

// ---------------------------------------------------------------------------
// Phase 22.4 — public discovery/search.
//
// ARCHITECTURE DECISION: one coherent endpoint (`GET /discover?type=events|
// organizers&...`), not two separate ones. The frontend's UI is a single
// search bar with an Events/Organizers tab switch, which maps naturally to
// one endpoint with a `type` discriminator sharing the same q/pagination
// envelope — two endpoints would just duplicate that plumbing.
//
// SEARCH STRATEGY / SCALABILITY BOUNDARY (documented per the phase brief):
// no Elasticsearch/Algolia/Meilisearch exists or is justified at current
// product scale. Filtering happens via Postgres `ILIKE` through Prisma's
// `contains`/`mode: "insensitive"` (fully parameterized by the ORM — no raw
// SQL, no injection surface). Relevance ranking (exact > prefix > partial >
// other-field match) is computed in application code after a single bounded
// fetch (MAX_CANDIDATES rows), then paginated in memory — deliberately NOT
// a second per-page database round trip with custom SQL ORDER BY, since
// Prisma has no portable way to express "rank by match quality" and hand-
// rolling raw parameterized SQL for it would be a second, harder-to-audit
// query path for a marginal gain at this data volume. This does not scale
// indefinitely: if any single filter combination's matching-row count
// exceeds MAX_CANDIDATES, ranking/pagination beyond that cutoff would be
// inaccurate. At that point (which today's real data volume — a handful to
// low hundreds of organizers/events — is nowhere near) the right fix is
// DB-side ranking via Postgres full-text search (`tsvector`/`ts_rank`) or a
// trigram index (`pg_trgm`), not a bigger in-app sort.
// ---------------------------------------------------------------------------

const MAX_CANDIDATES = 1000;
const DISCOVER_PAGE_SIZE_MAX = 50;
const DISCOVER_PAGE_SIZE_DEFAULT = 20;

function relevanceScore(text: string | null | undefined, q: string): number {
  if (!text) return 3;
  const lower = text.toLowerCase();
  if (lower === q) return 0;
  if (lower.startsWith(q)) return 1;
  if (lower.includes(q)) return 2;
  return 3;
}

const discoverQuerySchema = z.object({
  type: z.enum(["events", "organizers"]).default("events"),
  q: z.string().trim().max(200).optional(),
  category: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  // Phase 22.5 — migrated from ExhibitionListing.tsx's client-side price
  // slider. "Price" means an event's MINIMUM visible ticket type price (the
  // same definition src/components/ExhibitionCard.tsx's getMinTicketPrice
  // already uses) — there is no separate "event price" field on Exhibition
  // itself. Rejects negative values (400), consistent with page/limit.
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sort: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(DISCOVER_PAGE_SIZE_MAX).default(DISCOVER_PAGE_SIZE_DEFAULT),
  // "Nearby" search — all three must be present together to activate it
  // (see below). Bounded exactly like any other geographic input: real
  // lat/lng ranges, and a capped radius so a caller can't ask for an
  // unbounded/planet-wide scan.
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().positive().max(200).optional(),
});

const EARTH_RADIUS_KM = 6371;

function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

router.get("/discover", publicSearchRateLimit, async (req, res) => {
  const parsed = discoverQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { type, q, category, city, state, country, dateFrom, dateTo, minPrice, maxPrice, sort, page, limit, lat, lng, radiusKm } = parsed.data;
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    return res.status(400).json({ error: "minPrice must not exceed maxPrice" });
  }
  // All three or none — a partial nearby request (e.g. lat without radiusKm)
  // is treated as "nearby search not requested" rather than guessing a
  // default radius.
  const nearby = lat !== undefined && lng !== undefined && radiusKm !== undefined ? { lat, lng, radiusKm } : null;
  const query = q?.toLowerCase();

  // Malformed date strings are treated as "no date filter" rather than a
  // 400 — consistent with this file's existing convention elsewhere
  // (organizers/:slug/events silently defaults an unrecognized `type`).
  const parsedDateFrom = dateFrom ? new Date(dateFrom) : undefined;
  const parsedDateTo = dateTo ? new Date(dateTo) : undefined;
  const validDateFrom = parsedDateFrom && !Number.isNaN(parsedDateFrom.getTime()) ? parsedDateFrom : undefined;
  const validDateTo = parsedDateTo && !Number.isNaN(parsedDateTo.getTime()) ? parsedDateTo : undefined;

  if (type === "organizers") {
    const where = {
      publicProfileEnabled: true,
      suspended: false,
      ...(city ? { city: { equals: city, mode: "insensitive" as const } } : {}),
      ...(state ? { state: { equals: state, mode: "insensitive" as const } } : {}),
      ...(country ? { country: { equals: country, mode: "insensitive" as const } } : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" as const } },
              { description: { contains: query, mode: "insensitive" as const } },
              { city: { contains: query, mode: "insensitive" as const } },
              { state: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [total, candidates] = await Promise.all([
      prisma.organizer.count({ where }),
      prisma.organizer.findMany({
        where,
        select: {
          id: true,
          slug: true,
          name: true,
          logoUrl: true,
          description: true,
          city: true,
          state: true,
          country: true,
          kycStatus: true,
          createdAt: true,
          _count: {
            select: {
              follows: true,
              // 001E: public event sorting/counts use the canonical Event lifecycle.
              events: { where: { status: "PUBLISHED", visibility: "public", archivedAt: null, endDate: { gte: new Date() } } },
            },
          },
        },
        take: MAX_CANDIDATES,
      }),
    ]);

    // An explicitly requested sort (followers/events/newest) always wins,
    // even with a search term present — relevance is only the DEFAULT
    // ranking when the caller hasn't asked for a specific order (see the
    // discover-endpoint doc comment: "if search text exists, relevance
    // should be preferred" describes the default, not a mandatory override
    // of an explicit sort= the caller passed alongside q=).
    let ranked: typeof candidates;
    switch (sort) {
      case "followers":
        ranked = [...candidates].sort((a, b) => b._count.follows - a._count.follows);
        break;
      case "events":
        ranked = [...candidates].sort((a, b) => b._count.events - a._count.events);
        break;
      case "newest":
        ranked = [...candidates].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        break;
      default:
        ranked = query
          ? [...candidates].sort((a, b) => relevanceScore(a.name, query) - relevanceScore(b.name, query))
          : [...candidates].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    const items = ranked.slice((page - 1) * limit, (page - 1) * limit + limit);
    return res.json({ type, items, total, page, pageSize: limit });
  }

  // type === "events" — 001E progressive read cutover.
  //
  // Event is now the canonical source for universal discovery fields
  // (identity, title, lifecycle, visibility, dates, location, cover image,
  // organizer). The existing Exhibition relation is retained only as a
  // compatibility bridge for ExhibitionListing.tsx: that legacy consumer
  // still needs Exhibition-owned ticket types and the /exhibition/:id route.
  // Non-exhibition Events are intentionally excluded here until that legacy
  // consumer is migrated to the universal Event card/detail flow.
  const where = {
    status: "PUBLISHED" as const,
    visibility: "public" as const,
    archivedAt: null,
    ...(category ? { category: { name: { equals: category, mode: "insensitive" as const } } } : {}),
    ...(city ? { city: { equals: city, mode: "insensitive" as const } } : {}),
    ...(nearby ? { latitude: { not: null }, longitude: { not: null } } : {}),
    ...(validDateTo ? { startDate: { lte: validDateTo } } : {}),
    ...(validDateFrom ? { endDate: { gte: validDateFrom } } : {}),
    exhibition: {
      status: "live" as const,
      visibility: "public" as const,
      ...(minPrice !== undefined || maxPrice !== undefined
        ? {
            ticketTypes: {
              some: {
                visible: true,
                price: {
                  ...(minPrice !== undefined ? { gte: minPrice } : {}),
                  ...(maxPrice !== undefined ? { lte: maxPrice } : {}),
                },
              },
            },
          }
        : {}),
    },
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" as const } },
            { description: { contains: query, mode: "insensitive" as const } },
            { venue: { contains: query, mode: "insensitive" as const } },
            { city: { contains: query, mode: "insensitive" as const } },
            { category: { name: { contains: query, mode: "insensitive" as const } } },
            { exhibition: { name: { contains: query, mode: "insensitive" as const }, status: "live" as const, visibility: "public" as const } },
          ],
        }
      : {}),
  };

  // Prisma relation filters above are deliberately kept compatible with the
  // existing Exhibition bridge. Price remains an Exhibition-owned concern
  // until the universal ticketing read cutover; universal Event ticket
  // catalog reads are handled by GET /events and GET /events/:id/tickets.
  const [total, candidates] = await Promise.all([
    prisma.event.count({ where }),
    prisma.event.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        venue: true,
        city: true,
        latitude: true,
        longitude: true,
        startDate: true,
        endDate: true,
        coverImageUrl: true,
        organizer: { select: { id: true, name: true, slug: true, logoUrl: true, kycStatus: true } },
        category: { select: { id: true, name: true, slug: true } },
        exhibition: {
          select: {
            id: true,
            ownerId: true,
            name: true,
            category: true,
            description: true,
            venue: true,
            city: true,
            latitude: true,
            longitude: true,
            startDate: true,
            endDate: true,
            coverImageUrl: true,
            floorPlanUrl: true,
            status: true,
            visibility: true,
            refundPolicy: true,
            terms: true,
            createdAt: true,
            updatedAt: true,
            ticketTypes: { where: { visible: true } },
          },
        },
        createdAt: true,
      },
      take: MAX_CANDIDATES,
    }),
  ]);

  type DiscoverEventCandidate = Awaited<typeof candidates>[number];
  const legacyCandidates = candidates.map((event): NonNullable<DiscoverEventCandidate["exhibition"]> & { eventId: string; eventTitle: string; eventDescription: string | null; eventVenue: string | null; eventCity: string | null; eventLatitude: number | null; eventLongitude: number | null; eventStartDate: Date | null; eventEndDate: Date | null; eventCoverImageUrl: string | null; eventCreatedAt: Date; organizer: DiscoverEventCandidate["organizer"]; } => ({
    ...event.exhibition!,
    eventId: event.id,
    eventTitle: event.title,
    eventDescription: event.description,
    eventVenue: event.venue,
    eventCity: event.city,
    eventLatitude: event.latitude,
    eventLongitude: event.longitude,
    eventStartDate: event.startDate,
    eventEndDate: event.endDate,
    eventCoverImageUrl: event.coverImageUrl,
    eventCreatedAt: event.createdAt,
    organizer: event.organizer,
  }));

  const withDistance = nearby
    ? legacyCandidates
        .map((e) => ({
          ...e,
          distanceKm: haversineDistanceKm(nearby.lat, nearby.lng, e.eventLatitude!, e.eventLongitude!),
        }))
        .filter((e) => e.distanceKm <= nearby.radiusKm)
    : legacyCandidates.map((e) => ({ ...e, distanceKm: null as number | null }));

  const nearbyTotal = nearby ? withDistance.length : total;

  function minTicketPrice(e: (typeof withDistance)[number]): number {
    const prices = e.ticketTypes.map((t) => Number(t.price));
    return prices.length ? Math.min(...prices) : 0;
  }

  let ranked: typeof withDistance;
  if (nearby) {
    ranked = [...withDistance].sort((a, b) => {
      if (a.distanceKm !== b.distanceKm) return (a.distanceKm ?? 0) - (b.distanceKm ?? 0);
      return (a.eventStartDate?.getTime() ?? Infinity) - (b.eventStartDate?.getTime() ?? Infinity);
    });
  } else {
    switch (sort) {
      case "newest":
        ranked = [...withDistance].sort((a, b) => b.eventCreatedAt.getTime() - a.eventCreatedAt.getTime());
        break;
      case "soonest":
        ranked = [...withDistance].sort((a, b) => (a.eventStartDate?.getTime() ?? Infinity) - (b.eventStartDate?.getTime() ?? Infinity));
        break;
      case "price-low":
        ranked = [...withDistance].sort((a, b) => minTicketPrice(a) - minTicketPrice(b));
        break;
      case "price-high":
        ranked = [...withDistance].sort((a, b) => minTicketPrice(b) - minTicketPrice(a));
        break;
      default:
        ranked = query
          ? [...withDistance].sort((a, b) => relevanceScore(a.eventTitle, query) - relevanceScore(b.eventTitle, query))
          : [...withDistance].sort((a, b) => (a.eventStartDate?.getTime() ?? Infinity) - (b.eventStartDate?.getTime() ?? Infinity));
    }
  }

  const items = ranked.slice((page - 1) * limit, (page - 1) * limit + limit).map((e) => ({
    ...e,
    // Preserve the legacy ExhibitionCard contract while exposing the
    // canonical Event identity to future consumers.
    name: e.eventTitle,
    description: e.eventDescription,
    venue: e.eventVenue,
    city: e.eventCity,
    latitude: e.eventLatitude,
    longitude: e.eventLongitude,
    startDate: e.eventStartDate,
    endDate: e.eventEndDate,
    coverImageUrl: e.eventCoverImageUrl,
    eventId: e.eventId,
  }));

  return res.json({ type, items, total: nearbyTotal, page, pageSize: limit });
});

const PUBLIC_EVENTS_PAGE_SIZE_MAX = 50;
const PUBLIC_EVENTS_PAGE_SIZE_DEFAULT = 20;

const publicEventsQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  eventType: z.enum(["EXHIBITION", "CONFERENCE", "WORKSHOP", "SEMINAR", "CONCERT", "FESTIVAL", "SPORTS", "COMMUNITY", "OTHER"]).optional(),
  categoryId: z.string().optional(),
  city: z.string().trim().max(100).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  sort: z.enum(["soonest", "newest", "title"]).default("soonest"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PUBLIC_EVENTS_PAGE_SIZE_MAX).default(PUBLIC_EVENTS_PAGE_SIZE_DEFAULT),
});

// ETX-EVENT-001D.2 — universal public discovery. This is deliberately
// separate from the legacy Exhibition discovery contract above: it exposes
// only the universal Event surface and never requires authentication.
// PUBLISHED + public + not archived is the server-authoritative visibility
// gate. Private/draft/paused/cancelled/archived Events are never returned.
router.get("/event-categories", publicSearchRateLimit, async (_req, res) => {
  const categories = await prisma.eventCategory.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true, description: true, parentCategoryId: true },
  });
  return res.json({ categories });
});

router.get("/events", publicSearchRateLimit, async (req, res) => {
  const parsed = publicEventsQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { q, eventType, categoryId, city, dateFrom, dateTo, sort, page, limit } = parsed.data;
  const parsedDateFrom = dateFrom ? new Date(dateFrom) : undefined;
  const parsedDateTo = dateTo ? new Date(dateTo) : undefined;
  const validDateFrom = parsedDateFrom && !Number.isNaN(parsedDateFrom.getTime()) ? parsedDateFrom : undefined;
  const validDateTo = parsedDateTo && !Number.isNaN(parsedDateTo.getTime()) ? parsedDateTo : undefined;

  if (validDateFrom && validDateTo && validDateFrom > validDateTo) {
    return res.status(400).json({ error: "dateFrom must not be after dateTo" });
  }

  const query = q?.toLowerCase();
  const where = {
    status: "PUBLISHED" as const,
    visibility: "public" as const,
    archivedAt: null,
    ...(eventType ? { eventType } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(city ? { city: { equals: city, mode: "insensitive" as const } } : {}),
    ...(validDateTo ? { startDate: { lte: validDateTo } } : {}),
    ...(validDateFrom ? { endDate: { gte: validDateFrom } } : {}),
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" as const } },
            { description: { contains: query, mode: "insensitive" as const } },
            { venue: { contains: query, mode: "insensitive" as const } },
            { city: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, events] = await Promise.all([
    prisma.event.count({ where }),
    prisma.event.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        eventType: true,
        categoryId: true,
        category: { select: { id: true, name: true, slug: true } },
        status: true,
        visibility: true,
        startDate: true,
        endDate: true,
        timezone: true,
        venue: true,
        city: true,
        latitude: true,
        longitude: true,
        coverImageUrl: true,
        organizer: { select: { id: true, name: true, slug: true, logoUrl: true } },
        exhibition: { select: { id: true } },
      },
      orderBy: sort === "newest"
        ? { createdAt: "desc" }
        : sort === "title"
          ? { title: "asc" }
          : { startDate: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return res.json({ events, total, page, pageSize: limit });
});

// ETX-EVENT-001D.2 — public universal Event detail. Keep the response
// intentionally public-safe and return 404 for every non-public state so
// callers cannot distinguish a private/draft/archived Event from a missing
// one. The linked Exhibition id is a routing bridge only; Exhibition-owned
// content remains served by its existing public endpoint until the
// progressive read cutover is completed.
router.get("/events/:id", publicSearchRateLimit, async (req, res) => {
  const event = await prisma.event.findFirst({
    where: {
      id: req.params.id,
      status: "PUBLISHED",
      visibility: "public",
      archivedAt: null,
    },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      eventType: true,
      categoryId: true,
      category: { select: { id: true, name: true, slug: true, description: true } },
      status: true,
      visibility: true,
      startDate: true,
      endDate: true,
      timezone: true,
      venue: true,
      city: true,
      latitude: true,
      longitude: true,
      coverImageUrl: true,
      refundPolicy: true,
      terms: true,
      organizer: { select: { id: true, name: true, slug: true, logoUrl: true, description: true, website: true, city: true, state: true, country: true } },
      moduleEnablements: { where: { enabled: true }, select: { moduleType: true, config: true } },
      exhibition: { select: { id: true } },
    },
  });

  if (!event) return res.status(404).json({ error: "Event not found" });
  return res.json({ event, linkedExhibitionId: event.exhibition?.id ?? null });
});


const publicEventTicketsRateLimit = publicSearchRateLimit;

router.get("/events/:id/tickets", publicEventTicketsRateLimit, async (req, res) => {
  const event = await prisma.event.findFirst({
    where: {
      id: req.params.id,
      status: "PUBLISHED",
      visibility: "public",
      archivedAt: null,
      moduleEnablements: { some: { moduleType: "TICKETING", enabled: true } },
    },
    select: {
      id: true,
      title: true,
      startDate: true,
      endDate: true,
      timezone: true,
      venue: true,
      city: true,
      coverImageUrl: true,
      exhibition: { select: { id: true } },
      ticketTypes: {
        where: {
          status: "ACTIVE",
          OR: [
            { saleStartsAt: null },
            { saleStartsAt: { lte: new Date() } },
          ],
          AND: [
            {
              OR: [
                { saleEndsAt: null },
                { saleEndsAt: { gt: new Date() } },
              ],
            },
          ],
        },
        orderBy: [{ sortOrder: "asc" }, { price: "asc" }],
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          currency: true,
          capacity: true,
          maxPerOrder: true,
          maxPerAttendee: true,
          saleStartsAt: true,
          saleEndsAt: true,
          sortOrder: true,
        },
      },
    },
  });

  if (!event || event.exhibition) return res.status(404).json({ error: "Event ticketing not found" });

  const now = new Date();
  const tickets = await Promise.all(event.ticketTypes.map(async (ticket) => {
    await prisma.eventTicketReservation.updateMany({
      where: { eventTicketTypeId: ticket.id, status: "ACTIVE", expiresAt: { lte: now } },
      data: { status: "EXPIRED" },
    });

    const [activeReservations, paidOrders] = await Promise.all([
      prisma.eventTicketReservation.aggregate({
        where: { eventTicketTypeId: ticket.id, status: "ACTIVE", expiresAt: { gt: now } },
        _sum: { quantity: true },
      }),
      prisma.eventTicketOrder.aggregate({
        where: { status: "PAID", reservation: { eventTicketTypeId: ticket.id } },
        _sum: { quantity: true },
      }),
    ]);

    const reserved = activeReservations._sum.quantity ?? 0;
    const sold = paidOrders._sum.quantity ?? 0;
    return {
      ...ticket,
      remaining: Math.max(0, ticket.capacity - sold - reserved),
      soldOut: ticket.capacity - sold - reserved <= 0,
    };
  }));

  return res.json({
    event: {
      id: event.id,
      title: event.title,
      startDate: event.startDate,
      endDate: event.endDate,
      timezone: event.timezone,
      venue: event.venue,
      city: event.city,
      coverImageUrl: event.coverImageUrl,
    },
    ticketTypes: tickets,
  });
});

export default router;
