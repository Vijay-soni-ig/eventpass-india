import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { NON_CONSUMING_TICKET_STATUSES } from "../lib/entitlementService";
import { publicSearchRateLimit } from "../middleware/rateLimit";
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
router.get("/exhibitions", async (_req, res) => {
  const exhibitions = await prisma.exhibition.findMany({
    where: { status: "live", visibility: "public" },
    include: { ticketTypes: { where: { visible: true } } },
    orderBy: { createdAt: "desc" },
  });
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

router.get("/exhibitions/:id", async (req, res) => {
  // Phase 30 (FP-05): release any expired reservation before reading stalls
  // below — this query filters to status:"available" only, so an expired-
  // but-not-yet-released reservation would otherwise stay invisible here
  // even after its 1-hour window has passed.
  await releaseExpiredReservations(req.params.id);

  const exhibition = await prisma.exhibition.findFirst({
    // Phase 23.2 fix: a completed event must remain reachable by direct/deep
    // link — the organizer public profile's "Past Events" tab (see
    // GET /organizers/:slug/events?type=past below) already links visitors
    // to exactly these events via ExhibitionCard's /exhibition/:id URL, so
    // restricting this lookup to status:"live" 404'd every one of them. This
    // reuses the same {live, completed} visibility set already established
    // for public completed-event access (see the past-events route and
    // PUBLIC_ORGANIZER_SELECT's exhibitions count above), not a new rule.
    where: { id: req.params.id, status: { in: ["live", "completed"] }, visibility: "public" },
    include: {
      organizer: { select: { id: true, name: true, slug: true, logoUrl: true, kycStatus: true } },
      ticketTypes: { where: { visible: true } },
      stalls: {
        where: { status: "available" },
        select: {
          id: true,
          code: true,
          stallType: true,
          size: true,
          price: true,
          status: true,
          posX: true,
          posY: true,
          width: true,
          height: true,
        },
      },
      // Phase 25 — organizer-managed Exhibition Details content. Only
      // `active: true` rows are ever returned here — a deactivated/archived
      // item (set via the organizer content-management API) is real data
      // the organizer chose to hide, and must never reach the public
      // response regardless of this exhibition's own live/completed status.
      media: { where: { active: true }, orderBy: { sortOrder: "asc" } },
      schedules: { where: { active: true }, orderBy: [{ date: "asc" }, { sortOrder: "asc" }] },
      highlights: { where: { active: true }, orderBy: { sortOrder: "asc" } },
      audiences: { where: { active: true }, orderBy: { sortOrder: "asc" } },
      faqs: { where: { active: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });
  const ticketTypes = await withRemainingStock(exhibition.ticketTypes);
  res.json({ exhibition: { ...exhibition, ticketTypes } });
});

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

router.get("/exhibitions/:id/exhibitors", async (req, res) => {
  const exhibition = await prisma.exhibition.findFirst({
    where: { id: req.params.id, status: { in: ["live", "completed"] }, visibility: "public" },
    select: { id: true },
  });
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });

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
router.get("/exhibitions/:id/floor-plan", async (req, res) => {
  const exhibition = await prisma.exhibition.findFirst({
    where: { id: req.params.id, status: { in: ["live", "completed"] }, visibility: "public" },
    select: { id: true },
  });
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });

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
      exhibitions: { where: { status: { in: ["live", "completed"] as ("live" | "completed")[] }, visibility: "public" as const } },
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

router.get("/organizers/:slug", async (req, res) => {
  const organizer = await prisma.organizer.findFirst({
    where: { slug: req.params.slug, publicProfileEnabled: true, suspended: false },
    select: PUBLIC_ORGANIZER_SELECT,
  });
  if (!organizer) return res.status(404).json({ error: "Organizer not found" });
  // 001E: canonical Event count is now available to new public-profile consumers;
  // the legacy Exhibition count remains during the progressive migration.
  res.json({ organizer });
});

const EVENTS_PAGE_SIZE = 20;

router.get("/organizers/:slug/events", async (req, res) => {
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
      include: { exhibition: { select: { id: true } } },
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
router.get("/organizers/:slug/gallery", async (req, res) => {
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
              exhibitions: { where: { status: "live", visibility: "public", endDate: { gte: new Date() } } },
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
        ranked = [...candidates].sort((a, b) => b._count.exhibitions - a._count.exhibitions);
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

  // type === "events" — no default "upcoming only" filter, matching the
  // existing GET /exhibitions listing's convention (status=live,
  // visibility=public, no date restriction unless the caller asks for one).
  const where = {
    status: "live" as const,
    visibility: "public" as const,
    ...(category ? { category: { equals: category, mode: "insensitive" as const } } : {}),
    ...(city ? { city: { equals: city, mode: "insensitive" as const } } : {}),
    // Nearby search only ever considers exhibitions with real coordinates —
    // never a guessed/defaulted location for the ones that don't have any.
    ...(nearby ? { latitude: { not: null }, longitude: { not: null } } : {}),
    // An event "overlaps" [dateFrom, dateTo] the same way the existing
    // frontend date-range filter already defines it (ExhibitionListing.tsx):
    // event.startDate <= rangeEnd AND event.endDate >= rangeStart.
    ...(validDateTo ? { startDate: { lte: validDateTo } } : {}),
    ...(validDateFrom ? { endDate: { gte: validDateFrom } } : {}),
    // An event with no visible ticket type at all has no price to compare,
    // and is excluded once a price filter is active (matches the intent of
    // "show me events priced between X and Y" — there's nothing to show).
    // Both bounds must apply to the SAME ticket type row (one combined
    // `price` condition object) — building them as two separate spreads
    // would let the second silently overwrite the first's key.
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
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { description: { contains: query, mode: "insensitive" as const } },
            { venue: { contains: query, mode: "insensitive" as const } },
            { city: { contains: query, mode: "insensitive" as const } },
            { category: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, candidates] = await Promise.all([
    prisma.exhibition.count({ where }),
    prisma.exhibition.findMany({
      where,
      // Same field exposure level as the existing GET /exhibitions listing
      // (which returns every scalar column with no select restriction at
      // all) — this uses an explicit select instead only to also attach the
      // organizer summary and keep ticketTypes minimal, not to hide
      // anything that endpoint doesn't already hide.
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
        organizer: { select: { id: true, name: true, slug: true, logoUrl: true, kycStatus: true } },
        ticketTypes: { where: { visible: true } },
      },
      take: MAX_CANDIDATES,
    }),
  ]);

  // Nearby search filters + ranks by real Haversine distance from the
  // caller's point, computed here (once, server-side) rather than trusting
  // any client-computed distance. Candidates without both coordinates were
  // already excluded by the `where` clause above.
  const withDistance = nearby
    ? candidates
        .map((e) => ({
          ...e,
          distanceKm: haversineDistanceKm(nearby.lat, nearby.lng, e.latitude!, e.longitude!),
        }))
        .filter((e) => e.distanceKm <= nearby.radiusKm)
    : candidates.map((e) => ({ ...e, distanceKm: null as number | null }));

  const nearbyTotal = nearby ? withDistance.length : total;

  // Same "min visible ticket price" definition as ExhibitionCard.tsx's
  // getMinTicketPrice — an event with no visible ticket types sorts as
  // free (0), matching that component's existing behavior exactly.
  function minTicketPrice(e: (typeof withDistance)[number]): number {
    const prices = e.ticketTypes.map((t) => Number(t.price));
    return prices.length ? Math.min(...prices) : 0;
  }

  let ranked: typeof withDistance;
  if (nearby) {
    // Nearby search has its own fixed ranking (distance, then soonest date
    // as a tiebreaker) — it's a distinct query mode, not meant to be
    // recombined with the general listing's newest/price sorts.
    ranked = [...withDistance].sort((a, b) => {
      if (a.distanceKm !== b.distanceKm) return (a.distanceKm ?? 0) - (b.distanceKm ?? 0);
      const aTime = a.startDate?.getTime() ?? Infinity;
      const bTime = b.startDate?.getTime() ?? Infinity;
      return aTime - bTime;
    });
  } else {
    // Same precedence rule as the organizer branch above: an explicit sort
    // wins even with q present; relevance is only the default.
    switch (sort) {
      case "newest":
        ranked = [...withDistance].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        break;
      case "soonest":
        ranked = [...withDistance].sort((a, b) => {
          const aTime = a.startDate?.getTime() ?? Infinity;
          const bTime = b.startDate?.getTime() ?? Infinity;
          return aTime - bTime;
        });
        break;
      case "price-low":
        ranked = [...withDistance].sort((a, b) => minTicketPrice(a) - minTicketPrice(b));
        break;
      case "price-high":
        ranked = [...withDistance].sort((a, b) => minTicketPrice(b) - minTicketPrice(a));
        break;
      default:
        ranked = query
          ? [...withDistance].sort((a, b) => relevanceScore(a.name, query) - relevanceScore(b.name, query))
          : [...withDistance].sort((a, b) => {
              const aTime = a.startDate?.getTime() ?? Infinity;
              const bTime = b.startDate?.getTime() ?? Infinity;
              return aTime - bTime;
            });
    }
  }

  const items = ranked.slice((page - 1) * limit, (page - 1) * limit + limit);
  res.json({ type, items, total: nearbyTotal, page, pageSize: limit });
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
