import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { financialMutationRateLimit } from "../middleware/rateLimit";
import { isPlatformAdmin, organizerIdsWithPermission } from "../lib/access";
import { can, organizerRoleToRole, type Permission } from "../lib/permissions";
import { lockOrganizerForEntitlement } from "../lib/entitlementService";
import { applyPaymentOutcome } from "../lib/paymentService";
import { getPaymentProvider, MockPaymentProvider } from "../lib/payments";
import { requestRefund, finalizeRefundSuccess, finalizeRefundFailure, getRefundTotals, RefundError } from "../lib/refundService";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);

async function lockAndResolveOrganizerIds(
  tx: Prisma.TransactionClient,
  user: NonNullable<Express.Request["user"]>,
  permission: Permission,
  candidateIds: string[],
): Promise<string[]> {
  if (isPlatformAdmin(user)) return candidateIds;

  // Membership mutations take this same parent-row lock. Lock in a stable
  // order to avoid deadlocks when a user belongs to multiple organizers.
  for (const organizerId of [...candidateIds].sort()) {
    await lockOrganizerForEntitlement(tx, organizerId);
  }

  const memberships = await tx.organizerMembership.findMany({
    where: { organizerId: { in: candidateIds }, userId: user.id, status: "active", organizer: { suspended: false } },
    select: { organizerId: true, role: true },
  });
  return memberships.filter((membership) => can(organizerRoleToRole(membership.role), permission)).map((membership) => membership.organizerId);
}

async function loadOrganizerPayment(client: typeof prisma | Prisma.TransactionClient, paymentId: string, organizerIds: string[]) {
  if (organizerIds.length === 0) return null;
  const payment = await client.payment.findUnique({
    where: { id: paymentId },
    include: {
      ticketBooking: { include: { exhibition: true } },
      eventTicketOrder: { include: { event: true } },
      stallBooking: { include: { exhibition: true, exhibitionExhibitor: true } },
    },
  });
  if (!payment) return null;
  const organizerId = payment.ticketBooking?.exhibition.organizerId ?? payment.eventTicketOrder?.event.organizerId ?? payment.stallBooking?.exhibition.organizerId;
  if (!organizerId || !organizerIds.includes(organizerId)) return null;
  return payment;
}

router.get("/", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "payment:view");
  const exhibitionId = req.query.exhibitionId as string | undefined;
  const [stallBookings, ticketBookings] = organizerIds.length
    ? await Promise.all([
        prisma.stallBooking.findMany({
          where: { exhibition: { organizerId: { in: organizerIds } }, ...(exhibitionId ? { exhibitionId } : {}) },
          include: { payment: true, stall: true, exhibition: true, exhibitionExhibitor: { include: { business: true } } },
          orderBy: { createdAt: "desc" },
        }),
        prisma.ticketBooking.findMany({
          where: { exhibition: { organizerId: { in: organizerIds } }, ...(exhibitionId ? { exhibitionId } : {}) },
          include: { payment: true, exhibition: true, ticketType: true },
          orderBy: { createdAt: "desc" },
        }),
      ])
    : [[], []];
  res.json({ bookings: stallBookings, ticketBookings });
});

router.get("/:paymentId", async (req, res) => {
  const candidateIds = await organizerIdsWithPermission(req.user!, "payment:view");
  if (candidateIds.length === 0) return res.status(404).json({ error: "Payment not found" });

  // Serialize the authorization decision and sensitive payment read with
  // organizer membership revocation, role downgrade and suspension.
  const result = await prisma.$transaction(async (tx) => {
    const organizerIds = await lockAndResolveOrganizerIds(tx, req.user!, "payment:view", candidateIds);
    const payment = await loadOrganizerPayment(tx, req.params.paymentId, organizerIds);
    if (!payment) return null;
    const [currentPayment, pending, refunds] = await Promise.all([
      tx.payment.findUniqueOrThrow({ where: { id: payment.id } }),
      tx.refund.aggregate({
        where: { paymentId: payment.id, status: { in: ["REQUESTED", "PROCESSING"] } },
        _sum: { amount: true },
      }),
      tx.refund.findMany({ where: { paymentId: payment.id }, orderBy: { createdAt: "desc" } }),
    ]);
    const originalAmount = Number(currentPayment.amount);
    const refundedAmount = Number(currentPayment.refundedAmount);
    const pendingAmount = Number(pending._sum.amount ?? 0);
    const totals = {
      originalAmount,
      refundedAmount,
      pendingAmount,
      refundableAmount: Math.round((originalAmount - refundedAmount - pendingAmount + Number.EPSILON) * 100) / 100,
    };
    return { payment, totals, refunds };
  });
  if (!result) return res.status(404).json({ error: "Payment not found" });
  res.json(result);
});

const markPaymentSchema = z.object({
  status: z.enum(["paid", "failed", "cancelled"]),
  gateway: z.string().max(100).optional(),
  gatewayRefId: z.string().min(1).max(200).optional(),
});

