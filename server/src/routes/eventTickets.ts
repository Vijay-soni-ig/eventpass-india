import { Prisma, type User } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { withLockedEventAccess } from "../lib/lockedEventAccess";
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

type TicketEvent = {
  id: string;
  organizerId: string;
  status: string;
  moduleEnablements: Array<{ enabled: boolean }>;
};

type TicketEventAccessResult<T> =
  | { kind: "event_not_found" }
  | { kind: "module_disabled" }
  | { kind: "ok"; value: T };

/**
 * Ticket administration shares the Event -> ticket-type lock order used by
 * reservation creation. The organizer lock revalidates ticketType:manage
 * after membership changes; the Event lock serializes lifecycle/module
 * changes; the ticket-type lock serializes status, price, limits and capacity
 * changes with reservation creation.
 */
async function withTicketEventAccess<T>(
  eventId: string,
  user: User,
  work: (tx: Prisma.TransactionClient, event: TicketEvent) => Promise<T>,
): Promise<TicketEventAccessResult<T> | null> {
  return withLockedEventAccess(eventId, user, "ticketType:manage", async (tx, scope) => {
    await tx.$queryRawUnsafe('SELECT "id" FROM "events" WHERE "id" = $1 FOR UPDATE', scope.id);
    const event = await tx.event.findFirst({
      where: {
        id: scope.id,
        organizerId: scope.organizerId,
        archivedAt: null,
        exhibition: null,
      },
      select: {
        id: true,
        organizerId: true,
        status: true,
        moduleEnablements: {
          where: { moduleType: "TICKETING" },
          select: { enabled: true },
        },
      },
    });
    if (!event) return { kind: "event_not_found" } as const;
    if (event.moduleEnablements[0]?.enabled !== true) return { kind: "module_disabled" } as const;
    return { kind: "ok", value: await work(tx, event) } as const;
  });
}

const CLOSED_EVENT_STATUSES = ["CANCELLED", "COMPLETED"];
const CLOSED_EVENT_MESSAGE = "This event is cancelled or completed, so its tickets can no longer be changed";

async function ticketInventory(tx: Prisma.TransactionClient, ticketTypeId: string) {
  const now = new Date();
  const held = await tx.eventTicketReservation.aggregate({
    where: { eventTicketTypeId: ticketTypeId, status: "ACTIVE", expiresAt: { gt: now } },
    _sum: { quantity: true },
  });
  const paid = await tx.eventTicketOrder.aggregate({
    where: { status: "PAID", reservation: { eventTicketTypeId: ticketTypeId } },
    _sum: { quantity: true },
  });
  return { reserved: held._sum.quantity ?? 0, sold: paid._sum.quantity ?? 0 };
}

