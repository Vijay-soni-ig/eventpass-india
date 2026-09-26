import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { optionalAuth } from "../middleware/auth";
import { publicSearchRateLimit } from "../middleware/rateLimit";

const router = Router();

const interactionSchema = z.object({
  eventId: z.string().uuid(),
  type: z.enum(["VIEW", "CLICK", "SAVE", "REGISTER", "PURCHASE", "CHECK_IN", "SEARCH"]),
  sessionId: z.string().trim().min(8).max(128).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const recommendationQuerySchema = z.object({
  city: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(12).default(6),
});

const INTERACTION_WEIGHT: Record<string, number> = { VIEW: 2, CLICK: 3, SAVE: 5, REGISTER: 7, PURCHASE: 10, CHECK_IN: 8, SEARCH: 1 };

router.post("/interactions", optionalAuth, publicSearchRateLimit, async (req, res) => {
  const parsed = interactionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  if (!req.user && !parsed.data.sessionId) return res.status(400).json({ error: "sessionId is required for anonymous interactions" });
  const event = await prisma.event.findFirst({ where: { id: parsed.data.eventId, status: "PUBLISHED", visibility: "public", archivedAt: null }, select: { id: true } });
  if (!event) return res.status(404).json({ error: "Event not found" });
  await prisma.visitorEventInteraction.create({ data: { userId: req.user?.id, eventId: event.id, type: parsed.data.type, sessionId: parsed.data.sessionId, metadata: parsed.data.metadata ? JSON.parse(JSON.stringify(parsed.data.metadata)) : undefined } });
  res.status(204).send();
});

router.get("/recommendations", optionalAuth, publicSearchRateLimit, async (req, res) => {
  const parsed = recommendationQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { city, limit } = parsed.data;
  const now = new Date();
  const [history, registrations, purchases, saved] = await Promise.all([
    req.user ? prisma.visitorEventInteraction.findMany({ where: { userId: req.user.id, createdAt: { gte: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000) } }, orderBy: { createdAt: "desc" }, take: 250, select: { eventId: true, type: true, createdAt: true } }) : Promise.resolve([]),
    req.user ? prisma.eventRegistration.findMany({ where: { userId: req.user.id, status: { in: ["PENDING", "CONFIRMED"] } }, select: { eventId: true, event: { select: { categoryId: true, city: true, organizerId: true } } } }) : Promise.resolve([]),
    req.user ? prisma.eventTicketOrder.findMany({ where: { userId: req.user.id, status: "PAID" }, select: { eventId: true, event: { select: { categoryId: true, city: true, organizerId: true } } } }) : Promise.resolve([]),
    req.user ? prisma.savedExhibition.findMany({ where: { userId: req.user.id, exhibition: { eventId: { not: null } } }, select: { exhibition: { select: { eventId: true } } } }) : Promise.resolve([]),
  ]);
  const knownEventIds = new Set<string>([...registrations.map((x) => x.eventId), ...purchases.map((x) => x.eventId), ...saved.flatMap((x) => x.exhibition.eventId ? [x.exhibition.eventId] : [])]);
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
  if (history.length) {
    const historyIds = [...new Set(history.map((x) => x.eventId))];
    const historyEvents = await prisma.event.findMany({ where: { id: { in: historyIds } }, select: { id: true, categoryId: true, city: true, organizerId: true } });
    const byId = new Map(historyEvents.map((x) => [x.id, x]));
    history.forEach((item) => { const event = byId.get(item.eventId); if (event) addProfile(event, INTERACTION_WEIGHT[item.type] ?? 1); });
  }
  const preferredCity = city?.toLowerCase() || [...cityWeights.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const candidates = await prisma.event.findMany({
    where: { status: "PUBLISHED", visibility: "public", archivedAt: null, startDate: { gte: now }, exhibition: { isNot: null } },
    take: 100, orderBy: [{ startDate: "asc" }, { createdAt: "desc" }],
    include: {
      category: { select: { id: true, name: true, slug: true } },
      organizer: { select: { id: true, name: true, slug: true, logoUrl: true, kycStatus: true } },
      exhibition: { select: { id: true, ownerId: true, name: true, category: true, description: true, venue: true, city: true, latitude: true, longitude: true, startDate: true, endDate: true, coverImageUrl: true, floorPlanUrl: true, status: true, visibility: true, refundPolicy: true, terms: true, createdAt: true, updatedAt: true, ticketTypes: { where: { visible: true } } } },
    },
  });
  const scored = candidates.filter((event) => !knownEventIds.has(event.id)).map((event) => {
    let score = 0; const reasons: string[] = [];
    const categoryWeight = event.categoryId ? (categoryWeights.get(event.categoryId) ?? 0) : 0;
    if (categoryWeight > 0) { score += Math.min(categoryWeight * 1.5, 30); reasons.push("your interest in " + (event.category?.name ?? "this category")); }
    if (preferredCity && event.city?.toLowerCase() === preferredCity) { score += 18; reasons.push("events in " + event.city); }
    const organizerWeight = organizerWeights.get(event.organizerId) ?? 0;
    if (organizerWeight > 0) { score += Math.min(organizerWeight * 0.75, 10); reasons.push("an organizer you have engaged with"); }
    const daysAway = event.startDate ? Math.max(0, Math.ceil((event.startDate.getTime() - now.getTime()) / 86400000)) : 60;
    score += Math.max(0, 6 - Math.min(daysAway, 6));
    return { event, score, reason: reasons.slice(0, 2).join(" and ") || (preferredCity ? "near " + (city ?? preferredCity) : "upcoming on ExhibitTix") };
  }).sort((a, b) => b.score - a.score || a.event.startDate!.getTime() - b.event.startDate!.getTime()).slice(0, limit);
  const items = scored.map(({ event }) => ({ ...event.exhibition!, category: event.category, name: event.title, description: event.description, venue: event.venue, city: event.city, latitude: event.latitude, longitude: event.longitude, startDate: event.startDate, endDate: event.endDate, coverImageUrl: event.coverImageUrl, organizer: event.organizer, eventId: event.id }));
  res.json({ items, personalized: Boolean((req.user && (history.length || registrations.length || purchases.length || saved.length)) || preferredCity), reason: scored[0]?.reason ?? null, city: city ?? preferredCity, profile: { categoryCount: categoryWeights.size, historyEvents: knownEventIds.size } });
});

export default router;