router.patch("/:paymentId", financialMutationRateLimit, async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "payment:manage");
  if (organizerIds.length === 0) return res.status(403).json({ error: "You do not have permission to manage payments" });

  const parsed = markPaymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  if (parsed.data.status === "paid" && !parsed.data.gatewayRefId) {
    return res.status(400).json({ error: "gatewayRefId is required when manually marking a payment as paid" });
  }

  const booking = await prisma.stallBooking.findFirst({
    where: { paymentId: req.params.paymentId, exhibition: { organizerId: { in: organizerIds } } },
    include: { payment: true },
  });
  if (!booking || !booking.payment) return res.status(404).json({ error: "Payment not found" });
  if (booking.payment.status === "paid" || booking.payment.status === "refunded" || booking.payment.status === "partially_refunded") {
    return res.status(400).json({ error: `Payment is already ${booking.payment.status}` });
  }

  const result = await applyPaymentOutcome(booking.payment.id, parsed.data.status, {
    providerPaymentId: parsed.data.gatewayRefId,
  });
  if (!result.applied) return res.status(409).json({ error: "Payment could not be updated" });

  if (parsed.data.gateway || parsed.data.gatewayRefId) {
    await prisma.payment.update({
      where: { id: booking.payment.id },
      data: { gateway: parsed.data.gateway ?? "manual", gatewayRefId: parsed.data.gatewayRefId },
    });
  }

  const payment = await prisma.payment.findUnique({ where: { id: booking.payment.id } });
  await logAudit({
    actorUserId: req.user!.id,
    action: "payment.status.manually_updated",
    entityType: "Payment",
    entityId: booking.payment.id,
    metadata: {
      stallBookingId: booking.id,
      exhibitionId: booking.exhibitionId,
      previousStatus: booking.payment.status,
      newStatus: parsed.data.status,
      gateway: parsed.data.gateway ?? (parsed.data.gatewayRefId ? "manual" : undefined),
      gatewayRefId: parsed.data.gatewayRefId,
      requiresRefund: result.requiresRefund === true,
    },
  });

  // A manual confirmation is still a financial capture. If the stall was
  // released or reassigned before this confirmation, keep the payment in the
  // ledger as paid but never confirm the participation or reclaim inventory.
  // Use the same idempotency key as webhook/checkout compensation so racing
  // confirmation paths converge on one refund request.
  if (parsed.data.status === "paid" && result.requiresRefund && result.payment) {
    const compensation = await requestRefund({
      paymentId: result.payment.id,
      reason: "ADMINISTRATIVE",
      reasonNote: result.refundReason ?? "Manually confirmed payment could not be applied to its original stall reservation",
      idempotencyKey: `late-payment-compensation:${result.payment.id}`,
      requestedByUserId: req.user!.id,
    });
    return res.status(202).json({
      error: "Payment was recorded, but the stall booking could not be confirmed. A compensation refund was initiated.",
      code: "PAYMENT_REQUIRES_COMPENSATION",
      payment: compensation.payment,
      refund: compensation.refund,
    });
  }

  res.json({ payment });
});

const refundRequestSchema = z.object({
  amount: z.number().positive().optional(),
  reason: z.enum(["CUSTOMER_REQUEST", "EVENT_CANCELLED", "DUPLICATE_PAYMENT", "ADMINISTRATIVE", "OTHER"]),
  reasonNote: z.string().max(1000).optional(),
  idempotencyKey: z.string().min(1).max(200),
});

router.post("/:paymentId/refund", financialMutationRateLimit, async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "payment:manage");
  if (organizerIds.length === 0) return res.status(403).json({ error: "You do not have permission to manage payments" });
  const payment = await loadOrganizerPayment(req.params.paymentId, organizerIds);
  if (!payment) return res.status(404).json({ error: "Payment not found" });
  const parsed = refundRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const { refund, payment: updatedPayment } = await requestRefund({
      paymentId: payment.id,
      amount: parsed.data.amount,
      reason: parsed.data.reason,
      reasonNote: parsed.data.reasonNote,
      idempotencyKey: parsed.data.idempotencyKey,
      requestedByUserId: req.user!.id,
    });
    const totals = await getRefundTotals(payment.id);
    res.status(201).json({ refund, payment: updatedPayment, totals });
  } catch (err) {
    if (err instanceof RefundError) {
      const status = err.code === "EXCEEDS_REMAINING" || err.code === "INVALID_AMOUNT" || err.code === "FREE_PAYMENT" || err.code === "PAYMENT_NOT_REFUNDABLE" ? 400 : 404;
      return res.status(status).json({ error: err.message, code: err.code });
    }
    throw err;
  }
});

router.get("/:paymentId/refunds", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "payment:view");
  const payment = await loadOrganizerPayment(req.params.paymentId, organizerIds);
  if (!payment) return res.status(404).json({ error: "Payment not found" });
  const [totals, refunds] = await Promise.all([
    getRefundTotals(payment.id),
    prisma.refund.findMany({ where: { paymentId: payment.id }, orderBy: { createdAt: "desc" } }),
  ]);
  res.json({ totals, refunds });
});

const mockCompleteRefundSchema = z.object({ outcome: z.enum(["success", "failure"]) });
router.post("/:paymentId/refunds/:refundId/mock-complete", financialMutationRateLimit, async (req, res) => {
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

  const outcome = parsed.data.outcome === "success"
    ? await finalizeRefundSuccess(refund.id, refund.providerRefundId ?? `mock_refund_${refund.id}`)
    : await finalizeRefundFailure(refund.id, "Simulated refund failure for testing");
  const totals = await getRefundTotals(payment.id);
  res.json({ refund: outcome.refund, payment: outcome.payment, totals });
});

export default router;
