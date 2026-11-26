import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { calculatePricing } from "../lib/pricingEngine";
import { getPaymentProvider } from "../lib/payments";
import { pricingBreakdownToPaymentData, applyPaymentOutcome } from "../lib/paymentService";
import { logAudit } from "../lib/audit";
import { eventTicketOrderRateLimit } from "../middleware/rateLimit";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({ reservationId: z.string().uuid() });

router.post("/", eventTicketOrderRateLimit, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const idempotencyKey = req.header("Idempotency-Key")?.trim().slice(0, 200) || null;

  const replayExistingOrder = async (): Promise<boolean> => {
    if (!idempotencyKey) return false;
    const existing = await prisma.eventTicketOrder.findFirst({
      where: { userId: req.user!.id, idempotencyKey },
      include: { payment: true, reservation: true },
    });
    if (!existing) return false;

    // An idempotency key identifies one request payload. Never let a retry
    // silently return an order for a different reservation.
    if (existing.reservationId !== parsed.data.reservationId) {
      res.status(409).json({
        error: "Idempotency key has already been used for a different reservation",
      });
      return true;
    }

    // A failed or cancelled order is terminal for this reservation. Never
    // replay it as a successful response with a null checkout: clients must
    // create a fresh reservation before another payment attempt.
    if (
      existing.status === "FAILED" ||
      existing.status === "CANCELLED" ||
      existing.status === "REFUNDED" ||
      existing.payment?.status === "failed" ||
      existing.payment?.status === "cancelled" ||
      existing.payment?.status === "refunded" ||
      existing.payment?.status === "partially_refunded"
    ) {
      res.status(409).json({
        error: {
          code: "EVENT_TICKET_ORDER_NOT_RETRYABLE",
          message: "This payment attempt is no longer active. Start a new reservation to try again.",
        },
      });
      return true;
    }

    // The order is committed before the provider creates checkout. During that
    // short window, ask the client to retry rather than returning incomplete
    // checkout details as if the replay had succeeded.
    if (existing.status === "PAYMENT_PENDING" && !existing.payment?.providerOrderId) {
      res.status(409).json({
        error: "Order checkout is still being initialized; retry shortly",
      });
      return true;
    }

    let checkout: {
      providerOrderId: string;
      publicKey: string | null;
      amount: number;
      currency: string;
      provider: string;
    } | null = null;
    if (existing.status === "PAYMENT_PENDING" && existing.payment?.providerOrderId) {
      const provider = getPaymentProvider();
      checkout = {
        providerOrderId: existing.payment.providerOrderId,
        publicKey: provider.publicKey,
        amount: Number(existing.totalAmount),
        currency: existing.currency,
        provider: provider.name,
      };
    }

    res.status(200).json({
      order: existing,
      payment: existing.payment,
      checkout,
      replayed: true,
    });
    return true;
  };

  if (await replayExistingOrder()) return;

  const reservation = await prisma.eventTicketReservation.findFirst({ where: { id: parsed.data.reservationId, userId: req.user!.id }, include: { event: { include: { exhibition: true, moduleEnablements: { where: { moduleType: "TICKETING", enabled: true }, select: { id: true } } } }, eventTicketType: true } });
  if (!reservation) return res.status(404).json({ error: "Reservation not found" });
  if (reservation.event.moduleEnablements.length === 0) return res.status(409).json({ error: "Ticketing module is not enabled for this event" });

  let paymentId: string | null = null;
  try {
    const created = await prisma.$transaction(async (tx) => {
      // Serialize checkout with Event status/archive/visibility and module
      // changes. Use Event -> reservation lock order for every order attempt.
      const eventLocked = await tx.$queryRaw<{ id: string }[]>`SELECT /* event-ticket-order */ "id" FROM "events" WHERE "id" = ${reservation.eventId} FOR UPDATE`;
      if (eventLocked.length === 0) throw new Error("EVENT_UNAVAILABLE");

      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "event_ticket_reservations" WHERE "id" = ${reservation.id} FOR UPDATE`;
      if (locked.length === 0) throw new Error("RESERVATION_NOT_FOUND");
      const current = await tx.eventTicketReservation.findUnique({ where: { id: reservation.id }, include: { event: { include: { exhibition: true, moduleEnablements: { where: { moduleType: "TICKETING", enabled: true }, select: { id: true } } } }, eventTicketType: true, order: true } });
      if (!current || current.userId !== req.user!.id) throw new Error("RESERVATION_NOT_FOUND");
      if (current.order) throw new Error("ORDER_EXISTS");
      if (current.status !== "ACTIVE" || current.expiresAt <= new Date()) throw new Error("RESERVATION_EXPIRED");
      if (current.event.moduleEnablements.length === 0) throw new Error("TICKETING_DISABLED");
      if (current.eventTicketType.eventId !== current.eventId) throw new Error("EVENT_UNAVAILABLE");
      if (current.event.status !== "PUBLISHED" || current.event.visibility !== "public" || current.event.archivedAt) throw new Error("EVENT_UNAVAILABLE");

      const linkedExhibition = current.event.exhibition;
      if (current.event.eventType === "EXHIBITION" && !linkedExhibition) throw new Error("EVENT_UNAVAILABLE");
      if (linkedExhibition) {
        const legacyTicketTypeId = current.eventTicketType.legacyTicketTypeId;
        const legacyTicketType = legacyTicketTypeId
          ? await tx.ticketType.findUnique({
              where: { id: legacyTicketTypeId },
              select: { exhibitionId: true },
            })
          : null;
        const linkedCheckoutAllowed =
          process.env.LINKED_EXHIBITION_EVENT_CHECKOUT_ENABLED === "true" &&
          current.event.eventType === "EXHIBITION" &&
          linkedExhibition.eventId === current.event.id &&
          linkedExhibition.status === "live" &&
          linkedExhibition.visibility === "public" &&
          legacyTicketType?.exhibitionId === linkedExhibition.id;
        if (!linkedCheckoutAllowed) throw new Error("EVENT_UNAVAILABLE");
      }

      const breakdown = await calculatePricing(Number(current.unitPrice) * current.quantity);
      const payment = await tx.payment.create({ data: { ...pricingBreakdownToPaymentData(breakdown), currency: current.currency, provider: getPaymentProvider().name, status: "created" } });
      paymentId = payment.id;
      const order = await tx.eventTicketOrder.create({
        data: { eventId: current.eventId, reservationId: current.id, userId: current.userId, paymentId: payment.id, quantity: current.quantity, unitPrice: current.unitPrice, subtotal: Number(current.unitPrice) * current.quantity, totalAmount: breakdown.totalAmount, currency: current.currency, status: "PAYMENT_PENDING", idempotencyKey },
        include: { reservation: true, payment: true },
      });
      return { order, payment, breakdown };
    });

    if (created.breakdown.totalAmount === 0) {
      const result = await applyPaymentOutcome(created.payment.id, "paid", { providerPaymentId: `free_${created.payment.id}` });
      const payment = result.payment ?? created.payment;
      await logAudit({ actorUserId: req.user!.id, action: "eventTicketOrder.created", entityType: "EventTicketOrder", entityId: created.order.id, metadata: { eventId: created.order.eventId, reservationId: created.order.reservationId, paymentId: payment.id, totalAmount: 0 } });
      return res.status(201).json({ order: { ...created.order, status: "PAID" }, payment, checkout: null });
    }

    const provider = getPaymentProvider();
    const gatewayOrder = await provider.createOrder({ amount: created.breakdown.totalAmount, currency: created.order.currency, receipt: created.payment.id, notes: { eventId: created.order.eventId, reservationId: created.order.reservationId, eventTicketOrderId: created.order.id, userId: req.user!.id } });
    const payment = await prisma.payment.update({ where: { id: created.payment.id }, data: { providerOrderId: gatewayOrder.providerOrderId, metadata: gatewayOrder.raw as Prisma.InputJsonValue } });
    await logAudit({ actorUserId: req.user!.id, action: "eventTicketOrder.created", entityType: "EventTicketOrder", entityId: created.order.id, metadata: { eventId: created.order.eventId, reservationId: created.order.reservationId, paymentId: payment.id, totalAmount: created.order.totalAmount } });
    return res.status(201).json({ order: created.order, payment, checkout: { providerOrderId: gatewayOrder.providerOrderId, publicKey: provider.publicKey, amount: created.breakdown.totalAmount, currency: created.order.currency, provider: provider.name } });
  } catch (error) {
    if (paymentId) {
      // A provider-order initialization failure is a terminal checkout
      // attempt. Lock the payment first (the same order used by webhook
      // finalization), then fail the order and release its reservation
      // atomically. A late provider capture will follow the existing
      // cancelled-reservation compensation/refund path.
      const failedCheckout = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "payments" WHERE "id" = ${paymentId} FOR UPDATE`;
        const payment = await tx.payment.findUnique({ where: { id: paymentId }, select: { status: true } });
        if (!payment || payment.status !== "created") return false;

        const order = await tx.eventTicketOrder.findFirst({
          where: { paymentId, status: "PAYMENT_PENDING" },
          select: { id: true, reservationId: true },
        });
        if (!order) return false;

        const failedPayment = await tx.payment.updateMany({
          where: { id: paymentId, status: "created" },
          data: { status: "failed", failureReason: "Payment order creation failed" },
        });
        if (failedPayment.count !== 1) return false;

        const failedOrder = await tx.eventTicketOrder.updateMany({
          where: { id: order.id, status: "PAYMENT_PENDING" },
          data: { status: "FAILED" },
        });
        if (failedOrder.count !== 1) throw new Error("EVENT_TICKET_ORDER_FAILURE_TRANSITION_CONFLICT");

        await tx.eventTicketReservation.updateMany({
          where: { id: order.reservationId, status: "ACTIVE" },
          data: { status: "CANCELLED", cancelledAt: new Date() },
        });
        return true;
      });

      if (failedCheckout) {
        return res.status(502).json({
          error: {
            code: "EVENT_TICKET_CHECKOUT_INITIALIZATION_FAILED",
            message: "Payment checkout could not be initialized. Your reservation has been released; please retry.",
          },
        });
      }
    }
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const isUniqueConflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    // A concurrent request can miss the initial lookup, then lose the
    // reservation lock or unique idempotency constraint to the first request.
    // Resolve that race to the same replay response instead of a generic error.
    if ((code === "ORDER_EXISTS" || isUniqueConflict) && await replayExistingOrder()) return;
    const map: Record<string, [number, string]> = { TICKETING_DISABLED: [409, "Ticketing module is not enabled for this event"], RESERVATION_NOT_FOUND: [404, "Reservation not found"], ORDER_EXISTS: [409, "An order already exists for this reservation"], RESERVATION_EXPIRED: [409, "Reservation has expired"], EVENT_UNAVAILABLE: [409, "Event is no longer available"] };
    if (map[code]) return res.status(map[code][0]).json({ error: map[code][1] });
    throw error;
  }
});

router.get("/mine", async (req, res) => {
  const orders = await prisma.eventTicketOrder.findMany({ where: { userId: req.user!.id }, include: { payment: true, reservation: { include: { event: true, eventTicketType: true } } }, orderBy: { createdAt: "desc" } });
  res.json({ orders });
});

export default router;
