import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { calculatePricing } from "../lib/pricingEngine";
import { getPaymentProvider } from "../lib/payments";
import { pricingBreakdownToPaymentData, applyPaymentOutcome } from "../lib/paymentService";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({ reservationId: z.string().uuid() });

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const idempotencyKey = req.header("Idempotency-Key")?.trim().slice(0, 200) || null;

  if (idempotencyKey) {
    const existing = await prisma.eventTicketOrder.findFirst({ where: { userId: req.user!.id, idempotencyKey }, include: { payment: true, reservation: true } });
    if (existing) return res.status(200).json({ order: existing, payment: existing.payment, replayed: true });
  }

  const reservation = await prisma.eventTicketReservation.findFirst({ where: { id: parsed.data.reservationId, userId: req.user!.id }, include: { event: { include: { exhibition: true } }, eventTicketType: true } });
  if (!reservation) return res.status(404).json({ error: "Reservation not found" });

  let paymentId: string | null = null;
  try {
    const created = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "event_ticket_reservations" WHERE "id" = ${reservation.id} FOR UPDATE`;
      if (locked.length === 0) throw new Error("RESERVATION_NOT_FOUND");
      const current = await tx.eventTicketReservation.findUnique({ where: { id: reservation.id }, include: { event: { include: { exhibition: true } }, eventTicketType: true, order: true } });
      if (!current || current.userId !== req.user!.id) throw new Error("RESERVATION_NOT_FOUND");
      if (current.order) throw new Error("ORDER_EXISTS");
      if (current.status !== "ACTIVE" || current.expiresAt <= new Date()) throw new Error("RESERVATION_EXPIRED");
      if (current.event.status !== "PUBLISHED" || current.event.visibility !== "public" || current.event.archivedAt || current.event.exhibition) throw new Error("EVENT_UNAVAILABLE");

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
      await prisma.payment.updateMany({ where: { id: paymentId, status: "created" }, data: { status: "failed", failureReason: "Payment order creation failed" } });
      await prisma.eventTicketOrder.updateMany({ where: { paymentId, status: "PAYMENT_PENDING" }, data: { status: "FAILED" } });
    }
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const map: Record<string, [number, string]> = { RESERVATION_NOT_FOUND: [404, "Reservation not found"], ORDER_EXISTS: [409, "An order already exists for this reservation"], RESERVATION_EXPIRED: [409, "Reservation has expired"], EVENT_UNAVAILABLE: [409, "Event is no longer available"] };
    if (map[code]) return res.status(map[code][0]).json({ error: map[code][1] });
    throw error;
  }
});

router.get("/mine", async (req, res) => {
  const orders = await prisma.eventTicketOrder.findMany({ where: { userId: req.user!.id }, include: { payment: true, reservation: { include: { event: true, eventTicketType: true } } }, orderBy: { createdAt: "desc" } });
  res.json({ orders });
});

export default router;
