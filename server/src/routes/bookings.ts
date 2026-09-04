import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { organizerIdsWithPermission } from "../lib/access";
import { createOrderForPayment } from "../lib/paymentService";

const router = Router();

router.use(requireAuth);

// -------- Ticket bookings --------

const createTicketBookingSchema = z.object({
  exhibitionId: z.string(),
  ticketTypeId: z.string(),
  attendeeName: z.string().min(1),
  attendeeEmail: z.string().email(),
  attendeePhone: z.string().optional(),
  quantity: z.number().int().positive(),
  visitDate: z.string().optional(),
});

router.post("/tickets", async (req, res) => {
  const parsed = createTicketBookingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { exhibitionId, ticketTypeId, quantity, visitDate, ...attendee } = parsed.data;

  const ticketType = await prisma.ticketType.findFirst({
    where: {
      id: ticketTypeId,
      exhibitionId,
      exhibition: { status: "live", visibility: "public" },
    },
  });
  if (!ticketType) return res.status(404).json({ error: "Ticket type not found" });

  const unitPrice = Number(ticketType.price);
  const amount = unitPrice * quantity;

  // Every ticket starts unpaid: a Payment/gateway order is created up
  // front, and the booking only ever reaches paymentStatus "paid" via a
  // verified checkout signature or webhook (see routes/payments.ts,
  // routes/paymentWebhooks.ts) — never from this create call itself.
  const { payment, order } = await createOrderForPayment({
    amount,
    notes: { exhibitionId, ticketTypeId, buyerUserId: req.user!.id },
  });

  const booking = await prisma.ticketBooking.create({
    data: {
      exhibitionId,
      ticketTypeId,
      buyerUserId: req.user!.id,
      quantity,
      unitPrice,
      amountPaid: amount,
      paymentId: payment.id,
      visitDate: visitDate ? new Date(visitDate) : undefined,
      ...attendee,
    },
  });
  res.status(201).json({ booking, payment, order });
});

router.get("/tickets/mine", async (req, res) => {
  const bookings = await prisma.ticketBooking.findMany({
    where: { buyerUserId: req.user!.id },
    include: { exhibition: true, ticketType: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ bookings });
});

router.get("/tickets/lookup/:qrCode", requireOrganizerAccess, async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "scanner:use");
  const booking = organizerIds.length
    ? await prisma.ticketBooking.findFirst({
        where: { qrCode: req.params.qrCode, exhibition: { organizerId: { in: organizerIds } } },
        include: { exhibition: true, ticketType: true },
      })
    : null;
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  res.json({ booking });
});

router.patch("/tickets/:id/check-in", requireOrganizerAccess, async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "scanner:use");
  const booking = organizerIds.length
    ? await prisma.ticketBooking.findFirst({
        where: { id: req.params.id, exhibition: { organizerId: { in: organizerIds } } },
      })
    : null;
  if (!booking) return res.status(404).json({ error: "Booking not found" });

  const updated = await prisma.ticketBooking.update({
    where: { id: booking.id },
    data: { checkInStatus: true, checkInTime: new Date() },
  });
  res.json({ booking: updated });
});

router.get("/tickets", requireOrganizerAccess, async (req, res) => {
  const exhibitionId = req.query.exhibitionId as string | undefined;
  const organizerIds = await organizerIdsWithPermission(req.user!, "booking:view");
  const bookings = organizerIds.length
    ? await prisma.ticketBooking.findMany({
        where: {
          exhibition: { organizerId: { in: organizerIds } },
          ...(exhibitionId ? { exhibitionId } : {}),
        },
        include: { exhibition: true, ticketType: true },
        orderBy: { createdAt: "desc" },
      })
    : [];
  res.json({ bookings });
});

// -------- Stall bookings --------
//
// There is deliberately no direct "POST /stalls" here anymore. Stalls are
// rented by exhibitor businesses, not purchased by visitors — the old
// endpoint let any authenticated user claim any stall with freeform buyer
// text, bypassing organizer approval entirely (the "direct exhibitor to
// exhibition ownership" bug). A stall booking can now only be created via
// the exhibitor participation workflow (see exhibitorParticipations.ts:
// POST /api/exhibitor/participations/:id/stall, then .../payment), which
// requires an approved application first.

router.get("/stalls/mine", async (req, res) => {
  const bookings = await prisma.stallBooking.findMany({
    where: { buyerUserId: req.user!.id },
    include: { exhibition: true, stall: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ bookings });
});

router.get("/stalls", requireOrganizerAccess, async (req, res) => {
  const exhibitionId = req.query.exhibitionId as string | undefined;
  const organizerIds = await organizerIdsWithPermission(req.user!, "booking:view");
  const bookings = organizerIds.length
    ? await prisma.stallBooking.findMany({
        where: {
          exhibition: { organizerId: { in: organizerIds } },
          ...(exhibitionId ? { exhibitionId } : {}),
        },
        include: { exhibition: true, stall: true },
        orderBy: { createdAt: "desc" },
      })
    : [];
  res.json({ bookings });
});

export default router;
