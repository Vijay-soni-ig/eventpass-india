import { Router } from "express";
import { EventExhibitorParticipationStatus, ParticipationStatus, Prisma, type User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireExhibitorBusinessAccess } from "../middleware/auth";
import { exhibitorBusinessIdsWithPermission, isPlatformAdmin } from "../lib/access";
import { can, exhibitorRoleToRole } from "../lib/permissions";
import type { Permission } from "../lib/permissions";
import { getEventTicketByQrPayload } from "../lib/eventTicketIssuance";
import { lockOrganizerForEntitlement } from "../lib/entitlementService";
import { z } from "zod";
import { leadQrResolveRateLimit } from "../middleware/rateLimit";

const router = Router();
router.use(requireAuth, requireExhibitorBusinessAccess);

const LEAD_CAPTURE_PERMISSION: Permission = "lead:capture";

/**
 * Candidate business IDs are only a preflight. Hold each business row lock
 * while revalidating current membership and reading lead-capture data so a
 * concurrent revoke, role downgrade, or suspension cannot race the response.
 */
async function withCurrentLeadCaptureAccess<T>(
  user: User,
  operation: (tx: Prisma.TransactionClient, businessIds: string[]) => Promise<T>,
): Promise<T> {
  const candidates = await exhibitorBusinessIdsWithPermission(user, LEAD_CAPTURE_PERMISSION);
  return prisma.$transaction(async (tx) => {
    if (isPlatformAdmin(user)) return operation(tx, candidates);
    const authorized: string[] = [];
    for (const businessId of [...candidates].sort()) {
      await tx.$queryRaw`SELECT "id" FROM "exhibitor_businesses" WHERE "id" = ${businessId} FOR UPDATE`;
      const membership = await tx.exhibitorMembership.findFirst({
        where: {
          exhibitorBusinessId: businessId,
          userId: user.id,
          status: "active",
          business: { suspended: false },
        },
        select: { role: true },
      });
      if (membership && can(exhibitorRoleToRole(membership.role), LEAD_CAPTURE_PERMISSION)) {
        authorized.push(businessId);
      }
    }
    return operation(tx, authorized);
  });
}