function validateQuantityLimits(capacity: number, maxPerOrder: number, maxPerAttendee: number | null | undefined) {
  if (maxPerOrder > capacity) return "Maximum per order cannot be more than the capacity";
  if (maxPerAttendee !== null && maxPerAttendee !== undefined && maxPerAttendee > capacity) return "Maximum per attendee cannot be more than the capacity";
  return null;
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

  const access = await withTicketEventAccess(parsed.data.eventId, req.user!, async (tx, event) => {
    const tickets = await tx.eventTicketType.findMany({
      where: {
        eventId: event.id,
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    const withInventory = await Promise.all(
      tickets.map(async (ticket) => {
        const { sold, reserved } = await ticketInventory(tx, ticket.id);
        return { ...ticket, sold, reserved, remaining: Math.max(0, ticket.capacity - sold - reserved) };
      }),
    );
    return { tickets: withInventory };
  });

  if (!access || access.kind === "event_not_found") return res.status(404).json({ error: "Event not found" });
  if (access.kind === "module_disabled") return res.status(409).json({ error: "Ticketing module is not enabled for this event" });
  return res.json(access.value);
});

router.post("/", eventTicketMutationRateLimit, async (req, res) => {
  const eventId = typeof req.body?.eventId === "string" ? req.body.eventId : "";
  if (!eventId) return res.status(400).json({ error: "eventId is required" });

  const parsed = ticketSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const saleWindowError = validateSaleWindow(parsed.data.saleStartsAt, parsed.data.saleEndsAt);
  if (saleWindowError) return res.status(400).json({ error: saleWindowError });
  const limitsError = validateQuantityLimits(parsed.data.capacity, parsed.data.maxPerOrder, parsed.data.maxPerAttendee);
  if (limitsError) return res.status(400).json({ error: limitsError });

  const access = await withTicketEventAccess(eventId, req.user!, async (tx, event) => {
    if (CLOSED_EVENT_STATUSES.includes(event.status)) return { kind: "closed" } as const;

    const clash = await tx.eventTicketType.findFirst({
      where: {
        eventId: event.id,
        status: { not: "ARCHIVED" },
        name: { equals: parsed.data.name, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (clash) return { kind: "name_conflict" } as const;

    const ticket = await tx.eventTicketType.create({
      data: {
        eventId: event.id,
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
    return { kind: "created", ticket } as const;
  });

  if (!access || access.kind === "event_not_found") return res.status(404).json({ error: "Event not found" });
  if (access.kind === "module_disabled") return res.status(409).json({ error: "Ticketing module is not enabled for this event" });
  if (access.value.kind === "closed") return res.status(409).json({ error: CLOSED_EVENT_MESSAGE });
  if (access.value.kind === "name_conflict") return res.status(409).json({ error: "A ticket type with this name already exists for this event" });

  const ticket = access.value.ticket;
  await logAudit({
    actorUserId: req.user!.id,
    action: "eventTicketType.created",
    entityType: "EventTicketType",
    entityId: ticket.id,
    metadata: { eventId, name: ticket.name, capacity: ticket.capacity, price: Number(ticket.price) },
  });
  return res.status(201).json({ ticket });
});

router.patch("/:id", eventTicketMutationRateLimit, async (req, res) => {
  const ticketScope = await prisma.eventTicketType.findUnique({
    where: { id: req.params.id },
    select: { eventId: true },
  });
  if (!ticketScope) return res.status(404).json({ error: "Ticket not found" });

  const access = await withTicketEventAccess(ticketScope.eventId, req.user!, async (tx, event) => {
    const locked = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT "id" FROM "event_ticket_types" WHERE "id" = $1 AND "eventId" = $2 FOR UPDATE',
      req.params.id,
      event.id,
    );
    if (locked.length === 0) return { kind: "ticket_not_found" } as const;

    const existing = await tx.eventTicketType.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.eventId !== event.id) return { kind: "ticket_not_found" } as const;
    if (existing.status === "ARCHIVED") return { kind: "archived" } as const;
    if (CLOSED_EVENT_STATUSES.includes(event.status)) return { kind: "closed" } as const;

    const parsed = ticketSchema.partial().safeParse(req.body);
    if (!parsed.success) return { kind: "invalid", message: parsed.error.issues[0].message } as const;

    if (parsed.data.saleStartsAt !== undefined || parsed.data.saleEndsAt !== undefined) {
      const nextStart = parsed.data.saleStartsAt !== undefined ? parsed.data.saleStartsAt : existing.saleStartsAt?.toISOString() ?? null;
      const nextEnd = parsed.data.saleEndsAt !== undefined ? parsed.data.saleEndsAt : existing.saleEndsAt?.toISOString() ?? null;
      const saleWindowError = validateSaleWindow(nextStart, nextEnd);
      if (saleWindowError) return { kind: "sale_window_error", message: saleWindowError } as const;
    }

    if (parsed.data.capacity !== undefined || parsed.data.maxPerOrder !== undefined || parsed.data.maxPerAttendee !== undefined) {
      const limitsError = validateQuantityLimits(
        parsed.data.capacity ?? existing.capacity,
        parsed.data.maxPerOrder ?? existing.maxPerOrder,
        parsed.data.maxPerAttendee !== undefined ? parsed.data.maxPerAttendee : existing.maxPerAttendee,
      );
      if (limitsError) return { kind: "limits_error", message: limitsError } as const;
    }

    if (parsed.data.currency !== undefined && parsed.data.currency !== existing.currency) {
      const everUsed = await tx.eventTicketReservation.count({ where: { eventTicketTypeId: existing.id } });
      if (everUsed > 0) return { kind: "currency_locked" } as const;
    }

    if (parsed.data.name !== undefined && parsed.data.name.toLowerCase() !== existing.name.toLowerCase()) {
      const clash = await tx.eventTicketType.findFirst({
        where: {
          eventId: existing.eventId,
          status: { not: "ARCHIVED" },
          name: { equals: parsed.data.name, mode: "insensitive" },
          id: { not: existing.id },
        },
        select: { id: true },
      });
      if (clash) return { kind: "name_conflict" } as const;
    }

    if (parsed.data.capacity !== undefined && parsed.data.capacity < existing.capacity) {
      const now = new Date();
      const held = await tx.eventTicketReservation.aggregate({
        where: { eventTicketTypeId: existing.id, status: "ACTIVE", expiresAt: { gt: now } },
        _sum: { quantity: true },
      });
      const paid = await tx.eventTicketOrder.aggregate({
        where: { status: "PAID", reservation: { eventTicketTypeId: existing.id } },
        _sum: { quantity: true },
      });
      const reserved = held._sum.quantity ?? 0;
      const sold = paid._sum.quantity ?? 0;
      if (parsed.data.capacity < sold + reserved) {
        return { kind: "capacity_conflict", total: sold + reserved, sold, reserved } as const;
      }
    }

    const updateData = {
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
    };

    const ticket = await tx.eventTicketType.update({ where: { id: existing.id }, data: updateData });
    return { kind: "updated", ticket, changedFields: Object.keys(parsed.data) } as const;
  });

  if (!access || access.kind === "event_not_found") return res.status(404).json({ error: "Ticket not found" });
  if (access.kind === "module_disabled") return res.status(409).json({ error: "Ticketing module is not enabled for this event" });

  switch (access.value.kind) {
    case "ticket_not_found":
      return res.status(404).json({ error: "Ticket not found" });
    case "archived":
      return res.status(409).json({ error: "Archived tickets cannot be edited" });
    case "closed":
      return res.status(409).json({ error: CLOSED_EVENT_MESSAGE });
    case "invalid":
    case "sale_window_error":
    case "limits_error":
      return res.status(400).json({ error: access.value.message });
    case "currency_locked":
      return res.status(409).json({ error: "The currency cannot be changed after tickets have been reserved or sold" });
    case "name_conflict":
      return res.status(409).json({ error: "A ticket type with this name already exists for this event" });
    case "capacity_conflict":
      return res.status(409).json({
        error: "Capacity cannot be reduced below the " + access.value.total + " tickets already sold or held (" + access.value.sold + " sold, " + access.value.reserved + " held)",
      });
    case "updated":
      await logAudit({
        actorUserId: req.user!.id,
        action: "eventTicketType.updated",
        entityType: "EventTicketType",
        entityId: access.value.ticket.id,
        metadata: { eventId: access.value.ticket.eventId, changedFields: access.value.changedFields },
      });
      return res.json({ ticket: access.value.ticket });
  }
});

router.delete("/:id", eventTicketMutationRateLimit, async (req, res) => {
  const ticketScope = await prisma.eventTicketType.findUnique({
    where: { id: req.params.id },
    select: { eventId: true },
  });
  if (!ticketScope) return res.status(404).json({ error: "Ticket not found" });

  const access = await withTicketEventAccess(ticketScope.eventId, req.user!, async (tx, event) => {
    const locked = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT "id" FROM "event_ticket_types" WHERE "id" = $1 AND "eventId" = $2 FOR UPDATE',
      req.params.id,
      event.id,
    );
    if (locked.length === 0) return { kind: "ticket_not_found" } as const;

    const existing = await tx.eventTicketType.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.eventId !== event.id) return { kind: "ticket_not_found" } as const;
    if (existing.status === "ARCHIVED") return { kind: "already_archived" } as const;

    const ticket = await tx.eventTicketType.update({
      where: { id: existing.id },
      data: { status: "ARCHIVED" },
    });
    return { kind: "archived", ticket } as const;
  });

  if (!access || access.kind === "event_not_found") return res.status(404).json({ error: "Ticket not found" });
  if (access.kind === "module_disabled") return res.status(409).json({ error: "Ticketing module is not enabled for this event" });
  if (access.value.kind === "ticket_not_found") return res.status(404).json({ error: "Ticket not found" });
  if (access.value.kind === "already_archived") return res.status(409).json({ error: "Ticket is already archived" });

  await logAudit({
    actorUserId: req.user!.id,
    action: "eventTicketType.archived",
    entityType: "EventTicketType",
    entityId: access.value.ticket.id,
    metadata: { eventId: access.value.ticket.eventId },
  });
  return res.json({ ticket: access.value.ticket });
});

export default router;
