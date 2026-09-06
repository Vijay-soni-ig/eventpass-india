import { Prisma, type Payment, type Refund, type RefundReason } from "@prisma/client";
import { prisma } from "./prisma";
import { getPaymentProvider } from "./payments";
import { logAudit } from "./audit";

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export class RefundError extends Error {
  constructor(
    public readonly code:
      | "PAYMENT_NOT_REFUNDABLE"
      | "FREE_PAYMENT"
      | "INVALID_AMOUNT"
      | "EXCEEDS_REMAINING"
      | "REFUND_NOT_FOUND"
      | "REFUND_NOT_PENDING"
      | "PROVIDER_NOT_MOCK",
    message: string
  ) {
    super(message);
    this.name = "RefundError";
  }
}

/** Live-computed from the database — never trusts a client-supplied figure. */
export async function getRefundTotals(paymentId: string) {
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  const pending = await prisma.refund.aggregate({
    where: { paymentId, status: { in: ["REQUESTED", "PROCESSING"] } },
    _sum: { amount: true },
  });
  const originalAmount = Number(payment.amount);
  const refundedAmount = Number(payment.refundedAmount);
  const pendingAmount = Number(pending._sum.amount ?? 0);
  const refundableAmount = round2(originalAmount - refundedAmount - pendingAmount);
  return { originalAmount, refundedAmount, pendingAmount, refundableAmount };
}

/**
 * Requests a refund against a payment: validates eligibility, atomically
 * reserves the requested amount (so a concurrent request can't also spend
 * it), then asks the provider to actually move money. Idempotent per
 * (paymentId, idempotencyKey) — a repeated call with the same key returns
 * the existing refund instead of contacting the provider again.
 *
 * Full pipeline (mirrors the payment-capture pipeline in paymentService.ts):
 *   validate -> lock payment row -> compute live refundable amount ->
 *   create Refund(PROCESSING) -> call provider -> provider confirms (or not)
 *   -> finalize (SUCCEEDED/FAILED) -> update Payment totals/status.
 */
export async function requestRefund(params: {
  paymentId: string;
  amount?: number;
  reason: RefundReason;
  reasonNote?: string;
  idempotencyKey: string;
  requestedByUserId: string;
}): Promise<{ refund: Refund; payment: Payment }> {
  // Idempotent replay: same (paymentId, idempotencyKey) submitted again
  // returns the existing result untouched — never a second provider call.
  const existing = await prisma.refund.findUnique({
    where: { paymentId_idempotencyKey: { paymentId: params.paymentId, idempotencyKey: params.idempotencyKey } },
  });
  if (existing) {
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: params.paymentId } });
    return { refund: existing, payment };
  }

  const provider = getPaymentProvider();

  // Phase 1: validate + atomically reserve the amount under a row lock.
  const reservation = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Payment[]>`SELECT * FROM "payments" WHERE "id" = ${params.paymentId} FOR UPDATE`;
    const payment = locked[0];
    if (!payment) throw new RefundError("PAYMENT_NOT_REFUNDABLE", "Payment not found");

    if (payment.status !== "paid" && payment.status !== "partially_refunded") {
      throw new RefundError("PAYMENT_NOT_REFUNDABLE", `Only a paid payment can be refunded (current status: ${payment.status})`);
    }
    if (payment.provider === "free") {
      throw new RefundError("FREE_PAYMENT", "A free payment never moved real money and cannot be refunded through a gateway");
    }

    const pending = await tx.refund.aggregate({
      where: { paymentId: params.paymentId, status: { in: ["REQUESTED", "PROCESSING"] } },
      _sum: { amount: true },
    });
    const originalAmount = Number(payment.amount);
    const refundedAmount = Number(payment.refundedAmount);
    const pendingAmount = Number(pending._sum.amount ?? 0);
    const refundableAmount = round2(originalAmount - refundedAmount - pendingAmount);

    const resolvedAmount = params.amount === undefined ? refundableAmount : round2(params.amount);
    if (!(resolvedAmount > 0)) {
      throw new RefundError("INVALID_AMOUNT", "Refund amount must be greater than zero");
    }
    if (resolvedAmount > refundableAmount + 0.005) {
      throw new RefundError(
        "EXCEEDS_REMAINING",
        `Refund amount ${resolvedAmount} exceeds the remaining refundable amount ${refundableAmount}`
      );
    }

    let refund: Refund;
    try {
      refund = await tx.refund.create({
        data: {
          paymentId: params.paymentId,
          amount: resolvedAmount,
          status: "PROCESSING",
          reason: params.reason,
          reasonNote: params.reasonNote,
          idempotencyKey: params.idempotencyKey,
          provider: provider.name,
          requestedByUserId: params.requestedByUserId,
        },
      });
    } catch (err) {
      // A concurrent request with the identical idempotency key won the
      // race to create the row first — treat it as the same idempotent
      // replay case as the up-front lookup above.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const winner = await tx.refund.findUniqueOrThrow({
          where: { paymentId_idempotencyKey: { paymentId: params.paymentId, idempotencyKey: params.idempotencyKey } },
        });
        const paymentModel = await tx.payment.findUniqueOrThrow({ where: { id: params.paymentId } });
        return { refund: winner, payment: paymentModel, alreadyExisted: true as const };
      }
      throw err;
    }

    // Re-fetch through the normal (non-raw) query API so the returned
    // Payment is a properly typed model object, not a raw-row shape.
    const paymentModel = await tx.payment.findUniqueOrThrow({ where: { id: params.paymentId } });
    return { refund, payment: paymentModel, alreadyExisted: false as const };
  });

  if (reservation.alreadyExisted) {
    return { refund: reservation.refund, payment: reservation.payment };
  }

  await logAudit({
    actorUserId: params.requestedByUserId,
    action: "refund.requested",
    entityType: "Payment",
    entityId: params.paymentId,
    metadata: { refundId: reservation.refund.id, amount: Number(reservation.refund.amount), reason: params.reason },
  });

  // Phase 2: call the provider — never inside the row-lock transaction
  // (a network call must not hold a DB lock).
  const paymentRow = await prisma.payment.findUniqueOrThrow({ where: { id: params.paymentId } });
  if (!paymentRow.providerPaymentId) {
    return finalizeRefundFailure(reservation.refund.id, "This payment has no provider payment id to refund against");
  }

  try {
    const result = await provider.refund(paymentRow.providerPaymentId, Number(reservation.refund.amount));
    if (result.status === "processed") {
      const outcome = await finalizeRefundSuccess(reservation.refund.id, result.providerRefundId);
      return outcome;
    }
    // "pending" — the provider accepted the request but hasn't confirmed
    // yet. The Refund stays PROCESSING; a later confirmation (mock-complete
    // in dev/test, or a real webhook for a live gateway — see Known Issues
    // in the Phase 19B report) finalizes it. Payment is untouched until then.
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: params.paymentId } });
    const refund = await prisma.refund.update({
      where: { id: reservation.refund.id },
      data: { providerRefundId: result.providerRefundId },
    });
    return { refund, payment };
  } catch (err) {
    return finalizeRefundFailure(reservation.refund.id, err instanceof Error ? err.message : "Provider refund call failed");
  }
}

