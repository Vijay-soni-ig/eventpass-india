import { Router } from "express";
import { z } from "zod";
import type { Prisma, User } from "@prisma/client";
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

type PaymentPermission = Extract<Permission, "payment:view" | "payment:manage">;

class OrganizerPaymentAccessError extends Error {
  constructor() {
    super("Payment not found");
    this.name = "OrganizerPaymentAccessError";
  }
}

/**
 * Serialize organizer payment reads and mutations with membership revocation,
 * role changes and organizer suspension. The caller's permission is re-read
 * only after acquiring the same organizer row lock used by those mutations.
 */
async function lockAndCheckOrganizerPaymentPermission(
  tx: Prisma.TransactionClient,
  organizerId: string,
  user: User,
  permission: PaymentPermission,
): Promise<boolean> {
  await lockOrganizerForEntitlement(tx, organizerId);
  const organizer = await tx.organizer.findUnique({
    where: { id: organizerId },
    select: { id: true },
  });
  if (!organizer) return false;
  if (isPlatformAdmin(user)) return true;

  const membership = await tx.organizerMembership.findFirst({
    where: {
      organizerId,
      userId: user.id,
      status: "active",
      organizer: { suspended: false },
    },
    select: { role: true },
  });
  return Boolean(membership && can(organizerRoleToRole(membership.role), permission));
}

