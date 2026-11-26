import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { getTicketInventoryUsage } from "../lib/ticketInventory";
import { requireAuth } from "../middleware/auth";
import { logAudit } from "../lib/audit";
import { eventTicketReservationRateLimit, eventTicketReservationCancelRateLimit } from "../middleware/rateLimit";

const router = Router();
router.use(requireAuth);

const RESERVATION_TTL_MINUTES = 10;

const visitDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Visit date must be a valid calendar date");

const createSchema = z.object({
  eventTicketTypeId: z.string().uuid(),
  attendeeName: z.string().trim().min(1).max(200),
  attendeeEmail: z.string().trim().email(),
  attendeePhone: z.string().trim().max(20).optional(),
  quantity: z.number().int().positive().max(100),
  visitDate: visitDateSchema.optional(),
  registrationId: z.string().uuid().optional(),
});

async function validateEventRegistration(
  tx: Prisma.TransactionClient,
  registrationId: string | undefined,
  eventId: string,
  userId: string,
  attendeeEmail: string,
  quantity: number,
): Promise<string | null> {
  if (!registrationId) return null;
  if (quantity !== 1) throw new Error("REGISTERED_ATTENDEE_QUANTITY");

  // Keep the confirmed-registration state stable through reservation creation.
  // Event -> EventTicketType -> EventRegistration is the reservation lock order.
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id"
    FROM "event_registrations"
    WHERE "id" = ${registrationId} AND "eventId" = ${eventId}
    FOR UPDATE
  `;
  if (locked.length === 0) throw new Error("REGISTRATION_NOT_FOUND");

  const registration = await tx.eventRegistration.findUnique({
    where: { id: registrationId },
    select: { id: true, userId: true, email: true, status: true },
  });
  if (!registration) throw new Error("REGISTRATION_NOT_FOUND");
  if (registration.status !== "CONFIRMED") throw new Error("REGISTRATION_NOT_CONFIRMED");
  if (registration.userId && registration.userId !== userId) throw new Error("REGISTRATION_OTHER_ACCOUNT");
  if (!registration.userId && registration.email !== attendeeEmail.trim().toLowerCase()) {
    throw new Error("REGISTRATION_EMAIL_MISMATCH");
  }
  return registration.id;
}

function reservationMatchesRequest(
  reservation: { eventTicketTypeId: string; eventRegistrationId: string | null; attendeeName: string; attendeeEmail: string; attendeePhone: string | null; quantity: number; visitDate: Date | null },
  request: z.infer<typeof createSchema>,
) {
  return (
    reservation.eventTicketTypeId === request.eventTicketTypeId &&
    reservation.eventRegistrationId === (request.registrationId ?? null) &&
    reservation.attendeeName === request.attendeeName &&
    reservation.attendeeEmail === request.attendeeEmail.trim().toLowerCase() &&
    reservation.attendeePhone === (request.attendeePhone?.trim() || null) &&
    reservation.quantity === request.quantity &&
    (reservation.visitDate?.toISOString().slice(0, 10) ?? null) === (request.visitDate ?? null)
  );
}

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

router.post("/", eventTicketReservationRateLimit, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const idempotencyKey = req.header("Idempotency-Key")?.trim().slice(0, 200) || null;
  if (idempotencyKey) {
    const existing = await prisma.eventTicketReservation.findFirst({ where: { userId: req.user!.id, idempotencyKey }, include: { event: true, eventTicketType: true } });
    if (existing) {
      if (!reservationMatchesRequest(existing, parsed.data)) {
        return res.status(409).json({ error: "Idempotency key has already been used for a different reservation request" });
      }
      return res.status(200).json({ reservation: existing, replayed: true });
    }
  }
  try {
    // Event lifecycle/module changes lock the Event row. Take that same lock
    // before the ticket-type lock so a pause, archive, visibility change, or
    // TICKETING toggle cannot commit between the availability check and hold.
    const ticketTypeSnapshot = await prisma.eventTicketType.findUnique({
      where: { id: parsed.data.eventTicketTypeId },
      select: { eventId: true },
    });
    if (!ticketTypeSnapshot) throw new Error("TICKET_NOT_FOUND");

    const reservation = await prisma.$transaction(async (tx) => {
      const eventLocked = await tx.$queryRaw<{ id: string }[]>`SELECT /* event-ticket-reservation */ "id" FROM "events" WHERE "id" = ${ticketTypeSnapshot.eventId} FOR UPDATE`;
      if (eventLocked.length === 0) throw new Error("TICKET_NOT_AVAILABLE");

      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "event_ticket_types" WHERE "id" = ${parsed.data.eventTicketTypeId} AND "eventId" = ${ticketTypeSnapshot.eventId} FOR UPDATE`;
      if (locked.length === 0) throw new Error("TICKET_NOT_FOUND");
      const now = new Date();
      await tx.eventTicketReservation.updateMany({ where: { eventTicketTypeId: parsed.data.eventTicketTypeId, status: "ACTIVE", expiresAt: { lte: now } }, data: { status: "EXPIRED" } });
      const ticket = await tx.eventTicketType.findFirst({
        where: { id: parsed.data.eventTicketTypeId, eventId: ticketTypeSnapshot.eventId },
        include: { event: { select: { id: true, status: true, visibility: true, archivedAt: true, startDate: true, endDate: true, exhibition: true, moduleEnablements: { where: { moduleType: "TICKETING", enabled: true }, select: { id: true } } } } },
      });
      const linkedExhibition = ticket?.event.exhibition ?? null;
      // This opt-in only enables the shared-inventory reservation hold. EventTicketOrder
      // remains guarded for linked Exhibitions until payment and issuance cutover is accepted.
      const linkedExhibitionReservationsEnabled = !linkedExhibition || (
        process.env.LINKED_EXHIBITION_EVENT_RESERVATIONS_ENABLED === "true" &&
        ticket?.legacyTicketTypeId != null &&
        linkedExhibition.status === "live" &&
        linkedExhibition.visibility === "public"
      );
      if (!ticket || ticket.event.archivedAt || !linkedExhibitionReservationsEnabled || ticket.event.status !== "PUBLISHED" || ticket.event.visibility !== "public") throw new Error("TICKET_NOT_AVAILABLE");
      if (ticket.event.moduleEnablements.length === 0) throw new Error("TICKETING_DISABLED");
      if (linkedExhibition && !parsed.data.visitDate) throw new Error("VISIT_DATE_REQUIRED");
      if (linkedExhibition && parsed.data.visitDate) {
        const startDate = ticket.event.startDate?.toISOString().slice(0, 10);
        const endDate = ticket.event.endDate?.toISOString().slice(0, 10);
        if ((startDate && parsed.data.visitDate < startDate) || (endDate && parsed.data.visitDate > endDate)) {
          throw new Error("VISIT_DATE_OUT_OF_RANGE");
        }
      }
      if (!isWithinSaleWindow(ticket)) throw new Error("SALE_CLOSED");
      if (parsed.data.quantity > ticket.maxPerOrder) throw new Error("MAX_PER_ORDER");
      const eventRegistrationId = await validateEventRegistration(
        tx,
        parsed.data.registrationId,
        ticket.eventId,
        req.user!.id,
        parsed.data.attendeeEmail,
        parsed.data.quantity,
      );
      const usage = await getTicketInventoryUsage(tx, {
        legacyTicketTypeId: ticket.legacyTicketTypeId,
        eventTicketTypeId: ticket.id,
      }, now);
      const remaining = ticket.capacity - usage.totalConsumedQuantity;
      if (parsed.data.quantity > remaining) throw new Error("SOLD_OUT");
      if (ticket.maxPerAttendee !== null) {
        const [attendeeActive, attendeePaid] = await Promise.all([
          tx.eventTicketReservation.aggregate({ where: { eventTicketTypeId: ticket.id, userId: req.user!.id, status: "ACTIVE", expiresAt: { gt: new Date() } }, _sum: { quantity: true } }),
          tx.eventTicketOrder.aggregate({ where: { status: "PAID", userId: req.user!.id, reservation: { eventTicketTypeId: ticket.id } }, _sum: { quantity: true } }),
        ]);
        if ((attendeeActive._sum.quantity ?? 0) + (attendeePaid._sum.quantity ?? 0) + parsed.data.quantity > ticket.maxPerAttendee) throw new Error("MAX_PER_ATTENDEE");
      }
      return tx.eventTicketReservation.create({ data: { eventTicketTypeId: ticket.id, eventId: ticket.eventId, userId: req.user!.id, eventRegistrationId, attendeeName: parsed.data.attendeeName, attendeeEmail: parsed.data.attendeeEmail.trim().toLowerCase(), attendeePhone: parsed.data.attendeePhone?.trim() || null, quantity: parsed.data.quantity, visitDate: parsed.data.visitDate ? new Date(`${parsed.data.visitDate}T00:00:00.000Z`) : null, unitPrice: ticket.price, currency: ticket.currency, status: "ACTIVE", idempotencyKey, expiresAt: new Date(Date.now() + RESERVATION_TTL_MINUTES * 60_000) }, include: { event: true, eventTicketType: true } });
    });
    await logAudit({ actorUserId: req.user!.id, action: "eventTicketReservation.created", entityType: "EventTicketReservation", entityId: reservation.id, metadata: { eventId: reservation.eventId, eventTicketTypeId: reservation.eventTicketTypeId, eventRegistrationId: reservation.eventRegistrationId, quantity: reservation.quantity, visitDate: reservation.visitDate, expiresAt: reservation.expiresAt } });
    return res.status(201).json({ reservation, expiresInSeconds: RESERVATION_TTL_MINUTES * 60 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const errors: Record<string, { status: number; message: string }> = {
      TICKET_NOT_FOUND: { status: 404, message: "Ticket type not found" },
      TICKET_NOT_AVAILABLE: { status: 404, message: "Ticket type is not available" },
      TICKETING_DISABLED: { status: 409, message: "Ticketing is not enabled for this event" },
      SALE_CLOSED: { status: 409, message: "Ticket sales are not currently open" },
      MAX_PER_ORDER: { status: 409, message: "Requested quantity exceeds the per-order limit" },
      VISIT_DATE_REQUIRED: { status: 400, message: "Choose a visit date for this Exhibition ticket" },
      VISIT_DATE_OUT_OF_RANGE: { status: 400, message: "Visit date must fall within the Exhibition dates" },
      REGISTERED_ATTENDEE_QUANTITY: { status: 400, message: "A registered attendee ticket purchase must contain exactly one ticket" },
      REGISTRATION_NOT_FOUND: { status: 404, message: "Registration not found" },
      REGISTRATION_NOT_CONFIRMED: { status: 409, message: "Registration must be confirmed before purchasing a ticket" },
      REGISTRATION_OTHER_ACCOUNT: { status: 403, message: "Registration belongs to another account" },
      REGISTRATION_EMAIL_MISMATCH: { status: 400, message: "Ticket attendee email must match the registration email" },
      SOLD_OUT: { status: 409, message: "Not enough tickets available" },
      MAX_PER_ATTENDEE: { status: 409, message: "Attendee ticket limit exceeded" },
    };
    const mapped = errors[code];
    if (mapped) return res.status(mapped.status).json({ error: mapped.message });
    if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await prisma.eventTicketReservation.findFirst({
        where: { userId: req.user!.id, idempotencyKey },
        include: { event: true, eventTicketType: true },
      });
      if (winner) {
        if (!reservationMatchesRequest(winner, parsed.data)) {
          return res.status(409).json({ error: "Idempotency key has already been used for a different reservation request" });
        }
        return res.status(200).json({ reservation: winner, replayed: true });
      }
    }
    throw error;
  }
});

