import { Router } from "express";
import { ParticipationStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { exhibitorBusinessIdsWithPermission, organizerIdsWithPermission } from "../lib/access";
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

async function authorizedEventIds(userId: string, permission: "lead:view" | "lead:capture") {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const organizerIds = await organizerIdsWithPermission(user, permission);
  const exhibitorIds = await exhibitorBusinessIdsWithPermission(user, permission);
  const events = await prisma.event.findMany({
    where: {
      OR: [
        ...(organizerIds.length ? [{ organizerId: { in: organizerIds } }] : []),
        ...(exhibitorIds.length ? [{ exhibition: { exhibitionExhibitors: { some: { exhibitorBusinessId: { in: exhibitorIds }, status: ParticipationStatus.confirmed } } } }] : []),
      ],
      archivedAt: null,
    },
    select: { id: true },
  });
  return { organizerIds, exhibitorIds, eventIds: events.map((e) => e.id), user };
}

async function assertEventAccess(userId: string, eventId: string, permission: "lead:view" | "lead:capture") {
  const scope = await authorizedEventIds(userId, permission);
  if (!scope.eventIds.includes(eventId)) return null;
  return scope;
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

  const allowedBusinessIds = scope.exhibitorIds;
  const where = {
    eventId: eventId && scope.eventIds.includes(eventId) ? eventId : eventId ? "__unauthorized__" : { in: scope.eventIds },
    ...(exhibitorBusinessId ? { exhibitorBusinessId: scope.organizerIds.length || allowedBusinessIds.includes(exhibitorBusinessId) ? exhibitorBusinessId : "__unauthorized__" } : {}),
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(source ? { source } : {}),
    ...(assignedToUserId ? { assignedToUserId } : {}),
    ...(search ? { OR: [
      { visitorName: { contains: search, mode: "insensitive" as const } },
      { visitorEmail: { contains: search, mode: "insensitive" as const } },
      { visitorPhone: { contains: search, mode: "insensitive" as const } },
      { companyName: { contains: search, mode: "insensitive" as const } },
    ] } : {}),
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

  const ticket = await prisma.eventTicket.findUnique({
    where: { id: data.ticketId },
    select: {
      id: true, eventId: true, userId: true, status: true,
      attendeeName: true, attendeeEmail: true, attendeePhone: true,
    },
  });
  if (!ticket || ticket.eventId !== data.eventId || ticket.status !== "USED") {
    return res.status(400).json({ error: "Only a checked-in ticket for this event can be captured as a lead" });
  }

  const event = await prisma.event.findUnique({
    where: { id: data.eventId },
    select: { id: true, exhibition: { select: { id: true } } },
  });
  if (!event) return res.status(404).json({ error: "Event not found" });

  const participation = data.exhibitionExhibitorId
    ? await prisma.exhibitionExhibitor.findUnique({
        where: { id: data.exhibitionExhibitorId },
        select: { id: true, exhibitionId: true, exhibitorBusinessId: true, status: true },
      })
    : await prisma.exhibitionExhibitor.findFirst({
        where: {
          exhibitionId: event.exhibition?.id ?? "__none__",
          exhibitorBusinessId: data.exhibitorBusinessId,
          status: ParticipationStatus.confirmed,
        },
        select: { id: true, exhibitionId: true, exhibitorBusinessId: true, status: true },
      });

  if (
    !participation ||
    participation.status !== ParticipationStatus.confirmed ||
    participation.exhibitionId !== event.exhibition?.id ||
    participation.exhibitorBusinessId !== data.exhibitorBusinessId
  ) {
    return res.status(400).json({ error: "Exhibitor participation is invalid for this event" });
  }

  if (data.stallId) {
    const stall = await prisma.stall.findUnique({
      where: { id: data.stallId },
      select: { id: true, exhibitionId: true, exhibitionExhibitorId: true },
    });
    if (!stall || stall.exhibitionId !== participation.exhibitionId || stall.exhibitionExhibitorId !== participation.id) {
      return res.status(400).json({ error: "Lead stall is invalid for this exhibitor" });
    }
  }

  if (data.assignedToUserId) {
    const assigned = await prisma.exhibitorMembership.findFirst({
      where: {
        userId: data.assignedToUserId,
        exhibitorBusinessId: data.exhibitorBusinessId,
        status: "active",
      },
      select: { userId: true },
    });
    if (!assigned) return res.status(400).json({ error: "Assigned user must belong to the exhibitor business" });
  }

  // Idempotency is enforced by the database unique constraint
  // (eventId, exhibitorBusinessId, ticketId). This avoids application-level
  // advisory-lock waits and remains safe under concurrent scans.
  let leadId: string;
  try {
    const created = await prisma.eventLead.create({
      data: {
        eventId: data.eventId,
        exhibitorBusinessId: data.exhibitorBusinessId,
        exhibitionExhibitorId: participation.id,
        stallId: data.stallId,
        visitorUserId: ticket.userId,
        ticketId: ticket.id,
        visitorName: ticket.attendeeName,
        visitorEmail: ticket.attendeeEmail,
        visitorPhone: ticket.attendeePhone,
        source: "TICKET_CHECK_IN",
        priority: data.priority,
        notes: data.notes,
        assignedToUserId: data.assignedToUserId,
        capturedByUserId: req.user!.id,
      },
      select: { id: true },
    });
    leadId = created.id;
  } catch (error) {
    // Concurrent/repeated scans resolve to the already-created lead instead
    // of surfacing a database conflict to the exhibitor.
    if ((error as { code?: string }).code !== "P2002") throw error;
    const existing = await prisma.eventLead.findFirst({
      where: { eventId: data.eventId, exhibitorBusinessId: data.exhibitorBusinessId, ticketId: data.ticketId },
      select: { id: true },
    });
    if (!existing) return res.status(409).json({ error: "Lead capture conflicted; please retry" });
    leadId = existing.id;
    return res.status(200).json({ leadId, duplicate: true });
  }

  // Fetch the response graph only after the write has committed.
  const lead = await prisma.eventLead.findUnique({
    where: { id: leadId },
    include: leadInclude,
  });
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
  const lead = scope.eventIds.length ? await prisma.eventLead.findFirst({ where: { id: req.params.id, eventId: { in: scope.eventIds } }, include: leadInclude }) : null;
  if (!lead) return res.status(404).json({ error: "Lead not found" });
  res.json({ lead });
});

router.post("/", leadMutationRateLimit, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const data = parsed.data;
  const scope = await assertEventAccess(req.user!.id, data.eventId, "lead:capture");
  if (!scope) return res.status(403).json({ error: "You do not have permission to capture leads for this event" });

  if (data.exhibitorBusinessId && !scope.exhibitorIds.includes(data.exhibitorBusinessId) && !scope.organizerIds.length) {
    return res.status(403).json({ error: "You do not have access to this exhibitor business" });
  }

  const event = await prisma.event.findUnique({
    where: { id: data.eventId },
    select: { id: true, organizerId: true, exhibition: { select: { id: true } } },
  });
  if (!event) return res.status(404).json({ error: "Event not found" });

  const participation = data.exhibitionExhibitorId ? await prisma.exhibitionExhibitor.findUnique({ where: { id: data.exhibitionExhibitorId }, select: { id: true, exhibitionId: true, exhibitorBusinessId: true, status: true } }) : null;
  if (data.exhibitionExhibitorId && (!participation || participation.status !== ParticipationStatus.confirmed || event.exhibition?.id !== participation.exhibitionId)) {
    return res.status(400).json({ error: "Lead exhibitor participation is invalid for this event" });
  }
  if (data.exhibitorBusinessId && participation && participation.exhibitorBusinessId !== data.exhibitorBusinessId) {
    return res.status(400).json({ error: "Exhibitor business does not match participation" });
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
  }
  if (data.ticketId) {
    const ticket = await prisma.eventTicket.findUnique({ where: { id: data.ticketId }, select: { id: true, eventId: true, userId: true, attendeeName: true, attendeeEmail: true, attendeePhone: true, status: true } });
    if (!ticket || ticket.eventId !== data.eventId || ticket.status === "REFUNDED" || ticket.status === "CANCELLED") return res.status(400).json({ error: "Ticket is invalid for this event" });
  }

  const duplicate = data.ticketId || data.registrationId
    ? await prisma.eventLead.findFirst({ where: { eventId: data.eventId, exhibitorBusinessId: data.exhibitorBusinessId, OR: [{ ticketId: data.ticketId ?? undefined }, { registrationId: data.registrationId ?? undefined }] } })
    : null;
  if (duplicate) return res.status(409).json({ error: "A lead already exists for this visitor/source", leadId: duplicate.id });

  if (data.assignedToUserId) {
    const assigned = await prisma.exhibitorMembership.findFirst({ where: { userId: data.assignedToUserId, exhibitorBusinessId: data.exhibitorBusinessId ?? participation?.exhibitorBusinessId, status: "active" }, select: { userId: true } });
    if (!assigned) return res.status(400).json({ error: "Assigned user must belong to the exhibitor business" });
  }

  const lead = await prisma.eventLead.create({
    data: {
      eventId: data.eventId,
      exhibitorBusinessId: data.exhibitorBusinessId ?? participation?.exhibitorBusinessId,
      exhibitionExhibitorId: data.exhibitionExhibitorId,
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

  await logAudit({ actorUserId: req.user!.id, action: "event_lead.created", entityType: "EventLead", entityId: lead.id, metadata: { eventId: data.eventId, source: data.source } });
  res.status(201).json({ lead });
});

const updateSchema = z.object({
  status: z.enum(["NEW","CONTACTED","INTERESTED","QUALIFIED","NEGOTIATION","CONVERTED","LOST","ARCHIVED"]).optional(),
  priority: z.enum(["LOW","MEDIUM","HIGH"]).optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  assignedToUserId: z.string().nullable().optional(),
  companyName: z.string().trim().max(200).nullable().optional(),
  followUpDate: z.coerce.date().nullable().optional(),
});

router.patch("/:id", leadMutationRateLimit, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const scope = await authorizedEventIds(req.user!.id, "lead:capture");
  const existing = await prisma.eventLead.findFirst({ where: { id: req.params.id, eventId: { in: scope.eventIds } } });
  if (!existing) return res.status(404).json({ error: "Lead not found" });

  if (parsed.data.assignedToUserId) {
    const allowed = await prisma.exhibitorMembership.findFirst({ where: { userId: parsed.data.assignedToUserId, exhibitorBusinessId: existing.exhibitorBusinessId ?? "__none__", status: "active" } });
    const organizerMember = await prisma.organizerMembership.findFirst({ where: { userId: parsed.data.assignedToUserId, organizerId: (await prisma.event.findUniqueOrThrow({ where: { id: existing.eventId }, select: { organizerId: true } })).organizerId, status: "active" } });
    if (!allowed && !organizerMember) return res.status(400).json({ error: "Assigned user must belong to the event organizer or lead exhibitor business" });
  }

  const lead = await prisma.eventLead.update({ where: { id: existing.id }, data: {
    status: parsed.data.status,
    priority: parsed.data.priority,
    notes: parsed.data.notes === undefined ? undefined : parsed.data.notes,
    assignedToUserId: parsed.data.assignedToUserId === undefined ? undefined : parsed.data.assignedToUserId,
    companyName: parsed.data.companyName === undefined ? undefined : parsed.data.companyName,
  }, include: leadInclude });

  if (parsed.data.status && parsed.data.status !== existing.status) await logAudit({ actorUserId: req.user!.id, action: "event_lead.status_changed", entityType: "EventLead", entityId: lead.id, metadata: { from: existing.status, to: parsed.data.status } });
  res.json({ lead });
});

router.delete("/:id", leadMutationRateLimit, async (req, res) => {
  const scope = await authorizedEventIds(req.user!.id, "lead:capture");
  const existing = await prisma.eventLead.findFirst({ where: { id: req.params.id, eventId: { in: scope.eventIds } } });
  if (!existing) return res.status(404).json({ error: "Lead not found" });
  const lead = await prisma.eventLead.update({ where: { id: existing.id }, data: { status: "ARCHIVED", archivedAt: new Date() }, include: leadInclude });
  await logAudit({ actorUserId: req.user!.id, action: "event_lead.archived", entityType: "EventLead", entityId: lead.id });
  res.json({ lead });
});

const interactionSchema = z.object({ type: z.enum(["NOTE","CALL","EMAIL","WHATSAPP","MEETING","OTHER"]).default("NOTE"), note: z.string().trim().min(1).max(5000) });
router.post("/:id/interactions", leadMutationRateLimit, async (req, res) => {
  const parsed = interactionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const scope = await authorizedEventIds(req.user!.id, "lead:capture");
  const lead = await prisma.eventLead.findFirst({ where: { id: req.params.id, eventId: { in: scope.eventIds } }, select: { id: true } });
  if (!lead) return res.status(404).json({ error: "Lead not found" });
  const interaction = await prisma.eventLeadInteraction.create({ data: { leadId: lead.id, type: parsed.data.type, note: parsed.data.note, createdByUserId: req.user!.id }, include: { createdByUser: { select: { id: true, fullName: true, email: true } } } });
  await logAudit({ actorUserId: req.user!.id, action: "event_lead.interaction_added", entityType: "EventLead", entityId: lead.id, metadata: { type: parsed.data.type } });
  res.status(201).json({ interaction });
});

const followUpSchema = z.object({ assignedToUserId: z.string(), dueAt: z.coerce.date(), note: z.string().trim().max(2000).optional() });
router.post("/:id/follow-ups", leadMutationRateLimit, async (req, res) => {
  const parsed = followUpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const scope = await authorizedEventIds(req.user!.id, "lead:capture");
  const lead = await prisma.eventLead.findFirst({ where: { id: req.params.id, eventId: { in: scope.eventIds } }, select: { id: true, exhibitorBusinessId: true, eventId: true } });
  if (!lead) return res.status(404).json({ error: "Lead not found" });
  const assigned = await prisma.exhibitorMembership.findFirst({ where: { userId: parsed.data.assignedToUserId, exhibitorBusinessId: lead.exhibitorBusinessId ?? "__none__", status: "active" }, select: { userId: true } });
  if (!assigned) return res.status(400).json({ error: "Assigned user must belong to the lead exhibitor business" });
  const followUp = await prisma.eventLeadFollowUp.create({ data: { leadId: lead.id, assignedToUserId: parsed.data.assignedToUserId, dueAt: parsed.data.dueAt, note: parsed.data.note }, include: { assignedToUser: { select: { id: true, fullName: true, email: true } } } });
  await logAudit({ actorUserId: req.user!.id, action: "event_lead.follow_up_created", entityType: "EventLead", entityId: lead.id, metadata: { assignedToUserId: parsed.data.assignedToUserId, dueAt: parsed.data.dueAt.toISOString() } });
  res.status(201).json({ followUp });
});

router.patch("/:id/follow-ups/:followUpId", leadMutationRateLimit, async (req, res) => {
  const parsed = z.object({ status: z.enum(["OPEN","COMPLETED","CANCELLED"]), note: z.string().trim().max(2000).nullable().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const scope = await authorizedEventIds(req.user!.id, "lead:capture");
  const followUp = await prisma.eventLeadFollowUp.findFirst({ where: { id: req.params.followUpId, leadId: req.params.id, lead: { eventId: { in: scope.eventIds } } } });
  if (!followUp) return res.status(404).json({ error: "Follow-up not found" });
  const updated = await prisma.eventLeadFollowUp.update({ where: { id: followUp.id }, data: { status: parsed.data.status, note: parsed.data.note === undefined ? undefined : parsed.data.note, completedAt: parsed.data.status === "COMPLETED" ? new Date() : parsed.data.status === "OPEN" ? null : followUp.completedAt }, include: { assignedToUser: { select: { id: true, fullName: true, email: true } } } });
  await logAudit({ actorUserId: req.user!.id, action: "event_lead.follow_up_updated", entityType: "EventLead", entityId: followUp.leadId, metadata: { status: parsed.data.status } });
  res.json({ followUp: updated });
});



export default router;
