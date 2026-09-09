import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { organizerIdsWithPermission } from "../lib/access";
import { applyPaymentOutcome } from "../lib/paymentService";
import { getPaymentProvider, MockPaymentProvider } from "../lib/payments";
import { requestRefund, finalizeRefundSuccess, finalizeRefundFailure, getRefundTotals, RefundError } from "../lib/refundService";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);

async function loadOrganizerPayment(paymentId: string, organizerIds: string[]) {
  if (organizerIds.length === 0) return null;
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { ticketBooking: { include: { exhibition: true } }, stallBooking: { include: { exhibition: true, exhibitionExhibitor: true } } } });
  if (!payment) return null;
  const organizerId = payment.ticketBooking?.exhibition.organizerId ?? payment.stallBooking?.exhibition.organizerId;
  if (!organizerId || !organizerIds.includes(organizerId)) return null;
  return payment;
}

router.get("/", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "payment:view");
  const exhibitionId = req.query.exhibitionId as string | undefined;
  const [stallBookings, ticketBookings] = organizerIds.length ? await Promise.all([
    prisma.stallBooking.findMany({ where: { exhibition: { organizerId: { in: organizerIds } }, ...(exhibitionId ? { exhibitionId } : {}) }, include: { payment: true, stall: true, exhibition: true, exhibitionExhibitor: { include: { business: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.ticketBooking.findMany({ where: { exhibition: { organizerId: { in: organizerIds } }, ...(exhibitionId ? { exhibitionId } : {}) }, include: { payment: true, exhibition: true, ticketType: true }, orderBy: { createdAt: "desc" } }),
  ]) : [[], []];
  res.json({ bookings: stallBookings, ticketBookings });
});

router.get("/:paymentId", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "payment:view");
  const payment = await loadOrganizerPayment(req.params.paymentId, organizerIds);
  if (!payment) return res.status(404).json({ error: "Payment not found" });
  const [totals, refunds] = await Promise.all([getRefundTotals(payment.id), prisma.refund.findMany({ where: { paymentId: payment.id }, orderBy: { createdAt: "desc" } })]);
  res.json({ payment, totals, refunds });
});

const markPaymentSchema = z.object({ status: z.enum(["paid", "failed", "cancelled"]), gateway: z.string().trim().min(1).max(100).optional(), gatewayRefId: z.string().trim().min(1).max(200).optional() });

router.patch("/:paymentId", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "payment:manage");
  if (organizerIds.length === 0) return res.status(403).json({ error: "You do not have permission to manage payments" });
  const parsed = markPaymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const booking = await prisma.stallBooking.findFirst({ where: { paymentId: req.params.paymentId, exhibition: { organizerId: { in: organizerIds } } }, include: { payment: true } });
  if (!booking || !booking.payment) return res.status(404).json({ error: "Payment not found" });
  if (["paid", "partially_refunded", "refunded", "cancelled"].includes(booking.payment.status)) return res.status(400).json({ error: `Payment is already ${booking.payment.status}` });
  if (parsed.data.status === "paid" && !parsed.data.gatewayRefId) return res.status(400).json({ error: "gatewayRefId is required when manually marking a payment as paid" });
  const result = await applyPaymentOutcome(booking.payment.id, parsed.data.status, { providerPaymentId: parsed.data.gatewayRefId });
  if (!result.applied) return res.status(409).json({ error: "Payment could not be updated" });
  if (parsed.data.gateway || parsed.data.gatewayRefId) await prisma.payment.update({ where: { id: booking.payment.id }, data: { gateway: parsed.data.gateway ?? "manual", gatewayRefId: parsed.data.gatewayRefId } });
  const payment = await prisma.payment.findUnique({ where: { id: booking.payment.id } });
  res.json({ payment });
});

const refundRequestSchema = z.object({ amount: z.number().positive().optional(), reason: z.enum(["CUSTOMER_REQUEST", "EVENT_CANCELLED", "DUPLICATE_PAYMENT", "ADMINISTRATIVE", "OTHER"]), reasonNote: z.string().max(1000).optional(), idempotencyKey: z.string().trim().min(1).max(200) });

router.post("/:paymentId/refund", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "payment:manage");
  if (organizerIds.length === 0) return res.status(403).json({ error: "You do not have permission to manage payments" });
  const payment = await loadOrganizerPayment(req.params.paymentId, organizerIds);
  if (!payment) return res.status(404).json({ error: "Payment not found" });
  const parsed = refundRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  try {
    const result = await requestRefund({ paymentId: payment.id, amount: parsed.data.amount, reason: parsed.data.reason, reasonNote: parsed.data.reasonNote, idempotencyKey: parsed.data.idempotencyKey, requestedByUserId: req.user!.id });
    const totals = await getRefundTotals(payment.id);
    res.status(201).json({ refund: result.refund, payment: result.payment, totals });
  } catch (err) {
    if (err instanceof RefundError) {
      const status = ["EXCEEDS_REMAINING", "INVALID_AMOUNT", "FREE_PAYMENT", "PAYMENT_NOT_REFUNDABLE"].includes(err.code) ? 400 : 404;
      return res.status(status).json({ error: err.message, code: err.code });
    }
    throw err;
  }
});

router.get("/:paymentId/refunds", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "payment:view");
  const payment = await loadOrganizerPayment(req.params.paymentId, organizerIds);
  if (!payment) return res.status(404).json({ error: "Payment not found" });
  const [totals, refunds] = await Promise.all([getRefundTotals(payment.id), prisma.refund.findMany({ where: { paymentId: payment.id }, orderBy: { createdAt: "desc" } })]);
  res.json({ totals, refunds });
});

const mockCompleteRefundSchema = z.object({ outcome: z.enum(["success", "failure"]) });
router.post("/:paymentId/refunds/:refundId/mock-complete", async (req, res) => {
  const provider = getPaymentProvider();
  if (!(provider instanceof MockPaymentProvider)) return res.status(403).json({ error: "Mock refund completion is only available when PAYMENT_PROVIDER=mock" });
  const organizerIds = await organizerIdsWithPermission(req.user!, "payment:manage");
  if (organizerIds.length === 0) return res.status(403).json({ error: "You do not have permission to manage payments" });
  const payment = await loadOrganizerPayment(req.params.paymentId, organizerIds);
  if (!payment) return res.status(404).json({ error: "Payment not found" });
  const refund = await prisma.refund.findFirst({ where: { id: req.params.refundId, paymentId: payment.id } });
  if (!refund) return res.status(404).json({ error: "Refund not found" });
  const parsed = mockCompleteRefundSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const outcome = parsed.data.outcome === "success" ? await finalizeRefundSuccess(refund.id, refund.providerRefundId ?? `mock_refund_${refund.id}`) : await finalizeRefundFailure(refund.id, "Simulated refund failure for testing");
  const totals = await getRefundTotals(payment.id);
  res.json({ refund: outcome.refund, payment: outcome.payment, totals });
});

export default router;