router.post("/:id/cancel", eventTicketReservationCancelRateLimit, async (req, res) => {
  try {
    // Order creation takes this same row lock before checking the reservation
    // lifecycle. Serializing both operations prevents cancellation from racing
    // with order creation and leaving a payment-pending order for a cancelled
    // reservation.
    const updated = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "event_ticket_reservations" WHERE "id" = ${req.params.id} AND "userId" = ${req.user!.id} FOR UPDATE`;
      if (locked.length === 0) throw new Error("RESERVATION_NOT_FOUND");

      const current = await tx.eventTicketReservation.findUnique({
        where: { id: req.params.id },
        include: { order: { select: { id: true, status: true } } },
      });
      if (!current || current.userId !== req.user!.id) throw new Error("RESERVATION_NOT_FOUND");
      if (current.status !== "ACTIVE") throw new Error("RESERVATION_NOT_ACTIVE");
      if (current.order) throw new Error("ORDER_ALREADY_CREATED");

      return tx.eventTicketReservation.update({
        where: { id: current.id },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
    });

    await logAudit({ actorUserId: req.user!.id, action: "eventTicketReservation.cancelled", entityType: "EventTicketReservation", entityId: updated.id, metadata: { eventId: updated.eventId, quantity: updated.quantity } });
    return res.json({ reservation: updated });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "RESERVATION_NOT_FOUND") return res.status(404).json({ error: "Reservation not found" });
    if (code === "RESERVATION_NOT_ACTIVE") return res.status(409).json({ error: "Reservation is no longer active" });
    if (code === "ORDER_ALREADY_CREATED") return res.status(409).json({ error: "A ticket order already exists for this reservation and cannot be cancelled here" });
    throw error;
  }
});

export default router;
