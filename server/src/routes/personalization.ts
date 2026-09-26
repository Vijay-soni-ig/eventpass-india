import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { optionalAuth, requireAuth, requirePlatformAdmin } from "../middleware/auth";
import { profileMutationRateLimit, publicSearchRateLimit } from "../middleware/rateLimit";
import { calculateRecommendationConversionMetrics } from "../lib/personalizationAttribution";
import {
  decayedInteractionWeight,
  diversifyRecommendations,
  scoreRecommendation,
  type RecommendationReasonCode,
} from "../lib/personalizationScoring";

const router = Router();

const interactionSchema = z.object({
  eventId: z.string().uuid().optional(),
  type: z.enum(["VIEW", "CLICK", "SAVE", "REGISTER", "PURCHASE", "CHECK_IN", "SEARCH", "RECOMMENDATION_IMPRESSION", "RECOMMENDATION_DISMISS", "RECOMMENDATION_NOT_INTERESTED"]),
  sessionId: z.string().trim().min(8).max(128).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).superRefine((value, ctx) => {
  if (!value.sessionId && !value.eventId) {
    ctx.addIssue({ code: "custom", message: "eventId or sessionId is required" });
  }
});

const recommendationQuerySchema = z.object({
  city: z.string().trim().max(100).optional(),
  sessionId: z.string().trim().min(8).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(12).default(6),
});

const preferenceSchema = z.object({
  preferredCategoryIds: z.array(z.string().uuid()).max(10).default([]),
  preferredCities: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
});

const analyticsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const ANALYTICS_MAX_DAYS = 90;
const RECOMMENDATION_IMPRESSION_DEDUPE_HOURS = 24;

const recommendationMetadataSchema = z.object({
  source: z.literal("recommendation"),
  position: z.coerce.number().int().min(1).max(12),
}).strict();

const INTERACTION_WEIGHT: Record<string, number> = {
  VIEW: 2,
  CLICK: 3,
  SAVE: 5,
  REGISTER: 7,
  PURCHASE: 10,
  CHECK_IN: 8,
  SEARCH: 1,
  RECOMMENDATION_IMPRESSION: 0,
  RECOMMENDATION_DISMISS: -4,
  RECOMMENDATION_NOT_INTERESTED: -8,
};

router.post("/interactions", optionalAuth, publicSearchRateLimit, async (req, res) => {
  const parsed = interactionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid interaction" });
  if (!req.user && !parsed.data.sessionId) return res.status(400).json({ error: "sessionId is required for anonymous interactions" });

  if (parsed.data.eventId) {
    const event = await prisma.event.findFirst({
      where: { id: parsed.data.eventId, status: "PUBLISHED", visibility: "public", archivedAt: null },
      select: { id: true },
    });
    if (!event) return res.status(404).json({ error: "Event not found" });
  } else if (parsed.data.type !== "SEARCH") {
    return res.status(400).json({ error: "eventId is required for this interaction type" });
  }
  if (
    ["RECOMMENDATION_IMPRESSION", "RECOMMENDATION_DISMISS", "RECOMMENDATION_NOT_INTERESTED"].includes(parsed.data.type)
  ) {
    const metadata = recommendationMetadataSchema.safeParse(parsed.data.metadata);
    if (!metadata.success) {
      return res.status(400).json({ error: "Recommendation interactions require source and position metadata" });
    }
  }

  if (parsed.data.type === "RECOMMENDATION_IMPRESSION" && parsed.data.eventId) {
    const identity = req.user?.id
      ? { userId: req.user.id }
      : parsed.data.sessionId
        ? { sessionId: parsed.data.sessionId }
        : null;
    if (identity) {
      const recentImpression = await prisma.visitorEventInteraction.findFirst({
        where: {
          ...identity,
          eventId: parsed.data.eventId,
          type: "RECOMMENDATION_IMPRESSION",
          createdAt: { gte: new Date(Date.now() - RECOMMENDATION_IMPRESSION_DEDUPE_HOURS * 60 * 60 * 1000) },
          metadata: { path: ["source"], equals: "recommendation" },
        },
        select: { id: true },
      });
      if (recentImpression) return res.status(204).send();
    }
  }

  await prisma.visitorEventInteraction.create({
    data: {
      userId: req.user?.id,
      eventId: parsed.data.eventId,
      type: parsed.data.type,
      sessionId: parsed.data.sessionId,
      metadata: parsed.data.metadata ? JSON.parse(JSON.stringify(parsed.data.metadata)) : undefined,
    },
  });

  res.status(204).send();
});

router.get("/preferences", requireAuth, async (req, res) => {
  const preference = await prisma.visitorPreference.findUnique({ where: { userId: req.user!.id } });
  res.json({
    preference: preference ?? {
      preferredCategoryIds: [],
      preferredCities: [],
    },
  });
});

router.put("/preferences", requireAuth, profileMutationRateLimit, async (req, res) => {
  const parsed = preferenceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid preferences" });

  const categoryCount = await prisma.eventCategory.count({
    where: { id: { in: parsed.data.preferredCategoryIds }, active: true },
  });
  if (categoryCount !== parsed.data.preferredCategoryIds.length) {
    return res.status(400).json({ error: "One or more selected categories are unavailable" });
  }

  const cities = [...new Set(parsed.data.preferredCities.map((city) => city.trim()).filter(Boolean))];
  const preference = await prisma.visitorPreference.upsert({
    where: { userId: req.user!.id },
    create: { userId: req.user!.id, preferredCategoryIds: parsed.data.preferredCategoryIds, preferredCities: cities },
    update: { preferredCategoryIds: parsed.data.preferredCategoryIds, preferredCities: cities },
  });

  res.json({ preference });
});

router.get("/recommendations", optionalAuth, publicSearchRateLimit, async (req, res) => {
  const parsed = recommendationQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid recommendation query" });
  const { city, sessionId, limit } = parsed.data;
  const now = new Date();

  const identityWhere = req.user
    ? { OR: [{ userId: req.user.id }, ...(sessionId ? [{ sessionId }] : [])] }
    : sessionId
      ? { sessionId }
      : undefined;

  const [history, registrations, purchases, saved, preference] = await Promise.all([
    identityWhere
      ? prisma.visitorEventInteraction.findMany({
          where: { ...identityWhere, eventId: { not: null }, createdAt: { gte: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000) } },
          orderBy: { createdAt: "desc" },
          take: 250,
          select: { eventId: true, type: true, createdAt: true },
        })
      : Promise.resolve([]),
    req.user
      ? prisma.eventRegistration.findMany({
          where: { userId: req.user.id, status: { in: ["PENDING", "CONFIRMED"] } },
          select: { eventId: true, event: { select: { categoryId: true, city: true, organizerId: true } } },
        })
      : Promise.resolve([]),
    req.user
      ? prisma.eventTicketOrder.findMany({
          where: { userId: req.user.id, status: "PAID" },
          select: { eventId: true, event: { select: { categoryId: true, city: true, organizerId: true } } },
        })
      : Promise.resolve([]),
    req.user
      ? prisma.savedExhibition.findMany({
          where: { userId: req.user.id, exhibition: { eventId: { not: null } } },
          select: { exhibition: { select: { eventId: true } } },
        })
      : Promise.resolve([]),
    req.user
      ? prisma.visitorPreference.findUnique({ where: { userId: req.user.id } })
      : Promise.resolve(null),
  ]);

  const negativeEventIds = new Set(
    history
      .filter((item) => item.type === "RECOMMENDATION_DISMISS" || item.type === "RECOMMENDATION_NOT_INTERESTED")
      .map((item) => item.eventId)
      .filter((id): id is string => Boolean(id)),
  );

  const knownEventIds = new Set<string>([
    ...registrations.map((x) => x.eventId),
    ...purchases.map((x) => x.eventId),
    ...saved.flatMap((x) => x.exhibition.eventId ? [x.exhibition.eventId] : []),
  ]);
  const recentRecommendationCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const recentlyShownEventIds = new Set(
    history
      .filter((item) => item.type === "RECOMMENDATION_IMPRESSION" && item.createdAt >= recentRecommendationCutoff)
      .map((item) => item.eventId)
      .filter((id): id is string => Boolean(id)),
  );

  const categoryWeights = new Map<string, number>();
  const cityWeights = new Map<string, number>();
  const organizerWeights = new Map<string, number>();
  const addProfile = (event: { categoryId: string | null; city: string | null; organizerId: string }, weight: number) => {
    if (event.categoryId) categoryWeights.set(event.categoryId, (categoryWeights.get(event.categoryId) ?? 0) + weight);
    if (event.city) cityWeights.set(event.city.toLowerCase(), (cityWeights.get(event.city.toLowerCase()) ?? 0) + weight);
    organizerWeights.set(event.organizerId, (organizerWeights.get(event.organizerId) ?? 0) + weight);
  };

  registrations.forEach((x) => addProfile(x.event, 7));
  purchases.forEach((x) => addProfile(x.event, 10));

  for (const categoryId of preference?.preferredCategoryIds ?? []) {
    categoryWeights.set(categoryId, (categoryWeights.get(categoryId) ?? 0) + 15);
  }
  for (const preferredCity of preference?.preferredCities ?? []) {
    const normalized = preferredCity.toLowerCase();
    cityWeights.set(normalized, (cityWeights.get(normalized) ?? 0) + 15);
  }

  if (history.length) {
    const historyIds = [...new Set(history.map((x) => x.eventId).filter((id): id is string => Boolean(id)))];
    const historyEvents = await prisma.event.findMany({
      where: { id: { in: historyIds } },
      select: { id: true, categoryId: true, city: true, organizerId: true },
    });
    const byId = new Map(historyEvents.map((x) => [x.id, x]));
    history.forEach((item) => {
      const event = item.eventId ? byId.get(item.eventId) : undefined;
      if (event) {
        const baseWeight = INTERACTION_WEIGHT[item.type] ?? 1;
        addProfile(event, decayedInteractionWeight(baseWeight, item.createdAt, now));
      }
    });
  }

  const preferredCity = city?.toLowerCase() || [...cityWeights.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const candidates = await prisma.event.findMany({
    where: {
      status: "PUBLISHED",
      visibility: "public",
      archivedAt: null,
      startDate: { gte: now },
      exhibition: { isNot: null },
    },
    take: 100,
    orderBy: [{ startDate: "asc" }, { createdAt: "desc" }],
    include: {
      category: { select: { id: true, name: true, slug: true } },
      organizer: { select: { id: true, name: true, slug: true, logoUrl: true, kycStatus: true } },
      exhibition: {
        select: {
          id: true, ownerId: true, name: true, category: true, description: true, venue: true, city: true,
          latitude: true, longitude: true, startDate: true, endDate: true, coverImageUrl: true, floorPlanUrl: true,
          status: true, visibility: true, refundPolicy: true, terms: true, createdAt: true, updatedAt: true,
          ticketTypes: { where: { visible: true } },
        },
      },
    },
  });

  const candidateIds = candidates.map((event) => event.id);
  const popularityRows = candidateIds.length
    ? await prisma.visitorEventInteraction.groupBy({
        by: ["eventId"],
        where: {
          eventId: { in: candidateIds },
          createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
          type: { in: ["VIEW", "CLICK", "SAVE", "REGISTER", "PURCHASE", "CHECK_IN"] },
        },
        _count: { _all: true },
      })
    : [];
  const popularityByEvent = new Map(
    popularityRows
      .filter((row): row is typeof row & { eventId: string } => Boolean(row.eventId))
      .map((row) => [row.eventId, row._count._all]),
  );
  const categoryPopularity = new Map<string, number>();
  const cityPopularity = new Map<string, number>();
  for (const event of candidates) {
    const count = popularityByEvent.get(event.id) ?? 0;
    if (event.categoryId) categoryPopularity.set(event.categoryId, (categoryPopularity.get(event.categoryId) ?? 0) + count);
    if (event.city) {
      const key = event.city.toLowerCase();
      cityPopularity.set(key, (cityPopularity.get(key) ?? 0) + count);
    }
  }

  const scored = candidates
    .filter((event) => !knownEventIds.has(event.id) && !negativeEventIds.has(event.id) && !recentlyShownEventIds.has(event.id))
    .map((event) => {
      const result = scoreRecommendation(
        event,
        { categoryWeights, cityWeights, organizerWeights },
        {
          eventInteractions: popularityByEvent.get(event.id) ?? 0,
          categoryInteractions: event.categoryId ? categoryPopularity.get(event.categoryId) ?? 0 : 0,
          cityInteractions: event.city ? cityPopularity.get(event.city.toLowerCase()) ?? 0 : 0,
        },
        now,
        city ?? preferredCity,
      );
      return result;
    });

  const selected = diversifyRecommendations(scored, limit);

  const reasonText = (reasonCodes: RecommendationReasonCode[], event: (typeof candidates)[number]) => {
    if (reasonCodes.includes("CATEGORY_AFFINITY")) {
      return "based on your interests in " + (event.category?.name ?? "this category");
    }
    if (reasonCodes.includes("CITY_AFFINITY")) {
      return "events in " + (event.city ?? city ?? preferredCity);
    }
    if (reasonCodes.includes("POPULAR_NEARBY")) {
      return "popular with visitors nearby";
    }
    if (reasonCodes.includes("ORGANIZER_AFFINITY")) {
      return "from an organizer you have engaged with";
    }
    if (reasonCodes.includes("UPCOMING_SOON")) {
      return "happening soon";
    }
    return "a fresh event discovery";
  };

  const items = selected.map(({ event, reasonCodes }) => ({
    ...event.exhibition!,
    category: event.category,
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
    recommendationReasonCodes: reasonCodes,
    recommendationReason: reasonText(reasonCodes, event),
  }));

  res.json({
    items,
    personalized: Boolean((req.user && (history.length || registrations.length || purchases.length || saved.length || preference)) || preferredCity),
    reason: selected[0] ? reasonText(selected[0].reasonCodes, selected[0].event) : null,
    city: city ?? preferredCity,
    profile: {
      categoryCount: categoryWeights.size,
      historyEvents: knownEventIds.size,
      hasPreferences: Boolean(preference),
      feedbackEvents: negativeEventIds.size,
    },
  });
});

router.get("/analytics", requireAuth, requirePlatformAdmin, async (req, res) => {
  const parsed = analyticsQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid analytics query" });
  const now = new Date();
  const to = parsed.data.to ?? now;
  const from = parsed.data.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (from > to) return res.status(400).json({ error: "from must be before to" });
  if (to > new Date(now.getTime() + 5 * 60 * 1000)) return res.status(400).json({ error: "to cannot be materially in the future" });
  if (to.getTime() - from.getTime() > ANALYTICS_MAX_DAYS * 24 * 60 * 60 * 1000) {
    return res.status(400).json({ error: `analytics range cannot exceed ${ANALYTICS_MAX_DAYS} days` });
  }

  const rows = await prisma.$queryRaw<Array<{ type: string; count: bigint }>>`
    SELECT type::text, COUNT(*)::bigint AS count
    FROM visitor_event_interactions
    WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
    GROUP BY type
    ORDER BY count DESC
  `;

  const [impressions, clicks, dismissals, notInterested, uniqueVisitors, attributedConversions] = await Promise.all([
    prisma.visitorEventInteraction.count({ where: { type: "RECOMMENDATION_IMPRESSION", createdAt: { gte: from, lte: to } } }),
    prisma.visitorEventInteraction.count({ where: { type: "CLICK", createdAt: { gte: from, lte: to }, metadata: { path: ["source"], equals: "recommendation" } } }),
    prisma.visitorEventInteraction.count({ where: { type: "RECOMMENDATION_DISMISS", createdAt: { gte: from, lte: to } } }),
    prisma.visitorEventInteraction.count({ where: { type: "RECOMMENDATION_NOT_INTERESTED", createdAt: { gte: from, lte: to } } }),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT COALESCE("userId", "sessionId"))::bigint AS count
      FROM visitor_event_interactions
      WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
    `,
    prisma.$queryRaw<Array<{
      registrationCount: bigint;
      purchaseCount: bigint;
      purchaseRevenue: string | null;
      uniqueVisitors: bigint;
    }>>`
      WITH conversions AS (
        SELECT
          'registration'::text AS kind,
          "userId",
          "eventId",
          "registeredAt" AS "conversionAt",
          NULL::numeric AS "amount"
        FROM event_registrations
        WHERE "userId" IS NOT NULL
          AND "registeredAt" >= ${from}
          AND "registeredAt" <= ${to}
          AND "status" IN ('PENDING', 'CONFIRMED')
        UNION ALL
        SELECT
          'purchase'::text AS kind,
          "userId",
          "eventId",
          "createdAt" AS "conversionAt",
          "totalAmount" AS "amount"
        FROM event_ticket_orders
        WHERE "status" = 'PAID'
          AND "createdAt" >= ${from}
          AND "createdAt" <= ${to}
      ),
      attributed AS (
        SELECT
          c.kind,
          c."userId",
          c."eventId",
          c."amount"
        FROM conversions c
        JOIN LATERAL (
          SELECT vei."createdAt" AS "touchAt"
          FROM visitor_event_interactions vei
          WHERE vei."userId" = c."userId"
            AND vei."eventId" = c."eventId"
            AND vei.type IN ('RECOMMENDATION_IMPRESSION', 'CLICK')
            AND vei.metadata @> '{"source":"recommendation"}'::jsonb
            AND vei."createdAt" <= c."conversionAt"
            AND vei."createdAt" >= c."conversionAt" - INTERVAL '7 days'
          ORDER BY vei."createdAt" DESC
          LIMIT 1
        ) touch ON TRUE
      )
      SELECT
        COUNT(*) FILTER (WHERE kind = 'registration')::bigint AS "registrationCount",
        COUNT(*) FILTER (WHERE kind = 'purchase')::bigint AS "purchaseCount",
        COALESCE(SUM(amount) FILTER (WHERE kind = 'purchase'), 0)::numeric::text AS "purchaseRevenue",
        COUNT(DISTINCT "userId")::bigint AS "uniqueVisitors"
      FROM attributed
    `,
  ]);

  const attributedRegistrations = Number(attributedConversions[0]?.registrationCount ?? 0);
  const attributedPurchases = Number(attributedConversions[0]?.purchaseCount ?? 0);
  const conversionMetrics = calculateRecommendationConversionMetrics({
    impressions,
    clicks,
    attributedRegistrations,
    attributedPurchases,
  });

  res.json({
    from,
    to,
    interactions: Object.fromEntries(rows.map((row) => [row.type, Number(row.count)])),
    recommendation: {
      impressions,
      clicks,
      ctr: impressions ? Number((clicks / impressions).toFixed(4)) : 0,
      dismissalRate: impressions ? Number((dismissals / impressions).toFixed(4)) : 0,
      notInterestedRate: impressions ? Number((notInterested / impressions).toFixed(4)) : 0,
      feedbackCount: dismissals + notInterested,
      attributedRegistrations,
      attributedPurchases,
      attributedPurchaseRevenue: Number(attributedConversions[0]?.purchaseRevenue ?? 0),
      ...conversionMetrics,
      attributionWindowDays: 7,
    },
    uniqueVisitors: Number(uniqueVisitors[0]?.count ?? 0),
    attributedVisitors: Number(attributedConversions[0]?.uniqueVisitors ?? 0),
  });
});

export default router;
