import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getPaymentProvider } from "./payments";
import { logAudit } from "./audit";

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


export interface ProviderOrderRecoveryResult {
  generatedAt: Date;
  window: { from: Date; to: Date };
  supported: boolean;
  provider: string;
  scannedPayments: number;
  recoveredPayments: string[];
  findings: PaymentReconciliationFinding[];
}

/**
 * Recovers a local Payment whose provider order was created remotely but the
 * local providerOrderId write did not complete. Recovery is deliberately
 * narrow: it only fills the missing provider order reference. It never marks
 * a payment paid and never infers a provider payment id from an order.
 */
export async function recoverProviderOrders(params: {
  from?: Date;
  to?: Date;
  limit?: number;
} = {}): Promise<ProviderOrderRecoveryResult> {
  const to = params.to ?? new Date();
  const from = params.from ?? new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  const limit = Math.min(Math.max(params.limit ?? 500, 1), 5000);
  const provider = getPaymentProvider();

  if (provider.name === "mock") {
    return {
      generatedAt: new Date(),
      window: { from, to },
      supported: false,
      provider: provider.name,
      scannedPayments: 0,
      recoveredPayments: [],
      findings: [],
    };
  }

  const payments = await prisma.payment.findMany({
    where: {
      createdAt: { gte: from, lte: to },
      providerOrderId: null,
      status: { in: ["created", "pending"] },
      provider: provider.name,
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true, status: true, provider: true, metadata: true },
  });

  const findings: PaymentReconciliationFinding[] = [];
  const recoveredPayments: string[] = [];

  for (const payment of payments) {
    try {
      const matches = await provider.findOrdersByReceipt(payment.id);

      if (matches.length === 1) {
        const match = matches[0];
        const existingMetadata =
          payment.metadata && typeof payment.metadata === "object" && !Array.isArray(payment.metadata)
            ? payment.metadata
            : {};

        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            providerOrderId: match.providerOrderId,
            metadata: {
              ...existingMetadata,
              recovery: {
                recoveredAt: new Date().toISOString(),
                method: "provider_receipt_lookup",
                providerOrderStatus: match.status ?? null,
              },
              providerOrder: match.raw as Prisma.InputJsonValue,
            } as Prisma.InputJsonValue,
          },
        });

        recoveredPayments.push(payment.id);
        await logAudit({
          actorUserId: null,
          action: "payment.provider_order_recovered",
          entityType: "Payment",
          entityId: payment.id,
          metadata: {
            provider: provider.name,
            providerOrderId: match.providerOrderId,
            providerOrderStatus: match.status ?? null,
            method: "provider_receipt_lookup",
          },
        });
        continue;
      }

      if (matches.length === 0) {
        findings.push({
          code: "PROVIDER_ORDER_NOT_FOUND",
          severity: "WARNING",
          paymentId: payment.id,
          orderId: null,
          message: `No ${provider.name} order was found for local payment receipt ${payment.id}.`,
        });
      } else {
        findings.push({
          code: "PROVIDER_ORDER_AMBIGUOUS",
          severity: "CRITICAL",
          paymentId: payment.id,
          orderId: null,
          message: `Multiple ${provider.name} orders were found for local payment receipt ${payment.id}; no local state was changed.`,
        });
      }
    } catch (error) {
      findings.push({
        code: "PROVIDER_ORDER_LOOKUP_FAILED",
        severity: "WARNING",
        paymentId: payment.id,
        orderId: null,
        message: error instanceof Error ? error.message : "Provider order lookup failed.",
      });
    }
  }

  return {
    generatedAt: new Date(),
    window: { from, to },
    supported: true,
    provider: provider.name,
    scannedPayments: payments.length,
    recoveredPayments,
    findings,
  };
}
