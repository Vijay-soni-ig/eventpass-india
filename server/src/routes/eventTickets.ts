import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { organizerIdsWithPermission } from "../lib/access";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);

const ticketSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  price: z.number().finite().min(0).max(100000000),
  currency: z.string().trim().length(3).transform((v) => v.toUpperCase()).default("INR"),
  capacity: z.number().int().min(1).max(100000000),
  maxPerOrder: z.number().int().min(1).max(100),
  maxPerAttendee: z.number().int().min(1).max(100).nullable().optional(),
  saleStartsAt: z.string().datetime().nullable().optional(),
  saleEndsAt: z.string().datetime().nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
  sortOrder: z.number().int().min(0).max(100000).default(0),
});

const listQuery = z.object({
  eventId: z.string().uuid(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
});

async function authorizedEvent(eventId: string, req: import("express").Request) {
  const organizerIds = await organizerIdsWithPermission(req.user!, "ticketType:manage");
  if (organizerIds.length === 0) return null;
  return prisma.event.findFirst({
    where: {
      id: eventId,
      organizerId: { in: organizerIds },
      archivedAt: null,
      // Event-native ticketing must not become a second ticket system for an
      // Exhibition. Exhibition events continue using the legacy TicketType
      // until the explicit booking cutover phase.
      exhibition: null,
    },
    include: {
      moduleEnablements: {
        where: { moduleType: "TICKETING" },
        select: { enabled: true },
      },
    },
  });
}

function validateSaleWindow(saleStartsAt?: string | null, saleEndsAt?: string | null) {
  if (saleStartsAt && saleEndsAt && new Date(saleStartsAt).getTime() >= new Date(saleEndsAt).getTime()) {
    return "Sale end must be after sale start";
  }
  return null;
}

router.get("/", async (req, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const event = await authorizedEvent(parsed.data.eventId, req);
  if (!event) return res.status(404).json({ error: "Event not found" });

  const tickets = await prisma.eventTicketType.findMany({
    where: {
      eventId: event.id,
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  res.json({ tickets });
});

router.post("/", async (req, res) => {
  const eventId = typeof req.body?.eventId === "string" ? req.body.eventId : "";
  if (!eventId) return res.status(400).json({ error: "eventId is required" });

  const event = await authorizedEvent(eventId, req);
  if (!event) return res.status(404).json({ error: "Event not found" });

  const ticketing = event.moduleEnablements[0];
  if (!ticketing?.enabled) return res.status(409).json({ error: "Ticketing module is not enabled for this event" });

  const parsed = ticketSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const saleWindowError = validateSaleWindow(parsed.data.saleStartsAt, parsed.data.saleEndsAt);
  if (saleWindowError) return res.status(400).json({ error: saleWindowError });

  const ticket = await prisma.eventTicketType.create({
    data: {
      eventId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      price: parsed.data.price,
      currency: parsed.data.currency,
      capacity: parsed.data.capacity,
      maxPerOrder: parsed.data.maxPerOrder,
      maxPerAttendee: parsed.data.maxPerAttendee ?? null,
      saleStartsAt: parsed.data.saleStartsAt ? new Date(parsed.data.saleStartsAt) : null,
      saleEndsAt: parsed.data.saleEndsAt ? new Date(parsed.data.saleEndsAt) : null,
      status: parsed.data.status,
      sortOrder: parsed.data.sortOrder,
    },
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: "eventTicketType.created",
    entityType: "EventTicketType",
    entityId: ticket.id,
    metadata: { eventId, name: ticket.name, capacity: ticket.capacity, price: Number(ticket.price) },
  });

  res.status(201).json({ ticket });
});

router.patch("/:id", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "ticketType:manage");
  const existing = organizerIds.length
    ? await prisma.eventTicketType.findFirst({
        where: { id: req.params.id, event: { organizerId: { in: organizerIds }, archivedAt: null, exhibition: null } },
        include: { event: { include: { moduleEnablements: { where: { moduleType: "TICKETING" }, select: { enabled: true } } } } },
      })
    : null;
  if (!existing) return res.status(404).json({ error: "Ticket not found" });
  if (!existing.event.moduleEnablements[0]?.enabled) return res.status(409).json({ error: "Ticketing module is not enabled for this event" });
  if (existing.status === "ARCHIVED") return res.status(409).json({ error: "Archived tickets cannot be edited" });

  const parsed = ticketSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const saleWindowError = validateSaleWindow(parsed.data.saleStartsAt ?? null, parsed.data.saleEndsAt ?? null);
  if (saleWindowError) return res.status(400).json({ error: saleWindowError });

  const ticket = await prisma.eventTicketType.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.price !== undefined ? { price: parsed.data.price } : {}),
      ...(parsed.data.currency !== undefined ? { currency: parsed.data.currency } : {}),
      ...(parsed.data.capacity !== undefined ? { capacity: parsed.data.capacity } : {}),
      ...(parsed.data.maxPerOrder !== undefined ? { maxPerOrder: parsed.data.maxPerOrder } : {}),
      ...(parsed.data.maxPerAttendee !== undefined ? { maxPerAttendee: parsed.data.maxPerAttendee } : {}),
      ...(parsed.data.saleStartsAt !== undefined ? { saleStartsAt: parsed.data.saleStartsAt ? new Date(parsed.data.saleStartsAt) : null } : {}),
      ...(parsed.data.saleEndsAt !== undefined ? { saleEndsAt: parsed.data.saleEndsAt ? new Date(parsed.data.saleEndsAt) : null } : {}),
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
    },
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: "eventTicketType.updated",
    entityType: "EventTicketType",
    entityId: ticket.id,
    metadata: { eventId: ticket.eventId, changedFields: Object.keys(parsed.data) },
  });

  res.json({ ticket });
});

router.delete("/:id", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "ticketType:manage");
  const existing = organizerIds.length
    ? await prisma.eventTicketType.findFirst({
        where: { id: req.params.id, event: { organizerId: { in: organizerIds }, archivedAt: null, exhibition: null } },
      })
    : null;
  if (!existing) return res.status(404).json({ error: "Ticket not found" });
  if (existing.status === "ARCHIVED") return res.status(409).json({ error: "Ticket is already archived" });

  const ticket = await prisma.eventTicketType.update({
    where: { id: existing.id },
    data: { status: "ARCHIVED" },
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: "eventTicketType.archived",
    entityType: "EventTicketType",
    entityId: ticket.id,
    metadata: { eventId: ticket.eventId },
  });

  res.json({ ticket });
});

export default router;
