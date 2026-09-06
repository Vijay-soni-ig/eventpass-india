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

/**
 * Loads a Payment scoped to one of the caller's own organizers, regardless
 * of whether it's a ticket payment or a stall payment — a payment belonging
 * to another organizer's tenant returns null exactly like a nonexistent
 * payment id (same 404 either way; see routes/bookings.ts for the same
 * "don't distinguish not-found from wrong-tenant" convention elsewhere in
 * this codebase).
 */
async function loadOrganizerPayment(paymentId: string, organizerIds: string[]) {
  if (organizerIds.length === 0) return null;
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      ticketBooking: { include: { exhibition: true } },
      stallBooking: { include: { exhibition: true, exhibitionExhibitor: true } },
    },
  });
  if (!payment) return null;
  const organizerId = payment.ticketBooking?.exhibition.organizerId ?? payment.stallBooking?.exhibition.organizerId;
  if (!organizerId || !organizerIds.includes(organizerId)) return null;
  return payment;
}

// List payments for stall bookings across the caller's organizer(s), plus
// (additive) ticket bookings, so the organizer payments page can show both
// booking types without a second endpoint.
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

// Payment detail: original amount, confirmed refunded total, live refundable
// amount, current status, and the individual refund records — enough for
// the organizer UI to show "Original / Refunded / Remaining" plus history
// without a separate refund-management dashboard.
router.get("/:paymentId", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "payment:view");
  const payment = await loadOrganizerPayment(req.params.paymentId, organizerIds);
  if (!payment) return res.status(404).json({ error: "Payment not found" });

  const [totals, refunds] = await Promise.all([
    getRefundTotals(payment.id),
    prisma.refund.findMany({ where: { paymentId: payment.id }, orderBy: { createdAt: "desc" } }),
  ]);

  res.json({ payment, totals, refunds });
});

/**
 * Manual payment reconciliation — records that money has actually been
 * received (e.g. bank transfer) outside the gateway. Deliberately NOT
 * reachable by the exhibitor/payer: only organizer roles with
 * payment:manage (owner/admin/finance) can call it, and it never accepts a
 * "just trust me, I paid" input from whoever initiated the payment — it's a
 * separate, permissioned action taken by the money side. It reuses the
 * exact same applyPaymentOutcome transition a verified webhook would use,
 * so the effect on the booking/stall/participation is identical either way.
 * Stall-only, unchanged from before this phase.
 */
const markPaymentSchema = z.object({
  status: z.enum(["paid", "failed", "cancelled"]),
  gateway: z.string().optional(),
  gatewayRefId: z.string().optional(),
});

router.patch("/:paymentId", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "payment:manage");
  if (organizerIds.length === 0) {
    return res.status(403).json({ error: "You do not have permission to manage payments" });
  }

  const parsed = markPaymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const booking = await prisma.stallBooking.findFirst({
    where: { paymentId: req.params.paymentId, exhibition: { organizerId: { in: organizerIds } } },
    include: { payment: true },
  });
  if (!booking || !booking.payment) return res.status(404).json({ error: "Payment not found" });
  if (booking.payment.status === "paid" || booking.payment.status === "refunded") {
    return res.status(400).json({ error: `Payment is already ${booking.payment.status}` });
  }

  const result = await applyPaymentOutcome(booking.payment.id, parsed.data.status);
  if (!result.applied) return res.status(409).json({ error: "Payment could not be updated" });

  if (parsed.data.gateway || parsed.data.gatewayRefId) {
    await prisma.payment.update({
      where: { id: booking.payment.id },
      data: { gateway: parsed.data.gateway ?? "manual", gatewayRefId: parsed.data.gatewayRefId },
    });
  }

  const payment = await prisma.payment.findUnique({ where: { id: booking.payment.id } });
  res.json({ payment });
});

/**
 * Refund a payment — ticket or stall, full or partial. The single shared
 * entry point for both booking types (see lib/refundService.ts), replacing
 * the previous stall-only, full-refund-only implementation. `amount` is
 * optional: omitting it refunds the full remaining refundable amount, which
 * the server computes from the database — never from anything the client
 * claims. `idempotencyKey` is required so a retried/duplicated request never
 * triggers a second real provider refund.
 */
const refundRequestSchema = z.object({
  amount: z.number().positive().optional(),
  reason: z.enum(["CUSTOMER_REQUEST", "EVENT_CANCELLED", "DUPLICATE_PAYMENT", "ADMINISTRATIVE", "OTHER"]),
  reasonNote: z.string().max(1000).optional(),
  idempotencyKey: z.string().min(1).max(200),
});

router.post("/:paymentId/refund", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "payment:manage");
  if (organizerIds.length === 0) {
    return res.status(403).json({ error: "You do not have permission to manage payments" });
  }

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

/**
 * Dev/test-only: finalizes a PROCESSING refund (the mock provider always
 * returns "pending" — see lib/payments/mock.ts — so a refund it initiates
 * never resolves on its own). Mirrors routes/payments.ts's mock-complete
 * for payment captures: only reachable when PAYMENT_PROVIDER=mock, and the
 * caller still needs payment:manage on the payment's own organizer — this
 * does not bypass tenant/RBAC checks, it only stands in for the gateway's
 * own later confirmation.
 */
const mockCompleteRefundSchema = z.object({ outcome: z.enum(["success", "failure"]) });

router.post("/:paymentId/refunds/:refundId/mock-complete", async (req, res) => {
  const provider = getPaymentProvider();
  if (!(provider instanceof MockPaymentProvider)) {
    return res.status(403).json({ error: "Mock refund completion is only available when PAYMENT_PROVIDER=mock" });
  }

  const organizerIds = await organizerIdsWithPermission(req.user!, "payment:manage");
  if (organizerIds.length === 0) {
    return res.status(403).json({ error: "You do not have permission to manage payments" });
  }
  const payment = await loadOrganizerPayment(req.params.paymentId, organizerIds);
  if (!payment) return res.status(404).json({ error: "Payment not found" });

  const refund = await prisma.refund.findFirst({ where: { id: req.params.refundId, paymentId: payment.id } });
  if (!refund) return res.status(404).json({ error: "Refund not found" });

  const parsed = mockCompleteRefundSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const outcome =
    parsed.data.outcome === "success"
      ? await finalizeRefundSuccess(refund.id, refund.providerRefundId ?? `mock_refund_${refund.id}`)
      : await finalizeRefundFailure(refund.id, "Simulated refund failure for testing");

  const totals = await getRefundTotals(payment.id);
  res.json({ refund: outcome.refund, payment: outcome.payment, totals });
});

export default router;
