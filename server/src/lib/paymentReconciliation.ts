import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type PaymentReconciliationSeverity = "CRITICAL" | "WARNING";

export interface PaymentReconciliationFinding {
  code: string;
  severity: PaymentReconciliationSeverity;
  paymentId: string | null;
  orderId: string | null;
  message: string;
}

export interface PaymentReconciliationReport {
  generatedAt: Date;
  window: { from: Date; to: Date };
  scannedPayments: number;
  findings: PaymentReconciliationFinding[];
  summary: {
    critical: number;
    warning: number;
    healthy: boolean;
  };
}

/**
 * Internal financial-integrity reconciliation. This intentionally does not
 * pretend to reconcile against a gateway's remote ledger; it reconciles the
 * local Payment, EventTicketOrder, TicketBooking, StallBooking and Refund
 * state machines so operational mismatches are surfaced before they become
 * customer-facing or accounting problems.
 */
export async function reconcilePayments(params: {
  from?: Date;
  to?: Date;
  limit?: number;
} = {}): Promise<PaymentReconciliationReport> {
  const to = params.to ?? new Date();
  const from = params.from ?? new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  const limit = Math.min(Math.max(params.limit ?? 5000, 1), 10000);
  const staleBefore = new Date(to.getTime() - 30 * 60 * 1000);

  const payments = await prisma.payment.findMany({
    where: { createdAt: { gte: from, lte: to } },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: {
      eventTicketOrder: { select: { id: true, status: true, totalAmount: true } },
      ticketBooking: { select: { id: true, paymentStatus: true } },
      stallBooking: { select: { id: true, paymentStatus: true } },
      refunds: { select: { id: true, amount: true, status: true, providerRefundId: true } },
    },
  });

  const findings: PaymentReconciliationFinding[] = [];

  for (const payment of payments) {
    const paymentId = payment.id;
    const eventOrder = payment.eventTicketOrder;

    if ((payment.status === "paid" || payment.status === "partially_refunded" || payment.status === "refunded") && !payment.providerPaymentId) {
      findings.push({
        code: "PAID_MISSING_PROVIDER_PAYMENT_ID",
        severity: "CRITICAL",
        paymentId,
        orderId: eventOrder?.id ?? null,
        message: `Payment is ${payment.status} but has no provider payment id.`,
      });
    }

    if ((payment.status === "paid" || payment.status === "partially_refunded" || payment.status === "refunded") && !payment.providerOrderId) {
      findings.push({
        code: "SETTLED_MISSING_PROVIDER_ORDER_ID",
        severity: "CRITICAL",
        paymentId,
        orderId: eventOrder?.id ?? null,
        message: `Payment is ${payment.status} but has no provider order id.`,
      });
    }

    if (eventOrder) {
      const expectedOrderStatus =
        payment.status === "paid" ? "PAID" :
        payment.status === "failed" ? "FAILED" :
        payment.status === "cancelled" ? "CANCELLED" :
        payment.status === "refunded" ? "REFUNDED" :
        null;

      if (expectedOrderStatus && eventOrder.status !== expectedOrderStatus) {
        findings.push({
          code: "EVENT_TICKET_ORDER_PAYMENT_STATUS_MISMATCH",
          severity: "CRITICAL",
          paymentId,
          orderId: eventOrder.id,
          message: `Payment is ${payment.status} while EventTicketOrder is ${eventOrder.status}; expected ${expectedOrderStatus}.`,
        });
      }
    }

    if (payment.ticketBooking && payment.ticketBooking.paymentStatus !== payment.status) {
      findings.push({
        code: "LEGACY_TICKET_PAYMENT_STATUS_MISMATCH",
        severity: "CRITICAL",
        paymentId,
        orderId: null,
        message: `Payment is ${payment.status} while TicketBooking is ${payment.ticketBooking.paymentStatus}.`,
      });
    }

    if (payment.stallBooking && payment.stallBooking.paymentStatus !== payment.status) {
      findings.push({
        code: "STALL_PAYMENT_STATUS_MISMATCH",
        severity: "CRITICAL",
        paymentId,
        orderId: null,
        message: `Payment is ${payment.status} while StallBooking is ${payment.stallBooking.paymentStatus}.`,
      });
    }

    const succeededRefundAmount = payment.refunds
      .filter((refund) => refund.status === "SUCCEEDED")
      .reduce((sum, refund) => sum + Number(refund.amount), 0);
    const recordedRefundedAmount = Number(payment.refundedAmount);

    if (Math.abs(succeededRefundAmount - recordedRefundedAmount) > 0.005) {
      findings.push({
        code: "REFUND_TOTAL_MISMATCH",
        severity: "CRITICAL",
        paymentId,
        orderId: eventOrder?.id ?? null,
        message: `Payment refundedAmount is ${recordedRefundedAmount.toFixed(2)} but succeeded refunds total ${succeededRefundAmount.toFixed(2)}.`,
      });
    }

    if (payment.status === "refunded" && Math.abs(recordedRefundedAmount - Number(payment.amount)) > 0.005) {
      findings.push({
        code: "REFUNDED_PAYMENT_AMOUNT_MISMATCH",
        severity: "CRITICAL",
        paymentId,
        orderId: eventOrder?.id ?? null,
        message: `Payment is fully refunded but refundedAmount (${recordedRefundedAmount.toFixed(2)}) does not equal amount (${Number(payment.amount).toFixed(2)}).`,
      });
    }

    if ((payment.status === "created" || payment.status === "pending") && payment.createdAt < staleBefore) {
      findings.push({
        code: "STALE_PAYMENT",
        severity: "WARNING",
        paymentId,
        orderId: eventOrder?.id ?? null,
        message: `Payment has remained ${payment.status} for more than 30 minutes.`,
      });
    }

    if (payment.status === "refunded" && payment.refunds.some((refund) => refund.status === "SUCCEEDED" && !refund.providerRefundId)) {
      findings.push({
        code: "SUCCEEDED_REFUND_MISSING_PROVIDER_ID",
        severity: "CRITICAL",
        paymentId,
        orderId: eventOrder?.id ?? null,
        message: "A succeeded refund has no provider refund id.",
      });
    }
  }

  return {
    generatedAt: new Date(),
    window: { from, to },
    scannedPayments: payments.length,
    findings,
    summary: {
      critical: findings.filter((finding) => finding.severity === "CRITICAL").length,
      warning: findings.filter((finding) => finding.severity === "WARNING").length,
      healthy: findings.length === 0,
    },
  };
}