router.get("/", async (req, res) => {
  const contexts = await withCurrentLeadCaptureAccess(req.user!, async (tx, businessIds) => {
    if (!businessIds.length) return [];
    const participations = await tx.exhibitionExhibitor.findMany({
      where: { exhibitorBusinessId: { in: businessIds }, status: ParticipationStatus.confirmed },
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
      ? await tx.event.findMany({
          where: {
            exhibition: { id: { in: exhibitionIds } },
            archivedAt: null,
            organizer: { suspended: false },
            moduleEnablements: { some: { moduleType: "LEADS", enabled: true } },
          },
          select: { id: true, title: true, status: true, exhibition: { select: { id: true } } },
          orderBy: { createdAt: "desc" },
        })
      : [];
    const eventsByExhibition = new Map<string, typeof events>();
    for (const event of events) {
      const exhibitionId = event.exhibition?.id;
      if (!exhibitionId) continue;
      const existing = eventsByExhibition.get(exhibitionId);
      if (existing) existing.push(event);
      else eventsByExhibition.set(exhibitionId, [event]);
    }
    const exhibitionContexts = participations.flatMap((p) =>
      (eventsByExhibition.get(p.exhibitionId) ?? []).map((event) => ({
        contextId: `${p.id}:${event.id}`,
        participationId: p.id,
        participationType: "EXHIBITION" as const,
        exhibitorBusinessId: p.exhibitorBusinessId,
        exhibitionExhibitorId: p.id,
        eventExhibitorParticipationId: null,
        exhibitionId: p.exhibitionId,
        exhibitionName: p.exhibition.name,
        eventId: event.id,
        eventTitle: event.title,
        eventStatus: event.status,
        business: p.business,
        stalls: p.stalls,
      })),
    );

    const eventParticipations = await tx.eventExhibitorParticipation.findMany({
      where: {
        exhibitorBusinessId: { in: businessIds },
        status: EventExhibitorParticipationStatus.CONFIRMED,
        event: {
          is: {
            archivedAt: null,
            organizer: { is: { suspended: false } },
            exhibition: { is: null },
            moduleEnablements: { some: { moduleType: "LEADS", enabled: true } },
          },
        },
      },
      select: {
        id: true,
        eventId: true,
        exhibitorBusinessId: true,
        business: { select: { id: true, companyName: true } },
        event: { select: { id: true, title: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const eventContexts = eventParticipations.map((p) => ({
      contextId: `${p.id}:${p.eventId}`,
      participationId: p.id,
      participationType: "EVENT" as const,
      exhibitorBusinessId: p.exhibitorBusinessId,
      exhibitionExhibitorId: null,
      eventExhibitorParticipationId: p.id,
      exhibitionId: null,
      exhibitionName: null,
      eventId: p.eventId,
      eventTitle: p.event.title,
      eventStatus: p.event.status,
      business: p.business,
      stalls: [],
    }));

    return [...exhibitionContexts, ...eventContexts];
  });
  res.json({ contexts });
});

router.post("/resolve-qr", leadQrResolveRateLimit, async (req, res) => {
  const parsed = z.object({
    eventId: z.string().trim().min(1),
    exhibitorBusinessId: z.string().trim().min(1),
    exhibitionExhibitorId: z.string().trim().min(1).optional(),
    eventExhibitorParticipationId: z.string().trim().min(1).optional(),
    qrPayload: z.string().trim().min(10).max(4096),
  }).refine(
    (data) => Boolean(data.exhibitionExhibitorId) !== Boolean(data.eventExhibitorParticipationId),
    { message: "Select exactly one confirmed exhibitor participation" },
  ).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid QR payload" });

  const ticket = await getEventTicketByQrPayload(parsed.data.qrPayload);
  if (!ticket || String(ticket.event_id) !== parsed.data.eventId) {
    return res.status(404).json({ error: "Ticket not found for this event" });
  }

  const result = await withCurrentLeadCaptureAccess(req.user!, async (tx, businessIds) => {
    if (!businessIds.length) return { kind: "forbidden" as const };
    const initialEvent = await tx.event.findFirst({
      where: {
        id: parsed.data.eventId,
        archivedAt: null,
        organizer: { suspended: false },
        moduleEnablements: { some: { moduleType: "LEADS", enabled: true } },
      },
      select: { id: true, organizerId: true },
    });
    if (!initialEvent) return { kind: "event_unavailable" as const };

    await lockOrganizerForEntitlement(tx, initialEvent.organizerId);
    await tx.$queryRaw`SELECT "id" FROM "events" WHERE "id" = ${initialEvent.id} FOR UPDATE`;
    const event = await tx.event.findFirst({
      where: {
        id: initialEvent.id,
        organizerId: initialEvent.organizerId,
        archivedAt: null,
        organizer: { suspended: false },
        moduleEnablements: { some: { moduleType: "LEADS", enabled: true } },
      },
      select: { id: true, exhibition: { select: { id: true } } },
    });
    if (!event) return { kind: "event_unavailable" as const };

    if (!businessIds.includes(parsed.data.exhibitorBusinessId)) {
      return { kind: "not_participant" as const };
    }

    let exhibitionExhibitorId: string | null = null;
    let eventExhibitorParticipationId: string | null = null;
    const exhibitorBusinessId = parsed.data.exhibitorBusinessId;
    if (event.exhibition) {
      if (!parsed.data.exhibitionExhibitorId || parsed.data.eventExhibitorParticipationId) {
        return { kind: "not_participant" as const };
      }
      const candidate = await tx.exhibitionExhibitor.findFirst({
        where: {
          id: parsed.data.exhibitionExhibitorId,
          exhibitionId: event.exhibition.id,
          exhibitorBusinessId,
          status: ParticipationStatus.confirmed,
        },
        select: { id: true },
      });
      if (!candidate) return { kind: "not_participant" as const };
      await tx.$queryRaw`SELECT "id" FROM "exhibition_exhibitors" WHERE "id" = ${candidate.id} FOR UPDATE`;
      const participation = await tx.exhibitionExhibitor.findFirst({
        where: {
          id: candidate.id,
          exhibitionId: event.exhibition.id,
          exhibitorBusinessId,
          status: ParticipationStatus.confirmed,
        },
        select: { id: true },
      });
      if (!participation) return { kind: "not_participant" as const };
      exhibitionExhibitorId = participation.id;
    } else {
      if (!parsed.data.eventExhibitorParticipationId || parsed.data.exhibitionExhibitorId) {
        return { kind: "not_participant" as const };
      }
      const candidate = await tx.eventExhibitorParticipation.findFirst({
        where: {
          id: parsed.data.eventExhibitorParticipationId,
          eventId: event.id,
          exhibitorBusinessId,
          status: EventExhibitorParticipationStatus.CONFIRMED,
        },
        select: { id: true },
      });
      if (!candidate) return { kind: "not_participant" as const };
      await tx.$queryRaw`SELECT "id" FROM "event_exhibitor_participations" WHERE "id" = ${candidate.id} FOR UPDATE`;
      const participation = await tx.eventExhibitorParticipation.findFirst({
        where: {
          id: candidate.id,
          eventId: event.id,
          exhibitorBusinessId,
          status: EventExhibitorParticipationStatus.CONFIRMED,
        },
        select: { id: true },
      });
      if (!participation) return { kind: "not_participant" as const };
      eventExhibitorParticipationId = participation.id;
    }

    const current = await tx.eventTicket.findFirst({
      where: {
        id: String(ticket.id),
        eventId: event.id,
        status: "USED",
        checkedInAt: { not: null },
        checkIns: { some: { eventId: event.id } },
        eventTicketOrder: {
          is: {
            status: "PAID",
            payment: { is: { status: "paid" } },
          },
        },
      },
      select: { id: true, eventId: true, status: true, attendeeName: true, attendeeEmail: true, attendeePhone: true, ticketCode: true },
    });
    if (!current) return { kind: "ticket_unavailable" as const };
    return { kind: "ok" as const, ticket: current, exhibitorBusinessId, exhibitionExhibitorId, eventExhibitorParticipationId };
  });

  if (result.kind === "forbidden") return res.status(403).json({ error: "You do not have permission to capture leads" });
  if (result.kind === "event_unavailable") return res.status(400).json({ error: "Event is not available for lead capture" });
  if (result.kind === "not_participant") return res.status(403).json({ error: "You are not a confirmed exhibitor for this event" });
  if (result.kind === "ticket_unavailable") return res.status(409).json({ error: "Only a checked-in ticket can be captured as a lead" });
  return res.json({
    ticket: result.ticket,
    exhibitorBusinessId: result.exhibitorBusinessId,
    exhibitionExhibitorId: result.exhibitionExhibitorId,
    eventExhibitorParticipationId: result.eventExhibitorParticipationId,
  });
});

export default router;
