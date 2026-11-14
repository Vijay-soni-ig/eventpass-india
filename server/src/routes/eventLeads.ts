import { Router } from "express";
import { ParticipationStatus } from "@prisma/client";
import type { Prisma, User } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { exhibitorBusinessIdsWithPermission, organizerIdsWithPermission } from "../lib/access";
import { can, exhibitorRoleToRole, organizerRoleToRole } from "../lib/permissions";
import { logAudit } from "../lib/audit";
import { leadMutationRateLimit } from "../middleware/rateLimit";

const router = Router();
router.use(requireAuth);

const leadInclude = {
  event: { select: { id: true, title: true, organizerId: true, eventType: true } },
  exhibitorBusiness: { select: { id: true, companyName: true } },
  exhibitionExhibitor: { select: { id: true, exhibitionId: true, status: true, business: { select: { id: true, companyName: true } } } },
  stall: { select: { id: true, code: true, status: true } },
  visitorUser: { select: { id: true, fullName: true, email: true, phone: true } },
  registration: { select: { id: true, status: true, fullName: true, email: true } },
  ticket: { select: { id: true, ticketCode: true, status: true, attendeeName: true, attendeeEmail: true } },
  assignedToUser: { select: { id: true, fullName: true, email: true } },
  capturedByUser: { select: { id: true, fullName: true, email: true } },
  interactions: { orderBy: { createdAt: "desc" as const }, take: 20, include: { createdByUser: { select: { id: true, fullName: true, email: true } } } },
  followUps: { orderBy: { dueAt: "asc" as const }, include: { assignedToUser: { select: { id: true, fullName: true, email: true } } } },
};

