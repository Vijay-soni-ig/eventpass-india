import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(requireAuth);

const RESERVATION_TTL_MINUTES = 10;

const createSchema = z.object({
  eventTicketTypeId: z.string().uuid(),
  attendeeName: z.string().trim().min(1).max(200),
  attendeeEmail: z.string().trim().email(),
  attendeePhone: z.string().trim().max(20).optional(),
  quantity: z.number().int().positive().max(100),
});

function isWithinSaleWindow(ticket: { status: string; saleStartsAt: Date | null; saleEndsAt: Date | null }) {
  if (ticket.status !== "ACTIVE") return false;
  const now = Date.now();
  if (ticket.saleStartsAt && ticket.saleStartsAt.getTime() > now) return false;
  if (ticket.saleEndsAt && ticket.saleEndsAt.getTime() <= now) return false;
  return true;
}

router.get("/mine", async (req, res) => {
  const now = new Date();
  await prisma.eventTicketReservation.updateMany({ where: { userId: req.user!.id, status: "ACTIVE", expiresAt: { lte: now } }, data: { status: "EXPIRED" } });
  const reservations = await prisma.eventTicketReservation.findMany({
    where: { userId: req.user!.id },
    include: { event: { select: { id: true, title: true, startDate: true, endDate: true, timezone: true } }, eventTicketType: { select: { id: true, name: true, price: true, currency: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ reservations });
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const idempotencyKey = req.header("Idempotency-Key")?.trim().slice(0, 200) || null;
  if (idempotencyKey) {
    const existing = await prisma.eventTicketReservation.findFirst({ where: { userId: req.user!.id, idempotencyKey }, include: { event: true, eventTicketType: true } });
    if (existing) return res.status(200).json({ reservation: existing, replayed: true });
  }
  try {
    const reservation = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "event_ticket_types" WHERE "id" = ${parsed.data.eventTicketTypeId} FOR UPDATE`;
      if (locked.length === 0) throw new Error("TICKET_NOT_FOUND");
      await tx.eventTicketReservation.updateMany({ where: { eventTicketTypeId: parsed.data.eventTicketTypeId, status: "ACTIVE", expiresAt: { lte: new Date() } }, data: { status: "EXPIRED" } });
      const ticket = await tx.eventTicketType.findUnique({
        where: { id: parsed.data.eventTicketTypeId },
        include: { event: { select: { id: true, status: true, visibility: true, archivedAt: true, exhibition: true, moduleEnablements: { where: { moduleType: "TICKETING", enabled: true }, select: { id: true } } } } },
      });
      if (!ticket || ticket.event.archivedAt || ticket.event.exhibition || ticket.event.status !== "PUBLISHED" || ticket.event.visibility !== "public") throw new Error("TICKET_NOT_AVAILABLE");
      if (ticket.event.moduleEnablements.length === 0) throw new Error("TICKETING_DISABLED");
      if (!isWithinSaleWindow(ticket)) throw new Error("SALE_CLOSED");
      if (parsed.data.quantity > ticket.maxPerOrder) throw new Error("MAX_PER_ORDER");
      const active = await tx.eventTicketReservation.aggregate({ where: { eventTicketTypeId: ticket.id, status: "ACTIVE", expiresAt: { gt: new Date() } }, _sum: { quantity: true } });
      const remaining = ticket.capacity - (active._sum.quantity ?? 0);
      if (parsed.data.quantity > remaining) throw new Error("SOLD_OUT");
      if (ticket.maxPerAttendee !== null) {
        const attendeeActive = await tx.eventTicketReservation.aggregate({ where: { eventTicketTypeId: ticket.id, userId: req.user!.id, status: "ACTIVE", expiresAt: { gt: new Date() } }, _sum: { quantity: true } });
        if ((attendeeActive._sum.quantity ?? 0) + parsed.data.quantity > ticket.maxPerAttendee) throw new Error("MAX_PER_ATTENDEE");
      }
      return tx.eventTicketReservation.create({ data: { eventTicketTypeId: ticket.id, eventId: ticket.eventId, userId: req.user!.id, attendeeName: parsed.data.attendeeName, attendeeEmail: parsed.data.attendeeEmail.trim().toLowerCase(), attendeePhone: parsed.data.attendeePhone?.trim() || null, quantity: parsed.data.quantity, unitPrice: ticket.price, currency: ticket.currency, status: "ACTIVE", idempotencyKey, expiresAt: new Date(Date.now() + RESERVATION_TTL_MINUTES * 60_000) }, include: { event: true, eventTicketType: true } });
    });
    await logAudit({ actorUserId: req.user!.id, action: "eventTicketReservation.created", entityType: "EventTicketReservation", entityId: reservation.id, metadata: { eventId: reservation.eventId, eventTicketTypeId: reservation.eventTicketTypeId, quantity: reservation.quantity, expiresAt: reservation.expiresAt } });
    return res.status(201).json({ reservation, expiresInSeconds: RESERVATION_TTL_MINUTES * 60 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const errors: Record<string, { status: number; message: string }> = {
      TICKET_NOT_FOUND: { status: 404, message: "Ticket type not found" },
      TICKET_NOT_AVAILABLE: { status: 404, message: "Ticket type is not available" },
      TICKETING_DISABLED: { status: 409, message: "Ticketing is not enabled for this event" },
      SALE_CLOSED: { status: 409, message: "Ticket sales are not currently open" },
      MAX_PER_ORDER: { status: 409, message: "Requested quantity exceeds the per-order limit" },
      SOLD_OUT: { status: 409, message: "Not enough tickets available" },
      MAX_PER_ATTENDEE: { status: 409, message: "Attendee ticket limit exceeded" },
    };
    const mapped = errors[code];
    if (mapped) return res.status(mapped.status).json({ error: mapped.message });
    throw error;
  }
});

router.post("/:id/cancel", async (req, res) => {
  const reservation = await prisma.eventTicketReservation.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!reservation) return res.status(404).json({ error: "Reservation not found" });
  if (reservation.status !== "ACTIVE") return res.status(409).json({ error: "Reservation is no longer active" });
  const updated = await prisma.eventTicketReservation.update({ where: { id: reservation.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  await logAudit({ actorUserId: req.user!.id, action: "eventTicketReservation.cancelled", entityType: "EventTicketReservation", entityId: updated.id, metadata: { eventId: updated.eventId, quantity: updated.quantity } });
  res.json({ reservation: updated });
});

export default router;
