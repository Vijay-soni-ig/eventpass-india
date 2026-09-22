import { Router } from "express";
import { ParticipationStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireExhibitorBusinessAccess } from "../middleware/auth";
import { exhibitorBusinessIdsWithPermission } from "../lib/access";
import { getEventTicketByQrPayload } from "../lib/eventTicketIssuance";
import { z } from "zod";
import { leadQrResolveRateLimit } from "../middleware/rateLimit";

const router = Router();
router.use(requireAuth, requireExhibitorBusinessAccess);

router.get("/", async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "lead:capture");
  if (!businessIds.length) return res.json({ contexts: [] });

  const participations = await prisma.exhibitionExhibitor.findMany({
    where: {
      exhibitorBusinessId: { in: businessIds },
      status: ParticipationStatus.confirmed,
    },
    select: {
      id: true,
      exhibitorBusinessId: true,
      exhibitionId: true,
      business: { select: { id: true, companyName: true } },
      exhibition: { select: { id: true, name: true, city: true, status: true } },
      stalls: { select: { id: true, code: true, status: true, exhibitionExhibitorId: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const exhibitionIds = [...new Set(participations.map((p) => p.exhibitionId))];
  const events = exhibitionIds.length
    ? await prisma.event.findMany({
        where: { exhibition: { id: { in: exhibitionIds } }, archivedAt: null },
        select: { id: true, title: true, status: true, exhibition: { select: { id: true } } },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const eventsByExhibition = new Map<string, (typeof events)>();
  for (const event of events) {
    const exhibitionId = event.exhibition?.id;
    if (!exhibitionId) continue;
    const existing = eventsByExhibition.get(exhibitionId);
    if (existing) existing.push(event);
    else eventsByExhibition.set(exhibitionId, [event]);
  }

  const contexts = participations.flatMap((p) => {
    const matchingEvents = eventsByExhibition.get(p.exhibitionId) ?? [];
    return matchingEvents.map((event) => ({
      contextId: `${p.id}:${event.id}`,
      participationId: p.id,
      exhibitorBusinessId: p.exhibitorBusinessId,
      exhibitionExhibitorId: p.id,
      exhibitionId: p.exhibitionId,
      exhibitionName: p.exhibition.name,
      eventId: event.id,
      eventTitle: event.title,
      eventStatus: event.status,
      business: p.business,
      stalls: p.stalls,
    }));
  });

  res.json({ contexts });
});

router.post("/resolve-qr", leadQrResolveRateLimit, async (req, res) => {
  const parsed = z.object({
    eventId: z.string(),
    qrPayload: z.string().trim().min(10).max(4096),
  }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid QR payload" });

  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "lead:capture");
  if (!businessIds.length) return res.status(403).json({ error: "You do not have permission to capture leads" });

  const ticket = await getEventTicketByQrPayload(parsed.data.qrPayload);
  if (!ticket || String(ticket.event_id) !== parsed.data.eventId) {
    return res.status(404).json({ error: "Ticket not found for this event" });
  }

  const event = await prisma.event.findUnique({
    where: { id: parsed.data.eventId },
    select: { id: true, archivedAt: true, exhibition: { select: { id: true } } },
  });
  if (!event || event.archivedAt || !event.exhibition) return res.status(400).json({ error: "Event is not available for lead capture" });

  const participation = await prisma.exhibitionExhibitor.findFirst({
    where: {
      exhibitionId: event.exhibition.id,
      exhibitorBusinessId: { in: businessIds },
      status: ParticipationStatus.confirmed,
    },
    select: { id: true, exhibitorBusinessId: true },
  });
  if (!participation) return res.status(403).json({ error: "You are not a confirmed exhibitor for this event" });

  const current = await prisma.eventTicket.findUnique({
    where: { id: String(ticket.id) },
    select: { id: true, status: true, attendeeName: true, attendeeEmail: true, attendeePhone: true, ticketCode: true },
  });
  if (!current || current.status !== "USED") {
    return res.status(409).json({ error: "Only a checked-in ticket can be captured as a lead" });
  }

  return res.json({
    ticket: current,
    exhibitorBusinessId: participation.exhibitorBusinessId,
    exhibitionExhibitorId: participation.id,
  });
});

export default router;