const listSchema = z.object({
  eventId: z.string().optional(),
  exhibitorBusinessId: z.string().optional(),
  status: z.enum(["NEW","CONTACTED","INTERESTED","QUALIFIED","NEGOTIATION","CONVERTED","LOST","ARCHIVED"]).optional(),
  priority: z.enum(["LOW","MEDIUM","HIGH"]).optional(),
  source: z.enum(["QR_SCAN","MANUAL","REGISTRATION","TICKET_CHECK_IN","IMPORT"]).optional(),
  assignedToUserId: z.string().optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

async function authorizedEventIds(userId: string, permission: "lead:view" | "lead:capture" | "lead:manage") {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const organizerIds = await organizerIdsWithPermission(user, permission);
  // Resolve organizer and exhibitor permissions independently. In particular,
  // lead:manage must never fall back to lead:capture: exhibitor staff are
  // intentionally allowed to capture/view leads but not manage them.
  const exhibitorIds = await exhibitorBusinessIdsWithPermission(user, permission);
  // Avoid issuing an unscoped event query when this caller has no tenant
  // grant for the requested permission (notably exhibitor staff requesting
  // lead:manage). An empty Prisma OR must never be treated as an open scope.
  if (organizerIds.length === 0 && exhibitorIds.length === 0) {
    return {
      organizerIds,
      exhibitorIds,
      organizerEventIds: [],
      exhibitorEventIds: [],
      eventIds: [],
      user,
    };
  }
  const events = await prisma.event.findMany({
    where: {
      OR: [
        ...(organizerIds.length ? [{ organizerId: { in: organizerIds } }] : []),
        ...(exhibitorIds.length ? [{ exhibition: { exhibitionExhibitors: { some: { exhibitorBusinessId: { in: exhibitorIds }, status: ParticipationStatus.confirmed } } } }] : []),
      ],
      archivedAt: null,
      moduleEnablements: { some: { moduleType: "LEADS", enabled: true } },
    },
    select: { id: true, organizerId: true, exhibition: { select: { exhibitionExhibitors: { where: { exhibitorBusinessId: { in: exhibitorIds }, status: ParticipationStatus.confirmed }, select: { exhibitorBusinessId: true } } } } },
  });
  const organizerEventIds = events.filter((event) => organizerIds.includes(event.organizerId)).map((event) => event.id);
  const exhibitorEventIds = events.filter((event) => event.exhibition?.exhibitionExhibitors.length).map((event) => event.id);
  return {
    organizerIds,
    exhibitorIds,
    organizerEventIds,
    exhibitorEventIds,
    eventIds: [...new Set([...organizerEventIds, ...exhibitorEventIds])],
    user,
  };
}

function leadAccessWhere(scope: Awaited<ReturnType<typeof authorizedEventIds>>) {
  const OR = [
    ...(scope.organizerEventIds.length ? [{ eventId: { in: scope.organizerEventIds } }] : []),
    ...(scope.exhibitorEventIds.length && scope.exhibitorIds.length
      ? [{ eventId: { in: scope.exhibitorEventIds }, exhibitorBusinessId: { in: scope.exhibitorIds } }]
      : []),
  ];
  // Prisma's empty OR has surprising no-filter behavior in some query
  // compositions. Make the deny-by-default case explicit and impossible.
  if (OR.length === 0) return { id: "__unauthorized_event_lead_scope__" };
  return { OR };
}

async function assertEventAccess(userId: string, eventId: string, permission: "lead:view" | "lead:capture" | "lead:manage") {
  const scope = await authorizedEventIds(userId, permission);
  if (!scope.eventIds.includes(eventId)) return null;
  return scope;
}

/**
 * Serialize every Event Lead management mutation against tenant membership
 * changes. Tenant parent rows are locked in a stable order (business, then
 * organizer), and current membership/role/suspension/module/participation
 * state is re-read before the callback writes.
 */
async function withCurrentLeadManageAccess<T>(
  user: User,
  leadId: string,
  operation: (tx: Prisma.TransactionClient, lead: Prisma.EventLeadGetPayload<{}>) => Promise<T>,
) {
  return prisma.$transaction(async (tx) => {
    const initial = await tx.eventLead.findUnique({
      where: { id: leadId },
      select: { id: true, eventId: true, exhibitorBusinessId: true },
    });
    if (!initial) return { kind: "not_found" as const };

    const event = await tx.event.findUnique({
      where: { id: initial.eventId },
      select: { id: true, organizerId: true, archivedAt: true, exhibition: { select: { id: true } } },
    });
    if (!event) return { kind: "not_found" as const };

    if (initial.exhibitorBusinessId) {
      await tx.$queryRaw`SELECT "id" FROM "exhibitor_businesses" WHERE "id" = ${initial.exhibitorBusinessId} FOR UPDATE`;
    }
    await tx.$queryRaw`SELECT "id" FROM "organizers" WHERE "id" = ${event.organizerId} FOR UPDATE`;

    const [organizerMembership, exhibitorMembership] = await Promise.all([
      tx.organizerMembership.findFirst({
        where: { userId: user.id, organizerId: event.organizerId, status: "active", organizer: { suspended: false } },
        select: { role: true },
      }),
      initial.exhibitorBusinessId
        ? tx.exhibitorMembership.findFirst({
            where: { userId: user.id, exhibitorBusinessId: initial.exhibitorBusinessId, status: "active", business: { suspended: false } },
            select: { role: true },
          })
        : Promise.resolve(null),
    ]);

    const isAdmin = user.platformRole === "super_admin";
    const organizerAllowed = !!organizerMembership && can(
      ({ owner: "ORGANIZER_OWNER", admin: "ORGANIZER_ADMIN", operations: "ORGANIZER_OPERATIONS", finance: "ORGANIZER_FINANCE", marketing: "ORGANIZER_MARKETING", scanner: "ORGANIZER_SCANNER" } as const)[organizerMembership.role],
      "lead:manage",
    );
    const exhibitorAllowed = !!exhibitorMembership && can(exhibitorRoleToRole(exhibitorMembership.role), "lead:manage");
    if (!isAdmin && !organizerAllowed && !exhibitorAllowed) return { kind: "not_found" as const };

    const currentLead = await tx.eventLead.findUnique({ where: { id: leadId } });
    if (!currentLead) return { kind: "not_found" as const };
    const currentEvent = await tx.event.findFirst({
      where: {
        id: currentLead.eventId,
        archivedAt: null,
        moduleEnablements: { some: { moduleType: "LEADS", enabled: true } },
      },
      select: { id: true, exhibition: { select: { id: true } } },
    });
    if (!currentEvent) return { kind: "not_found" as const };
    if (!isAdmin && !organizerAllowed) {
      if (!currentLead.exhibitorBusinessId || !exhibitorAllowed || !currentEvent.exhibition) {
        return { kind: "not_found" as const };
      }
      const participation = await tx.exhibitionExhibitor.findFirst({
        where: {
          exhibitionId: currentEvent.exhibition.id,
          exhibitorBusinessId: currentLead.exhibitorBusinessId,
          status: ParticipationStatus.confirmed,
        },
        select: { id: true },
      });
      if (!participation) return { kind: "not_found" as const };
    }
    const value = await operation(tx, currentLead);
    return { kind: "ok" as const, value };
  });
}

/**
 * Ticket-based exhibitor capture is a sensitive write: serialize it against
 * membership changes, then re-read the membership, business suspension,
 * event module, participation, ticket and assignee inside the write transaction.
 */
async function createTicketLeadWithCurrentAccess(
  user: User,
  data: {
    eventId: string;
    ticketId: string;
    exhibitorBusinessId: string;
    exhibitionExhibitorId?: string;
    stallId?: string;
    priority: "LOW" | "MEDIUM" | "HIGH";
    notes?: string;
    assignedToUserId?: string;
    visitorName: string;
    visitorEmail: string | null;
    visitorPhone: string | null;
    visitorUserId: string | null;
  },
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "exhibitor_businesses" WHERE "id" = ${data.exhibitorBusinessId} FOR UPDATE`;

    const membership = await tx.exhibitorMembership.findFirst({
      where: {
        userId: user.id,
        exhibitorBusinessId: data.exhibitorBusinessId,
        status: "active",
        business: { suspended: false },
      },
      select: { role: true },
    });
    if (!membership || !can(exhibitorRoleToRole(membership.role), "lead:capture")) {
      return { kind: "forbidden" as const };
    }

    const event = await tx.event.findFirst({
      where: {
        id: data.eventId,
        archivedAt: null,
        moduleEnablements: { some: { moduleType: "LEADS", enabled: true } },
      },
      select: { id: true, exhibition: { select: { id: true } } },
    });
    if (!event?.exhibition) return { kind: "invalid_event" as const };

    const participation = data.exhibitionExhibitorId
      ? await tx.exhibitionExhibitor.findFirst({
          where: {
            id: data.exhibitionExhibitorId,
            exhibitionId: event.exhibition.id,
            exhibitorBusinessId: data.exhibitorBusinessId,
            status: ParticipationStatus.confirmed,
          },
          select: { id: true },
        })
      : await tx.exhibitionExhibitor.findFirst({
          where: {
            exhibitionId: event.exhibition.id,
            exhibitorBusinessId: data.exhibitorBusinessId,
            status: ParticipationStatus.confirmed,
          },
          select: { id: true },
        });
    if (!participation) return { kind: "invalid_participation" as const };

    const ticket = await tx.eventTicket.findFirst({
      where: { id: data.ticketId, eventId: event.id, status: "USED" },
      select: { id: true },
    });
    if (!ticket) return { kind: "invalid_ticket" as const };

    if (data.stallId) {
      const stall = await tx.stall.findFirst({
        where: { id: data.stallId, exhibitionId: event.exhibition.id, exhibitionExhibitorId: participation.id },
        select: { id: true },
      });
      if (!stall) return { kind: "invalid_stall" as const };
    }

    if (data.assignedToUserId) {
      const assignee = await tx.exhibitorMembership.findFirst({
        where: {
          userId: data.assignedToUserId,
          exhibitorBusinessId: data.exhibitorBusinessId,
          status: "active",
          business: { suspended: false },
        },
        select: { id: true },
      });
      if (!assignee) return { kind: "invalid_assignee" as const };
    }

    const lead = await tx.eventLead.create({
      data: {
        eventId: data.eventId,
        exhibitorBusinessId: data.exhibitorBusinessId,
        exhibitionExhibitorId: participation.id,
        stallId: data.stallId,
        visitorUserId: data.visitorUserId,
        ticketId: ticket.id,
        visitorName: data.visitorName,
        visitorEmail: data.visitorEmail,
        visitorPhone: data.visitorPhone,
        source: "TICKET_CHECK_IN",
        priority: data.priority,
        notes: data.notes,
        assignedToUserId: data.assignedToUserId,
        capturedByUserId: user.id,
      },
      select: { id: true },
    });
    return { kind: "created" as const, leadId: lead.id };
  });
}

const createSchema = z.object({
  eventId: z.string(),
  exhibitorBusinessId: z.string().optional(),
  exhibitionExhibitorId: z.string().optional(),
  stallId: z.string().optional(),
  visitorUserId: z.string().optional(),
  registrationId: z.string().optional(),
  ticketId: z.string().optional(),
  visitorName: z.string().trim().min(1).max(200),
  visitorEmail: z.string().email().optional(),
  visitorPhone: z.string().trim().max(40).optional(),
  companyName: z.string().trim().max(200).optional(),
  source: z.enum(["QR_SCAN","MANUAL","REGISTRATION","TICKET_CHECK_IN","IMPORT"]).default("MANUAL"),
  priority: z.enum(["LOW","MEDIUM","HIGH"]).default("MEDIUM"),
  notes: z.string().trim().max(5000).optional(),
  assignedToUserId: z.string().optional(),
});

router.get("/", async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { eventId, exhibitorBusinessId, status, priority, source, assignedToUserId, search, page, pageSize } = parsed.data;
  const scope = await authorizedEventIds(req.user!.id, "lead:view");
  if (!scope.eventIds.length) return res.json({ leads: [], pagination: { page, pageSize, total: 0, totalPages: 0 } });

  const where = {
    AND: [
      leadAccessWhere(scope),
      { eventId: eventId && scope.eventIds.includes(eventId) ? eventId : eventId ? "__unauthorized__" : { in: scope.eventIds } },
      ...(exhibitorBusinessId
        ? [{ exhibitorBusinessId: scope.organizerEventIds.some((id) => !eventId || id === eventId) || scope.exhibitorIds.includes(exhibitorBusinessId) ? exhibitorBusinessId : "__unauthorized__" }]
        : []),
      ...(status ? [{ status }] : []),
      ...(priority ? [{ priority }] : []),
      ...(source ? [{ source }] : []),
      ...(assignedToUserId ? [{ assignedToUserId }] : []),
      ...(search ? [{ OR: [
        { visitorName: { contains: search, mode: "insensitive" as const } },
        { visitorEmail: { contains: search, mode: "insensitive" as const } },
        { visitorPhone: { contains: search, mode: "insensitive" as const } },
        { companyName: { contains: search, mode: "insensitive" as const } },
      ] }] : []),
    ],
  };
  const [total, leads] = await prisma.$transaction([
    prisma.eventLead.count({ where }),
    prisma.eventLead.findMany({ where, include: leadInclude, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  res.json({ leads, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
});

const ticketLeadCaptureSchema = z.object({
  eventId: z.string(),
  ticketId: z.string(),
  exhibitorBusinessId: z.string(),
  exhibitionExhibitorId: z.string().optional(),
  stallId: z.string().optional(),
  priority: z.enum(["LOW","MEDIUM","HIGH"]).default("MEDIUM"),
  notes: z.string().trim().max(5000).optional(),
  assignedToUserId: z.string().optional(),
});

router.post("/from-ticket", leadMutationRateLimit, async (req, res) => {
  const parsed = ticketLeadCaptureSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid lead capture request" });

  const data = parsed.data;
  const scope = await assertEventAccess(req.user!.id, data.eventId, "lead:capture");
  if (!scope || !scope.exhibitorIds.includes(data.exhibitorBusinessId)) {
    return res.status(403).json({ error: "You do not have permission to capture leads for this exhibitor" });
  }

  const ticket = await prisma.eventTicket.findFirst({
    where: { id: data.ticketId, eventId: data.eventId, status: "USED" },
    select: { id: true, userId: true, attendeeName: true, attendeeEmail: true, attendeePhone: true },
  });
  if (!ticket) return res.status(400).json({ error: "Only a checked-in ticket for this event can be captured as a lead" });

  let result;
  try {
    result = await createTicketLeadWithCurrentAccess(req.user!, {
      ...data,
      visitorName: ticket.attendeeName,
      visitorEmail: ticket.attendeeEmail,
      visitorPhone: ticket.attendeePhone,
      visitorUserId: ticket.userId,
    });
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    const existing = await prisma.eventLead.findFirst({
      where: { eventId: data.eventId, exhibitorBusinessId: data.exhibitorBusinessId, ticketId: data.ticketId },
      select: { id: true },
    });
    if (!existing) return res.status(409).json({ error: "Lead capture conflicted; please retry" });
    return res.status(200).json({ leadId: existing.id, duplicate: true });
  }

  if (result.kind === "forbidden") return res.status(403).json({ error: "Exhibitor access changed. Refresh and try again." });
  if (result.kind === "invalid_event") return res.status(400).json({ error: "Event is not available for lead capture" });
  if (result.kind === "invalid_participation") return res.status(403).json({ error: "You are not a confirmed exhibitor for this event" });
  if (result.kind === "invalid_ticket") return res.status(400).json({ error: "Only a checked-in ticket for this event can be captured as a lead" });
  if (result.kind === "invalid_stall") return res.status(400).json({ error: "Lead stall is invalid for this exhibitor" });
  if (result.kind === "invalid_assignee") return res.status(400).json({ error: "Assigned user must belong to the exhibitor business" });

  const lead = await prisma.eventLead.findUnique({ where: { id: result.leadId }, include: leadInclude });
  if (!lead) return res.status(500).json({ error: "Lead was created but could not be loaded" });

  await logAudit({
    actorUserId: req.user!.id,
    action: "event_lead.captured_from_ticket",
    entityType: "EventLead",
    entityId: lead.id,
    metadata: { eventId: data.eventId, ticketId: data.ticketId, exhibitorBusinessId: data.exhibitorBusinessId },
  });

  return res.status(201).json({ lead, duplicate: false });
});

router.get("/:id", async (req, res) => {
  const scope = await authorizedEventIds(req.user!.id, "lead:view");
  const lead = scope.eventIds.length
    ? await prisma.eventLead.findFirst({
        where: {
          AND: [
            { id: req.params.id },
            leadAccessWhere(scope),
          ],
        },
        include: leadInclude,
      })
    : null;
  if (!lead) return res.status(404).json({ error: "Lead not found" });
  res.json({ lead });
});

router.post("/", leadMutationRateLimit, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const data = parsed.data;
  const scope = await assertEventAccess(req.user!.id, data.eventId, "lead:manage");
  if (!scope) return res.status(403).json({ error: "You do not have permission to capture leads for this event" });

  if (data.exhibitorBusinessId && !scope.exhibitorIds.includes(data.exhibitorBusinessId) && !scope.organizerEventIds.includes(data.eventId)) {
    return res.status(403).json({ error: "You do not have access to this exhibitor business" });
  }

  const event = await prisma.event.findUnique({
    where: { id: data.eventId },
    select: { id: true, organizerId: true, exhibition: { select: { id: true } } },
  });
  if (!event) return res.status(404).json({ error: "Event not found" });

  let participation = data.exhibitionExhibitorId ? await prisma.exhibitionExhibitor.findUnique({ where: { id: data.exhibitionExhibitorId }, select: { id: true, exhibitionId: true, exhibitorBusinessId: true, status: true } }) : null;
  if (data.exhibitionExhibitorId && (!participation || participation.status !== ParticipationStatus.confirmed || event.exhibition?.id !== participation.exhibitionId)) {
    return res.status(400).json({ error: "Lead exhibitor participation is invalid for this event" });
  }
  if (data.exhibitorBusinessId && participation && participation.exhibitorBusinessId !== data.exhibitorBusinessId) {
    return res.status(400).json({ error: "Exhibitor business does not match participation" });
  }
  const leadBusinessId = data.exhibitorBusinessId ?? participation?.exhibitorBusinessId;

  // A lead linked to an exhibitor must belong to a confirmed participant in
  // this event's exhibition. Organizer access to an event must not allow
  // arbitrary businesses (or another event's exhibitors) to be attached.
  if (leadBusinessId) {
    if (!event.exhibition?.id) {
      return res.status(400).json({ error: "Exhibitor leads require an exhibition event" });
    }
    if (!participation) {
      participation = await prisma.exhibitionExhibitor.findFirst({
        where: {
          exhibitionId: event.exhibition.id,
          exhibitorBusinessId: leadBusinessId,
          status: ParticipationStatus.confirmed,
        },
        select: { id: true, exhibitionId: true, exhibitorBusinessId: true, status: true },
      });
    }
    if (
      !participation ||
      participation.status !== ParticipationStatus.confirmed ||
      participation.exhibitionId !== event.exhibition.id ||
      participation.exhibitorBusinessId !== leadBusinessId
    ) {
      return res.status(400).json({ error: "Lead exhibitor must have confirmed participation in this event" });
    }
  }

  if (!scope.organizerEventIds.includes(data.eventId) && (!leadBusinessId || !scope.exhibitorIds.includes(leadBusinessId))) {
    return res.status(403).json({ error: "Exhibitors may only create leads for their own business on events they do not organize" });
  }
  if (data.stallId) {
    const stall = await prisma.stall.findUnique({ where: { id: data.stallId }, select: { id: true, exhibitionId: true, exhibitionExhibitorId: true } });
    if (!stall || !event.exhibition?.id || stall.exhibitionId !== event.exhibition.id || (participation && stall.exhibitionExhibitorId !== participation.id)) {
      return res.status(400).json({ error: "Lead stall is invalid for this event" });
    }
  }
  if (data.registrationId) {
    const registration = await prisma.eventRegistration.findUnique({ where: { id: data.registrationId }, select: { id: true, eventId: true, userId: true, fullName: true, email: true, phone: true } });
    if (!registration || registration.eventId !== data.eventId) return res.status(400).json({ error: "Registration does not belong to this event" });
    if (data.visitorUserId && registration.userId && registration.userId !== data.visitorUserId) {
      return res.status(400).json({ error: "Visitor account does not match the event registration" });
    }
  }
  if (data.ticketId) {
    const ticket = await prisma.eventTicket.findUnique({ where: { id: data.ticketId }, select: { id: true, eventId: true, userId: true, attendeeName: true, attendeeEmail: true, attendeePhone: true, status: true } });
    if (!ticket || ticket.eventId !== data.eventId || ticket.status === "REFUNDED" || ticket.status === "CANCELLED") return res.status(400).json({ error: "Ticket is invalid for this event" });
    if (data.visitorUserId && ticket.userId && ticket.userId !== data.visitorUserId) {
      return res.status(400).json({ error: "Visitor account does not match the event ticket" });
    }
  }

  if (data.visitorUserId) {
    const visitor = await prisma.user.findUnique({
      where: { id: data.visitorUserId },
      select: { id: true, userType: true },
    });
    if (!visitor || visitor.userType !== "visitor") {
      return res.status(400).json({ error: "Visitor account must reference an existing visitor user" });
    }
  }

  const duplicate = data.ticketId || data.registrationId
    ? await prisma.eventLead.findFirst({ where: { eventId: data.eventId, exhibitorBusinessId: leadBusinessId, OR: [{ ticketId: data.ticketId ?? undefined }, { registrationId: data.registrationId ?? undefined }] } })
    : null;
  if (duplicate) return res.status(409).json({ error: "A lead already exists for this visitor/source", leadId: duplicate.id });

  const leadBusinessId = data.exhibitorBusinessId ?? participation?.exhibitorBusinessId;
  const lead = await prisma.$transaction(async (tx) => {
    if (leadBusinessId) {
      await tx.$queryRaw`SELECT "id" FROM "exhibitor_businesses" WHERE "id" = ${leadBusinessId} FOR UPDATE`;
    }
    await tx.$queryRaw`SELECT "id" FROM "organizers" WHERE "id" = ${event.organizerId} FOR UPDATE`;

    const [organizerMembership, exhibitorMembership] = await Promise.all([
      tx.organizerMembership.findFirst({
        where: { userId: req.user!.id, organizerId: event.organizerId, status: "active", organizer: { suspended: false } },
        select: { role: true },
      }),
      leadBusinessId ? tx.exhibitorMembership.findFirst({
        where: { userId: req.user!.id, exhibitorBusinessId: leadBusinessId, status: "active", business: { suspended: false } },
        select: { role: true },
      }) : null,
    ]);
    const platformAdmin = req.user!.platformRole === "super_admin";
    const organizerAllowed = !!organizerMembership && can(organizerRoleToRole(organizerMembership.role), "lead:manage");
    const exhibitorAllowed = !!exhibitorMembership && can(exhibitorRoleToRole(exhibitorMembership.role), "lead:manage");
    if (!platformAdmin && !organizerAllowed && !exhibitorAllowed) return null;

    const currentEvent = await tx.event.findFirst({
      where: {
        id: data.eventId,
        organizerId: event.organizerId,
        archivedAt: null,
        moduleEnablements: { some: { moduleType: "LEADS", enabled: true } },
      },
      select: { id: true, exhibition: { select: { id: true } } },
    });
    if (!currentEvent) return null;

    let currentParticipation = null;
    if (leadBusinessId) {
      if (!currentEvent.exhibition) return null;
      currentParticipation = await tx.exhibitionExhibitor.findFirst({
        where: {
          ...(data.exhibitionExhibitorId ? { id: data.exhibitionExhibitorId } : {}),
          exhibitionId: currentEvent.exhibition.id,
          exhibitorBusinessId: leadBusinessId,
          status: ParticipationStatus.confirmed,
        },
        select: { id: true },
      });
      if (!currentParticipation) return null;
      if (!platformAdmin && !organizerAllowed && !exhibitorAllowed) return null;
    }
    if (!organizerAllowed && !platformAdmin && (!leadBusinessId || !exhibitorAllowed)) return null;

    if (data.stallId) {
      const stall = await tx.stall.findFirst({
        where: { id: data.stallId, exhibitionId: currentEvent.exhibition?.id ?? "__none__", exhibitionExhibitorId: currentParticipation?.id },
        select: { id: true },
      });
      if (!stall) return null;
    }
    if (data.assignedToUserId) {
      const [businessAssignee, organizerAssignee] = await Promise.all([
        leadBusinessId ? tx.exhibitorMembership.findFirst({
          where: { userId: data.assignedToUserId, exhibitorBusinessId: leadBusinessId, status: "active", business: { suspended: false } },
          select: { id: true },
        }) : null,
        tx.organizerMembership.findFirst({
          where: { userId: data.assignedToUserId, organizerId: event.organizerId, status: "active", organizer: { suspended: false } },
          select: { id: true },
        }),
      ]);
      if (!businessAssignee && !organizerAssignee) return null;
    }
    const duplicateInTransaction = data.ticketId || data.registrationId
      ? await tx.eventLead.findFirst({
          where: {
            eventId: data.eventId,
            exhibitorBusinessId: leadBusinessId,
            OR: [
              ...(data.ticketId ? [{ ticketId: data.ticketId }] : []),
              ...(data.registrationId ? [{ registrationId: data.registrationId }] : []),
            ],
          },
          select: { id: true },
        })
      : null;
    if (duplicateInTransaction) return null;

    return tx.eventLead.create({
      data: {
        eventId: data.eventId,
        exhibitorBusinessId: leadBusinessId,
        exhibitionExhibitorId: currentParticipation?.id,
        stallId: data.stallId,
        visitorUserId: data.visitorUserId,
        registrationId: data.registrationId,
        ticketId: data.ticketId,
        visitorName: data.visitorName,
        visitorEmail: data.visitorEmail,
        visitorPhone: data.visitorPhone,
        companyName: data.companyName,
        source: data.source,
        priority: data.priority,
        notes: data.notes,
        assignedToUserId: data.assignedToUserId,
        capturedByUserId: req.user!.id,
      },
      include: leadInclude,
    });
  });
  if (!lead) return res.status(403).json({ error: "Access changed or lead data is no longer valid. Refresh and try again." });

  await logAudit({ actorUserId: req.user!.id, action: "event_lead.created", entityType: "EventLead", entityId: lead.id, metadata: { eventId: data.eventId, source: data.source } });
  res.status(201).json({ lead });
});

const updateSchema = z.object({
  status: z.enum(["NEW","CONTACTED","INTERESTED","QUALIFIED","NEGOTIATION","CONVERTED","LOST"]).optional(),
  priority: z.enum(["LOW","MEDIUM","HIGH"]).optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  assignedToUserId: z.string().nullable().optional(),
  companyName: z.string().trim().max(200).nullable().optional(),
  followUpDate: z.coerce.date().nullable().optional(),
});

router.patch("/:id", leadMutationRateLimit, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  if (parsed.data.status === "ARCHIVED") return res.status(400).json({ error: "ARCHIVED must use the dedicated archive endpoint" });
  const result = await withCurrentLeadManageAccess(req.user!, req.params.id, async (tx, existing) => {
    if (existing.archivedAt || existing.status === "ARCHIVED") return { kind: "archived" as const };
    if (parsed.data.assignedToUserId) {
      const event = await tx.event.findUniqueOrThrow({ where: { id: existing.eventId }, select: { organizerId: true } });
      const [exhibitorAssignee, organizerAssignee] = await Promise.all([
        existing.exhibitorBusinessId ? tx.exhibitorMembership.findFirst({
          where: { userId: parsed.data.assignedToUserId, exhibitorBusinessId: existing.exhibitorBusinessId, status: "active", business: { suspended: false } },
          select: { id: true },
        }) : null,
        tx.organizerMembership.findFirst({
          where: { userId: parsed.data.assignedToUserId, organizerId: event.organizerId, status: "active", organizer: { suspended: false } },
          select: { id: true },
        }),
      ]);
      if (!exhibitorAssignee && !organizerAssignee) return { kind: "invalid_assignee" as const };
    }
    const lead = await tx.eventLead.update({
      where: { id: existing.id },
      data: {
        status: parsed.data.status,
        priority: parsed.data.priority,
        notes: parsed.data.notes === undefined ? undefined : parsed.data.notes,
        assignedToUserId: parsed.data.assignedToUserId === undefined ? undefined : parsed.data.assignedToUserId,
        companyName: parsed.data.companyName === undefined ? undefined : parsed.data.companyName,
      },
      include: leadInclude,
    });
    return { kind: "updated" as const, lead, previousStatus: existing.status };
  });
  if (result.kind === "not_found") return res.status(404).json({ error: "Lead not found" });
  if (result.kind === "ok" && result.value.kind === "archived") return res.status(409).json({ error: "Archived leads cannot be updated" });
  if (result.kind === "ok" && result.value.kind === "invalid_assignee") return res.status(400).json({ error: "Assigned user must belong to the event organizer or lead exhibitor business" });
  if (result.kind !== "ok" || result.value.kind !== "updated") return res.status(404).json({ error: "Lead not found" });
  const { lead, previousStatus } = result.value;
  if (parsed.data.status && parsed.data.status !== previousStatus) await logAudit({ actorUserId: req.user!.id, action: "event_lead.status_changed", entityType: "EventLead", entityId: lead.id, metadata: { from: previousStatus, to: parsed.data.status } });
  res.json({ lead });
});

router.delete("/:id", leadMutationRateLimit, async (req, res) => {
  const result = await withCurrentLeadManageAccess(req.user!, req.params.id, async (tx, existing) => {
    if (existing.archivedAt || existing.status === "ARCHIVED") return { kind: "archived" as const };
    const lead = await tx.eventLead.update({
      where: { id: existing.id },
      data: { status: "ARCHIVED", archivedAt: new Date() },
      include: leadInclude,
    });
    return { kind: "archived_now" as const, lead };
  });
  if (result.kind === "not_found") return res.status(404).json({ error: "Lead not found" });
  if (result.kind !== "ok" || result.value.kind !== "archived_now") return res.status(409).json({ error: "Lead is already archived" });
  await logAudit({ actorUserId: req.user!.id, action: "event_lead.archived", entityType: "EventLead", entityId: result.value.lead.id });
  res.json({ lead: result.value.lead });
});

const interactionSchema = z.object({ type: z.enum(["NOTE","CALL","EMAIL","WHATSAPP","MEETING","OTHER"]).default("NOTE"), note: z.string().trim().min(1).max(5000) });
router.post("/:id/interactions", leadMutationRateLimit, async (req, res) => {
  const parsed = interactionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const result = await withCurrentLeadManageAccess(req.user!, req.params.id, async (tx, lead) => {
    if (lead.archivedAt || lead.status === "ARCHIVED") return { kind: "archived" as const };
    const interaction = await tx.eventLeadInteraction.create({
      data: { leadId: lead.id, type: parsed.data.type, note: parsed.data.note, createdByUserId: req.user!.id },
      include: { createdByUser: { select: { id: true, fullName: true, email: true } } },
    });
    return { kind: "created" as const, interaction };
  });
  if (result.kind === "not_found") return res.status(404).json({ error: "Lead not found" });
  if (result.kind !== "ok" || result.value.kind !== "created") return res.status(409).json({ error: "Archived leads cannot receive interactions" });
  await logAudit({ actorUserId: req.user!.id, action: "event_lead.interaction_added", entityType: "EventLead", entityId: req.params.id, metadata: { type: parsed.data.type } });
  res.status(201).json({ interaction: result.value.interaction });
});

const followUpSchema = z.object({ assignedToUserId: z.string(), dueAt: z.coerce.date(), note: z.string().trim().max(2000).optional() });
router.post("/:id/follow-ups", leadMutationRateLimit, async (req, res) => {
  const parsed = followUpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const result = await withCurrentLeadManageAccess(req.user!, req.params.id, async (tx, lead) => {
    if (lead.archivedAt || lead.status === "ARCHIVED") return { kind: "archived" as const };
    if (!lead.exhibitorBusinessId) return { kind: "invalid_assignee" as const };
    const assigned = await tx.exhibitorMembership.findFirst({
      where: { userId: parsed.data.assignedToUserId, exhibitorBusinessId: lead.exhibitorBusinessId, status: "active", business: { suspended: false } },
      select: { userId: true },
    });
    if (!assigned) return { kind: "invalid_assignee" as const };
    const followUp = await tx.eventLeadFollowUp.create({
      data: { leadId: lead.id, assignedToUserId: parsed.data.assignedToUserId, dueAt: parsed.data.dueAt, note: parsed.data.note },
      include: { assignedToUser: { select: { id: true, fullName: true, email: true } } },
    });
    return { kind: "created" as const, followUp };
  });
  if (result.kind === "not_found") return res.status(404).json({ error: "Lead not found" });
  if (result.kind !== "ok" || result.value.kind === "archived") return res.status(409).json({ error: "Archived leads cannot receive follow-ups" });
  if (result.value.kind === "invalid_assignee") return res.status(400).json({ error: "Assigned user must belong to the lead exhibitor business" });
  await logAudit({ actorUserId: req.user!.id, action: "event_lead.follow_up_created", entityType: "EventLead", entityId: req.params.id, metadata: { assignedToUserId: parsed.data.assignedToUserId, dueAt: parsed.data.dueAt.toISOString() } });
  res.status(201).json({ followUp: result.value.followUp });
});

router.patch("/:id/follow-ups/:followUpId", leadMutationRateLimit, async (req, res) => {
  const parsed = z.object({ status: z.enum(["OPEN","COMPLETED","CANCELLED"]), note: z.string().trim().max(2000).nullable().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const result = await withCurrentLeadManageAccess(req.user!, req.params.id, async (tx, lead) => {
    if (lead.archivedAt || lead.status === "ARCHIVED") return { kind: "archived" as const };
    const existing = await tx.eventLeadFollowUp.findFirst({ where: { id: req.params.followUpId, leadId: lead.id } });
    if (!existing) return { kind: "not_found" as const };
    const updated = await tx.eventLeadFollowUp.update({
      where: { id: existing.id },
      data: {
        status: parsed.data.status,
        note: parsed.data.note === undefined ? undefined : parsed.data.note,
        completedAt: parsed.data.status === "COMPLETED" ? new Date() : parsed.data.status === "OPEN" ? null : existing.completedAt,
      },
      include: { assignedToUser: { select: { id: true, fullName: true, email: true } } },
    });
    return { kind: "updated" as const, followUp: updated };
  });
  if (result.kind === "not_found") return res.status(404).json({ error: "Follow-up not found" });
  if (result.kind !== "ok" || result.value.kind === "archived") return res.status(409).json({ error: "Archived leads cannot have follow-ups updated" });
  if (result.value.kind === "not_found") return res.status(404).json({ error: "Follow-up not found" });
  await logAudit({ actorUserId: req.user!.id, action: "event_lead.follow_up_updated", entityType: "EventLead", entityId: req.params.id, metadata: { status: parsed.data.status } });
  res.json({ followUp: result.value.followUp });
});


export default router;