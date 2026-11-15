import { Router } from "express";
import { ParticipationStatus, Prisma, type User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireExhibitorBusinessAccess } from "../middleware/auth";
import { exhibitorBusinessIdsWithPermission, isPlatformAdmin } from "../lib/access";
import { can, exhibitorRoleToRole } from "../lib/permissions";
import type { Permission } from "../lib/permissions";
import { getEventTicketByQrPayload } from "../lib/eventTicketIssuance";
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
    const authorized: string[] = [];
    for (const businessId of [...candidates].sort()) {
      await tx.$queryRaw`SELECT "id" FROM "exhibitor_businesses" WHERE "id" = ${businessId} FOR UPDATE`;
      if (isPlatformAdmin(user)) {
        authorized.push(businessId);
        continue;
      }
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
    return participations.flatMap((p) =>
      (eventsByExhibition.get(p.exhibitionId) ?? []).map((event) => ({
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
      })),
    );
  });
  res.json({ contexts });
});

router.post("/resolve-qr", leadQrResolveRateLimit, async (req, res) => {
  const parsed = z.object({
    eventId: z.string(),
    qrPayload: z.string().trim().min(10).max(4096),
  }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid QR payload" });

  const ticket = await getEventTicketByQrPayload(parsed.data.qrPayload);
  if (!ticket || String(ticket.event_id) !== parsed.data.eventId) {
    return res.status(404).json({ error: "Ticket not found for this event" });
  }

  const result = await withCurrentLeadCaptureAccess(req.user!, async (tx, businessIds) => {
    if (!businessIds.length) return { kind: "forbidden" as const };
    const event = await tx.event.findFirst({
      where: {
        id: parsed.data.eventId,
        archivedAt: null,
        moduleEnablements: { some: { moduleType: "LEADS", enabled: true } },
      },
      select: { id: true, exhibition: { select: { id: true } } },
    });
    if (!event || !event.exhibition) return { kind: "event_unavailable" as const };
    const participation = await tx.exhibitionExhibitor.findFirst({
      where: {
        exhibitionId: event.exhibition.id,
        exhibitorBusinessId: { in: businessIds },
        status: ParticipationStatus.confirmed,
      },
      select: { id: true, exhibitorBusinessId: true },
    });
    if (!participation) return { kind: "not_participant" as const };
    const current = await tx.eventTicket.findUnique({
      where: { id: String(ticket.id) },
      select: { id: true, eventId: true, status: true, attendeeName: true, attendeeEmail: true, attendeePhone: true, ticketCode: true },
    });
    if (!current || current.eventId !== event.id || current.status !== "USED") {
      return { kind: "ticket_unavailable" as const };
    }
    return { kind: "ok" as const, ticket: current, participation };
  });

  if (result.kind === "forbidden") return res.status(403).json({ error: "You do not have permission to capture leads" });
  if (result.kind === "event_unavailable") return res.status(400).json({ error: "Event is not available for lead capture" });
  if (result.kind === "not_participant") return res.status(403).json({ error: "You are not a confirmed exhibitor for this event" });
  if (result.kind === "ticket_unavailable") return res.status(409).json({ error: "Only a checked-in ticket can be captured as a lead" });
  return res.json({
    ticket: result.ticket,
    exhibitorBusinessId: result.participation.exhibitorBusinessId,
    exhibitionExhibitorId: result.participation.id,
  });
});

export default router;