/**
 * Marks a PROCESSING refund SUCCEEDED and updates the payment's confirmed
 * totals/status. This is the only place `Payment.refundedAmount` moves —
 * it never advances for a merely-requested or still-processing refund.
 */
export async function finalizeRefundSuccess(
  refundId: string,
  providerRefundId?: string
): Promise<{ refund: Refund; payment: Payment }> {
  const result = await prisma.$transaction(async (tx) => {
    const refund = await tx.refund.findUnique({ where: { id: refundId } });
    if (!refund) throw new RefundError("REFUND_NOT_FOUND", "Refund not found");
    if (refund.status !== "PROCESSING" && refund.status !== "REQUESTED") {
      // Already terminal — idempotent no-op, return current state rather
      // than re-applying (e.g. a duplicate webhook/mock-complete call).
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: refund.paymentId } });
      return { refund, payment };
    }

    const lockedPaymentRows = await tx.$queryRaw<Payment[]>`SELECT * FROM "payments" WHERE "id" = ${refund.paymentId} FOR UPDATE`;
    const payment = lockedPaymentRows[0];

    const newRefundedAmount = round2(Number(payment.refundedAmount) + Number(refund.amount));
    const originalAmount = Number(payment.amount);
    const newStatus = newRefundedAmount >= originalAmount - 0.005 ? "refunded" : "partially_refunded";

    const updatedPayment = await tx.payment.update({
      where: { id: payment.id },
      data: { refundedAmount: newRefundedAmount, status: newStatus },
    });

    const updatedRefund = await tx.refund.update({
      where: { id: refundId },
      data: { status: "SUCCEEDED", completedAt: new Date(), providerRefundId: providerRefundId ?? refund.providerRefundId },
    });

    // Ticket bookings mirror the payment's refund status so the existing
    // check-in gate (`paymentStatus !== "paid"` -> reject) automatically
    // stops a refunded/partially-refunded ticket from being scanned in,
    // without any change to the check-in route itself.
    await tx.ticketBooking.updateMany({ where: { paymentId: payment.id }, data: { paymentStatus: newStatus } });

    const stallBooking = await tx.stallBooking.findUnique({ where: { paymentId: payment.id } });
    if (stallBooking) {
      await tx.stallBooking.update({ where: { id: stallBooking.id }, data: { paymentStatus: newStatus } });
      // Only a FULL refund releases the stall/participation — matching the
      // pre-existing full-refund-only behavior exactly. A partial refund
      // (e.g. a goodwill adjustment) must never silently free up the stall.
      if (newStatus === "refunded") {
        await tx.stall.updateMany({
          where: { id: stallBooking.stallId },
          data: { status: "available", exhibitionExhibitorId: null },
        });
        if (stallBooking.exhibitionExhibitorId) {
          await tx.exhibitionExhibitor.updateMany({
            where: { id: stallBooking.exhibitionExhibitorId },
            data: { status: "cancelled" },
          });
        }
      }
    }

    return { refund: updatedRefund, payment: updatedPayment };
  });

  await logAudit({
    actorUserId: result.refund.requestedByUserId,
    action: "refund.succeeded",
    entityType: "Payment",
    entityId: result.payment.id,
    metadata: { refundId: result.refund.id, amount: Number(result.refund.amount), paymentStatus: result.payment.status },
  });

  return result;
}

/** Marks a refund FAILED. The payment's financial state is left untouched. */
export async function finalizeRefundFailure(refundId: string, failureReason: string): Promise<{ refund: Refund; payment: Payment }> {
  const refund = await prisma.refund.findUnique({ where: { id: refundId } });
  if (!refund) throw new RefundError("REFUND_NOT_FOUND", "Refund not found");

  const updatedRefund =
    refund.status === "PROCESSING" || refund.status === "REQUESTED"
      ? await prisma.refund.update({
          where: { id: refundId },
          data: { status: "FAILED", failureReason, completedAt: new Date() },
        })
      : refund; // Already terminal — idempotent no-op.

  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: refund.paymentId } });

  await logAudit({
    actorUserId: refund.requestedByUserId,
    action: "refund.failed",
    entityType: "Payment",
    entityId: payment.id,
    metadata: { refundId: refund.id, amount: Number(refund.amount), failureReason },
  });

  return { refund: updatedRefund, payment };
}