async function withLockedOrganizerPaymentPermission<T>(
  organizerId: string,
  user: User,
  permission: PaymentPermission,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T | null> {
  return prisma.$transaction(async (tx) => {
    if (!(await lockAndCheckOrganizerPaymentPermission(tx, organizerId, user, permission))) return null;
    return work(tx);
  });
}

async function findPaymentOrganizerId(
  paymentId: string,
  client: Prisma.TransactionClient = prisma,
): Promise<string | null> {
  const payment = await client.payment.findUnique({
    where: { id: paymentId },
    select: {
      ticketBooking: { select: { exhibition: { select: { organizerId: true } } } },
      eventTicketOrder: { select: { event: { select: { organizerId: true } } } },
      stallBooking: { select: { exhibition: { select: { organizerId: true } } } },
    },
  });
  return payment?.ticketBooking?.exhibition.organizerId
    ?? payment?.eventTicketOrder?.event.organizerId
    ?? payment?.stallBooking?.exhibition.organizerId
    ?? null;
}

async function loadOrganizerPayment(
  tx: Prisma.TransactionClient,
  paymentId: string,
  organizerId: string,
) {
  const payment = await tx.payment.findUnique({
    where: { id: paymentId },
    include: {
      ticketBooking: { include: { exhibition: true } },
      eventTicketOrder: { include: { event: true } },
      stallBooking: { include: { exhibition: true, exhibitionExhibitor: true } },
    },
  });
  if (!payment) return null;
  const actualOrganizerId = payment.ticketBooking?.exhibition.organizerId
    ?? payment.eventTicketOrder?.event.organizerId
    ?? payment.stallBooking?.exhibition.organizerId;
  return actualOrganizerId === organizerId ? payment : null;
}

router.get("/", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "payment:view");
  const exhibitionId = req.query.exhibitionId as string | undefined;

  // Platform Admin access is global and does not depend on organizer
  // membership, so keep the original single-query path for this role.
  if (isPlatformAdmin(req.user!)) {
    const [bookings, ticketBookings, eventTicketOrders] = await Promise.all([
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
      prisma.eventTicketOrder.findMany({
        where: {
          event: {
            organizerId: { in: organizerIds },
            ...(exhibitionId ? { exhibition: { is: { id: exhibitionId } } } : {}),
          },
        },
        include: {
          payment: true,
          event: { select: { id: true, title: true, exhibition: { select: { id: true, name: true } } } },
          reservation: { select: { attendeeName: true, attendeeEmail: true, eventTicketType: { select: { id: true, name: true } } } },
          tickets: { select: { status: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return res.json({ bookings, ticketBookings, eventTicketOrders });
  }

  // Lock all of this user's organizer tenants in a stable order, revalidate
  // membership/permission, then read the complete list in the same transaction.
  const result = await prisma.$transaction(async (tx) => {
    const authorizedOrganizerIds: string[] = [];
    for (const organizerId of [...organizerIds].sort()) {
      if (await lockAndCheckOrganizerPaymentPermission(tx, organizerId, req.user!, "payment:view")) {
        authorizedOrganizerIds.push(organizerId);
      }
    }
    if (authorizedOrganizerIds.length === 0) return { bookings: [], ticketBookings: [] };
    const [bookings, ticketBookings, eventTicketOrders] = await Promise.all([
      tx.stallBooking.findMany({
        where: { exhibition: { organizerId: { in: authorizedOrganizerIds } }, ...(exhibitionId ? { exhibitionId } : {}) },
        include: { payment: true, stall: true, exhibition: true, exhibitionExhibitor: { include: { business: true } } },
        orderBy: { createdAt: "desc" },
      }),
      tx.ticketBooking.findMany({
        where: { exhibition: { organizerId: { in: authorizedOrganizerIds } }, ...(exhibitionId ? { exhibitionId } : {}) },
        include: { payment: true, exhibition: true, ticketType: true },
        orderBy: { createdAt: "desc" },
      }),
      tx.eventTicketOrder.findMany({
        where: {
          event: {
            organizerId: { in: authorizedOrganizerIds },
            ...(exhibitionId ? { exhibition: { is: { id: exhibitionId } } } : {}),
          },
        },
        include: {
          payment: true,
          event: { select: { id: true, title: true, exhibition: { select: { id: true, name: true } } } },
          reservation: { select: { attendeeName: true, attendeeEmail: true, eventTicketType: { select: { id: true, name: true } } } },
          tickets: { select: { status: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return { bookings, ticketBookings, eventTicketOrders };
  });
  res.json(result);
});

router.get("/:paymentId", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "payment:view");
  if (organizerIds.length === 0) return res.status(404).json({ error: "Payment not found" });
  const organizerId = await findPaymentOrganizerId(req.params.paymentId);
  if (!organizerId || !organizerIds.includes(organizerId)) return res.status(404).json({ error: "Payment not found" });

  const result = await withLockedOrganizerPaymentPermission(organizerId, req.user!, "payment:view", async (tx) => {
    const payment = await loadOrganizerPayment(tx, req.params.paymentId, organizerId);
    if (!payment) return null;
    const [totals, refunds] = await Promise.all([
      getRefundTotals(payment.id, tx),
      tx.refund.findMany({ where: { paymentId: payment.id }, orderBy: { createdAt: "desc" } }),
    ]);
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

  const scope = await prisma.stallBooking.findFirst({
    where: { paymentId: req.params.paymentId, exhibition: { organizerId: { in: organizerIds } } },
    select: { id: true, exhibition: { select: { organizerId: true } } },
  });
  if (!scope) return res.status(404).json({ error: "Payment not found" });
  const organizerId = scope.exhibition.organizerId;

  const result = await withLockedOrganizerPaymentPermission(organizerId, req.user!, "payment:manage", async (tx) => {
    const booking = await tx.stallBooking.findFirst({
      where: { id: scope.id, paymentId: req.params.paymentId, exhibition: { organizerId } },
      include: { payment: true, exhibition: true },
    });
    if (!booking || !booking.payment) return { kind: "not_found" as const };
    if (["paid", "refunded", "partially_refunded"].includes(booking.payment.status)) {
      return { kind: "already_terminal" as const, status: booking.payment.status };
    }

    const outcome = await applyPaymentOutcome(booking.payment.id, parsed.data.status, {
      providerPaymentId: parsed.data.gatewayRefId,
    }, tx);
    if (!outcome.applied) return { kind: "conflict" as const };
    if (parsed.data.gateway || parsed.data.gatewayRefId) {
      await tx.payment.update({
        where: { id: booking.payment.id },
        data: { gateway: parsed.data.gateway ?? "manual", gatewayRefId: parsed.data.gatewayRefId },
      });
    }
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: booking.payment.id } });
    return {
      kind: "updated" as const,
      payment,
      bookingId: booking.id,
      exhibitionId: booking.exhibitionId,
      previousStatus: booking.payment.status,
      requiresRefund: outcome.requiresRefund === true,
      refundReason: outcome.refundReason,
      outcomePaymentId: outcome.payment?.id,
    };
  });

  if (!result || result.kind === "not_found") return res.status(404).json({ error: "Payment not found" });
  if (result.kind === "already_terminal") return res.status(400).json({ error: "Payment is already " + result.status });
  if (result.kind === "conflict") return res.status(409).json({ error: "Payment could not be updated" });

  await logAudit({
    actorUserId: req.user!.id,
    action: "payment.status.manually_updated",
    entityType: "Payment",
    entityId: result.payment.id,
    metadata: {
      stallBookingId: result.bookingId,
      exhibitionId: result.exhibitionId,
      previousStatus: result.previousStatus,
      newStatus: parsed.data.status,
      gateway: parsed.data.gateway ?? (parsed.data.gatewayRefId ? "manual" : undefined),
      gatewayRefId: parsed.data.gatewayRefId,
      requiresRefund: result.requiresRefund,
    },
  });

  // A manual confirmation is still a financial capture. If the stall was
  // released or reassigned before this confirmation, keep the payment in the
  // ledger as paid but never confirm the participation or reclaim inventory.
  // This compensation is system-initiated after the authorized transition;
  // it must not hold the organizer lock across provider network I/O.
  if (parsed.data.status === "paid" && result.requiresRefund && result.outcomePaymentId) {
    const compensation = await requestRefund({
      paymentId: result.outcomePaymentId,
      reason: "ADMINISTRATIVE",
      reasonNote: result.refundReason ?? "Manually confirmed payment could not be applied to its original stall reservation",
      idempotencyKey: "late-payment-compensation:" + result.outcomePaymentId,
      requestedByUserId: req.user!.id,
    });
    return res.status(202).json({
      error: "Payment was recorded, but the stall booking could not be confirmed. A compensation refund was initiated.",
      code: "PAYMENT_REQUIRES_COMPENSATION",
      payment: compensation.payment,
      refund: compensation.refund,
    });
  }

  res.json({ payment: result.payment });
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
  const organizerId = await findPaymentOrganizerId(req.params.paymentId);
  if (!organizerId || !organizerIds.includes(organizerId)) return res.status(404).json({ error: "Payment not found" });
  const parsed = refundRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const authorize = async (tx: Prisma.TransactionClient) => {
    if (!(await lockAndCheckOrganizerPaymentPermission(tx, organizerId, req.user!, "payment:manage"))) {
      throw new OrganizerPaymentAccessError();
    }
    if (await findPaymentOrganizerId(req.params.paymentId, tx) !== organizerId) {
      throw new OrganizerPaymentAccessError();
    }
  };

  try {
    const { refund, payment: updatedPayment } = await requestRefund({
      paymentId: req.params.paymentId,
      amount: parsed.data.amount,
      reason: parsed.data.reason,
      reasonNote: parsed.data.reasonNote,
      idempotencyKey: parsed.data.idempotencyKey,
      requestedByUserId: req.user!.id,
    }, authorize);
    const totals = await withLockedOrganizerPaymentPermission(organizerId, req.user!, "payment:manage", (tx) =>
      getRefundTotals(updatedPayment.id, tx));
    if (!totals) return res.status(404).json({ error: "Payment not found" });
    res.status(201).json({ refund, payment: updatedPayment, totals });
  } catch (err) {
    if (err instanceof OrganizerPaymentAccessError) return res.status(404).json({ error: "Payment not found" });
    if (err instanceof RefundError) {
      const status = err.code === "EXCEEDS_REMAINING" || err.code === "INVALID_AMOUNT" || err.code === "FREE_PAYMENT" || err.code === "PAYMENT_NOT_REFUNDABLE" ? 400 : 404;
      return res.status(status).json({ error: err.message, code: err.code });
    }
    throw err;
  }
});

router.get("/:paymentId/refunds", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "payment:view");
  if (organizerIds.length === 0) return res.status(404).json({ error: "Payment not found" });
  const organizerId = await findPaymentOrganizerId(req.params.paymentId);
  if (!organizerId || !organizerIds.includes(organizerId)) return res.status(404).json({ error: "Payment not found" });
  const result = await withLockedOrganizerPaymentPermission(organizerId, req.user!, "payment:view", async (tx) => {
    const payment = await loadOrganizerPayment(tx, req.params.paymentId, organizerId);
    if (!payment) return null;
    const [totals, refunds] = await Promise.all([
      getRefundTotals(payment.id, tx),
      tx.refund.findMany({ where: { paymentId: payment.id }, orderBy: { createdAt: "desc" } }),
    ]);
    return { totals, refunds };
  });
  if (!result) return res.status(404).json({ error: "Payment not found" });
  res.json(result);
});

const mockCompleteRefundSchema = z.object({ outcome: z.enum(["success", "failure"]) });
router.post("/:paymentId/refunds/:refundId/mock-complete", financialMutationRateLimit, async (req, res) => {
  const provider = getPaymentProvider();
  if (!(provider instanceof MockPaymentProvider)) return res.status(403).json({ error: "Mock refund completion is only available when PAYMENT_PROVIDER=mock" });

  const organizerIds = await organizerIdsWithPermission(req.user!, "payment:manage");
  if (organizerIds.length === 0) return res.status(403).json({ error: "You do not have permission to manage payments" });
  const organizerId = await findPaymentOrganizerId(req.params.paymentId);
  if (!organizerId || !organizerIds.includes(organizerId)) return res.status(404).json({ error: "Payment not found" });
  const existingRefund = await prisma.refund.findFirst({
    where: { id: req.params.refundId, paymentId: req.params.paymentId },
    select: { id: true, providerRefundId: true },
  });
  if (!existingRefund) return res.status(404).json({ error: "Refund not found" });
  const parsed = mockCompleteRefundSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const authorize = async (tx: Prisma.TransactionClient) => {
    if (!(await lockAndCheckOrganizerPaymentPermission(tx, organizerId, req.user!, "payment:manage"))) {
      throw new OrganizerPaymentAccessError();
    }
    if (await findPaymentOrganizerId(req.params.paymentId, tx) !== organizerId) {
      throw new OrganizerPaymentAccessError();
    }
    const refund = await tx.refund.findFirst({
      where: { id: req.params.refundId, paymentId: req.params.paymentId },
      select: { id: true },
    });
    if (!refund) throw new RefundError("REFUND_NOT_FOUND", "Refund not found");
  };

  try {
    const outcome = parsed.data.outcome === "success"
      ? await finalizeRefundSuccess(req.params.refundId, existingRefund.providerRefundId ?? "mock_refund_" + req.params.refundId, authorize)
      : await finalizeRefundFailure(req.params.refundId, "Simulated refund failure for testing", authorize);
    const totals = await withLockedOrganizerPaymentPermission(organizerId, req.user!, "payment:manage", (tx) =>
      getRefundTotals(req.params.paymentId, tx));
    if (!totals) return res.status(404).json({ error: "Payment not found" });
    res.json({ refund: outcome.refund, payment: outcome.payment, totals });
  } catch (err) {
    if (err instanceof OrganizerPaymentAccessError) return res.status(404).json({ error: "Payment not found" });
    throw err;
  }
});

export default router;
