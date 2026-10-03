import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { organizerIdsWithPermission } from "../lib/access";
import { logAudit } from "../lib/audit";
import { eventTicketMutationRateLimit } from "../middleware/rateLimit";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);

const ticketSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  price: z
    .number()
    .finite()
    .min(0)
    .max(99999999.99)
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Price can have at most 2 decimal places"),
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

const CLOSED_EVENT_STATUSES = ["CANCELLED", "COMPLETED"];
const CLOSED_EVENT_MESSAGE = "This event is cancelled or completed, so its tickets can no longer be changed";

/** Same inventory definition the reservation step uses: remaining = capacity - paid orders - active holds. */
async function ticketInventory(ticketTypeId: string) {
  const now = new Date();
  const [held, paid] = await Promise.all([
    prisma.eventTicketReservation.aggregate({
      where: { eventTicketTypeId: ticketTypeId, status: "ACTIVE", expiresAt: { gt: now } },
      _sum: { quantity: true },
    }),
    prisma.eventTicketOrder.aggregate({
      where: { status: "PAID", reservation: { eventTicketTypeId: ticketTypeId } },
      _sum: { quantity: true },
    }),
  ]);
  return { reserved: held._sum.quantity ?? 0, sold: paid._sum.quantity ?? 0 };
}

function validateQuantityLimits(capacity: number, maxPerOrder: number, maxPerAttendee: number | null | undefined) {
  if (maxPerOrder > capacity) return "Maximum per order cannot be more than the capacity";
  if (maxPerAttendee !== null && maxPerAttendee !== undefined && maxPerAttendee > capacity) return "Maximum per attendee cannot be more than the capacity";
  return null;
}

async function nameInUse(eventId: string, name: string, exceptId?: string) {
  const clash = await prisma.eventTicketType.findFirst({
    where: { eventId, status: { not: "ARCHIVED" }, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return Boolean(clash);
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
  if (event.moduleEnablements[0]?.enabled !== true) return res.status(409).json({ error: "Ticketing module is not enabled for this event" });

  const tickets = await prisma.eventTicketType.findMany({
    where: {
      eventId: event.id,
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const withInventory = await Promise.all(
    tickets.map(async (ticket) => {
      const { sold, reserved } = await ticketInventory(ticket.id);
      return { ...ticket, sold, reserved, remaining: Math.max(0, ticket.capacity - sold - reserved) };
    }),
  );
  res.json({ tickets: withInventory });
});

router.post("/", eventTicketMutationRateLimit, async (req, res) => {
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
  if (CLOSED_EVENT_STATUSES.includes(event.status)) return res.status(409).json({ error: CLOSED_EVENT_MESSAGE });
  const limitsError = validateQuantityLimits(parsed.data.capacity, parsed.data.maxPerOrder, parsed.data.maxPerAttendee);
  if (limitsError) return res.status(400).json({ error: limitsError });
  if (await nameInUse(eventId, parsed.data.name)) return res.status(409).json({ error: "A ticket type with this name already exists for this event" });

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

router.patch("/:id", eventTicketMutationRateLimit, async (req, res) => {
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
  if (CLOSED_EVENT_STATUSES.includes(existing.event.status)) return res.status(409).json({ error: CLOSED_EVENT_MESSAGE });

  const parsed = ticketSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  // A partial edit is checked against the stored value of whatever it does not change.
  if (parsed.data.saleStartsAt !== undefined || parsed.data.saleEndsAt !== undefined) {
    const nextStart = parsed.data.saleStartsAt !== undefined ? parsed.data.saleStartsAt : existing.saleStartsAt?.toISOString() ?? null;
    const nextEnd = parsed.data.saleEndsAt !== undefined ? parsed.data.saleEndsAt : existing.saleEndsAt?.toISOString() ?? null;
    const saleWindowError = validateSaleWindow(nextStart, nextEnd);
    if (saleWindowError) return res.status(400).json({ error: saleWindowError });
  }
  if (parsed.data.capacity !== undefined || parsed.data.maxPerOrder !== undefined || parsed.data.maxPerAttendee !== undefined) {
    const limitsError = validateQuantityLimits(
      parsed.data.capacity ?? existing.capacity,
      parsed.data.maxPerOrder ?? existing.maxPerOrder,
      parsed.data.maxPerAttendee !== undefined ? parsed.data.maxPerAttendee : existing.maxPerAttendee,
    );
    if (limitsError) return res.status(400).json({ error: limitsError });
  }

  // Capacity can never drop below what is already sold or being held by a checkout.
  if (parsed.data.capacity !== undefined && parsed.data.capacity < existing.capacity) {
    const { sold, reserved } = await ticketInventory(existing.id);
    if (parsed.data.capacity < sold + reserved) {
      return res.status(409).json({
        error: "Capacity cannot be reduced below the " + (sold + reserved) + " tickets already sold or held (" + sold + " sold, " + reserved + " held)",
      });
    }
  }

  // Switching currency once anyone has bought or held this ticket would mix currencies in one inventory.
  if (parsed.data.currency !== undefined && parsed.data.currency !== existing.currency) {
    const everUsed = await prisma.eventTicketReservation.count({ where: { eventTicketTypeId: existing.id } });
    if (everUsed > 0) return res.status(409).json({ error: "The currency cannot be changed after tickets have been reserved or sold" });
  }

  if (parsed.data.name !== undefined && parsed.data.name.toLowerCase() !== existing.name.toLowerCase() && (await nameInUse(existing.eventId, parsed.data.name, existing.id))) {
    return res.status(409).json({ error: "A ticket type with this name already exists for this event" });
  }

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

router.delete("/:id", eventTicketMutationRateLimit, async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "ticketType:manage");
  const existing = organizerIds.length
    ? await prisma.eventTicketType.findFirst({
        where: { id: req.params.id, event: { organizerId: { in: organizerIds }, archivedAt: null, exhibition: null } },
        include: { event: { include: { moduleEnablements: { where: { moduleType: "TICKETING" }, select: { enabled: true } } } } },
      })
    : null;
  if (!existing) return res.status(404).json({ error: "Ticket not found" });
  if (!existing.event.moduleEnablements[0]?.enabled) return res.status(409).json({ error: "Ticketing module is not enabled for this event" });
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
