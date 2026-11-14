import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getPaymentProvider } from "./payments";
import { calculatePricing, type PricingBreakdown } from "./pricingEngine";
import { issueEventTicketsForPaidOrder } from "./eventTicketIssuance";

/**
 * Creates a Payment row in "created" status and asks the configured
 * provider to open a real order against it. Nothing here ever sets a
 * payment to "paid" — that only ever happens in applyPaymentOutcome, driven
 * by a verified signature (checkout callback) or a verified webhook.
 *
 * `baseAmount` must already be a trusted, server-computed figure. Both the
 * ticket and stall flows funnel through this shared pricing entry point.
 * The gateway order amount is the pricing engine's `totalAmount` (customer-
 * payable), not the bare base amount.
 */
export async function createOrderForPayment(params: {
  baseAmount: number;
  currency?: string;
  notes?: Record<string, string>;
}) {
  const provider = getPaymentProvider();
  const currency = params.currency ?? "INR";
  const breakdown = await calculatePricing(params.baseAmount);

  const payment = await prisma.payment.create({
    data: {
      ...pricingBreakdownToPaymentData(breakdown),
      currency,
      provider: provider.name,
      status: "created",
    },
  });

  let order: Awaited<ReturnType<typeof provider.createOrder>>;
  try {
    order = await provider.createOrder({
      amount: breakdown.totalAmount,
      currency,
      receipt: payment.id,
      notes: params.notes,
    });
  } catch (error) {
    // Keep a durable record of failed provider-order initialization. Leaving
    // this row as "created" makes an order that was never opened look pending
    // forever and pollutes payment/reconciliation reporting.
    try {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "failed" },
      });
    } catch {
      // Preserve the provider error; database failure should not mask the
      // original cause. Monitoring/reconciliation can identify the stale row.
    }
    throw error;
  }

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { providerOrderId: order.providerOrderId, metadata: order.raw as Prisma.InputJsonValue },
  });

  return {
    payment: updated,
    order: {
      providerOrderId: order.providerOrderId,
      publicKey: provider.publicKey,
      amount: breakdown.totalAmount,
      currency,
      provider: provider.name,
    },
    breakdown,
  };
}

export function pricingBreakdownToPaymentData(breakdown: PricingBreakdown) {
  return {
    amount: breakdown.totalAmount,
    baseAmount: breakdown.baseAmount,
    platformFeeAmount: breakdown.platformFeeAmount,
    gatewayFeeAmount: breakdown.gatewayFeeAmount,
    taxAmount: breakdown.taxAmount,
    discountAmount: breakdown.discountAmount,
    organizerAmount: breakdown.organizerAmount,
    platformRevenueAmount: breakdown.platformRevenueAmount,
    feePaidBy: breakdown.feePaidBy,
    pricingVersionId: breakdown.pricingVersionId,
  };
}

type Outcome = "paid" | "failed" | "cancelled" | "refunded";

/** Single payment-state transition point for verified provider outcomes. */
export async function applyPaymentOutcome(
  paymentId: string,
  outcome: Outcome,
  details: { providerPaymentId?: string; failureReason?: string } = {}
) {
  return prisma.$transaction(async (tx) => {
    // Serialize competing provider callbacks before reading payment/order state.
    // Without this lock, two captured webhooks can both observe a pending
    // payment; the second then sees the first callback's CONVERTED reservation
    // and incorrectly treats the same valid payment as a late capture.
    await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "payments" WHERE "id" = ${paymentId} FOR UPDATE`;
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { ticketBooking: true, eventTicketOrder: { include: { reservation: true } }, stallBooking: { include: { exhibitionExhibitor: true } } },
    });
    if (!payment) return { applied: false as const, reason: "PAYMENT_NOT_FOUND" as const };

    // A provider can capture funds after our local checkout attempt was
    // cancelled (for example, a webhook arrives after the stale-attempt retry
    // window). Record that money as paid, but do NOT confirm the booking or
    // mutate inventory: the caller must run the compensation refund pipeline.
    if (payment.status === "cancelled" && outcome === "paid") {
      if (!details.providerPaymentId && !payment.providerPaymentId) {
        return { applied: false as const, reason: "MISSING_PROVIDER_PAYMENT_ID" as const, payment };
      }
      if (payment.providerPaymentId && details.providerPaymentId && payment.providerPaymentId !== details.providerPaymentId) {
        return { applied: false as const, reason: "PROVIDER_PAYMENT_ID_MISMATCH" as const, payment };
      }
      const capturedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: { status: "paid", providerPaymentId: details.providerPaymentId ?? payment.providerPaymentId },
      });
      return {
        applied: true as const,
        payment: capturedPayment,
        requiresRefund: true as const,
        refundReason: "Provider captured funds after this payment attempt had already been cancelled; booking inventory was not reactivated",
      };
    }

    // Other terminal payment states cannot be revived or re-applied.
    if (["paid", "partially_refunded", "refunded", "cancelled"].includes(payment.status)) {
      return { applied: false as const, reason: "ALREADY_TERMINAL" as const, payment };
    }

    // Paid/refunded outcomes must carry a provider payment identity. This
    // prevents a malformed or forged success transition from settling money
    // without a gateway-side payment reference.
    if ((outcome === "paid" || outcome === "refunded") && !details.providerPaymentId && !payment.providerPaymentId) {
      return { applied: false as const, reason: "MISSING_PROVIDER_PAYMENT_ID" as const, payment };
    }

    const nextStatus: Outcome = outcome;
    let requiresRefund = false;
    let refundReason: string | undefined;

    // A reservation is inventory, not merely a checkout hint. A verified
    // payment callback can arrive after the 10-minute reservation window has
    // expired (or after another request has cancelled it). Never issue a
    // ticket from released inventory. The payment remains financially
    // authoritative as "paid", the order is held out of the PAID state, and
    // the caller is instructed to run the normal refund pipeline.
    let lockedEventTicketReservation: { id: string; status: string; expiresAt: Date } | null = null;
    if (payment.eventTicketOrder && nextStatus === "paid") {
      const lockedRows = await tx.$queryRaw<Array<{ id: string; status: string; expiresAt: Date }>>`
        SELECT "id", "status", "expiresAt"
        FROM "event_ticket_reservations"
        WHERE "id" = ${payment.eventTicketOrder.reservationId}
        FOR UPDATE
      `;
      lockedEventTicketReservation = lockedRows[0] ?? null;
      if (
        !lockedEventTicketReservation ||
        lockedEventTicketReservation.status !== "ACTIVE" ||
        lockedEventTicketReservation.expiresAt <= new Date()
      ) {
        requiresRefund = true;
        refundReason = "Event ticket reservation expired or was cancelled before payment confirmation";
      }
    }

    const updatedPayment = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: nextStatus,
        providerPaymentId: details.providerPaymentId ?? payment.providerPaymentId,
        failureReason: nextStatus === "failed" ? (details.failureReason ?? null) : payment.failureReason,
      },
    });

    if (payment.eventTicketOrder) {
      const order = payment.eventTicketOrder;
      const nextOrderStatus =
        nextStatus === "paid"
          ? requiresRefund
            ? "FAILED"
            : "PAID"
          : nextStatus === "failed"
            ? "FAILED"
            : nextStatus === "cancelled"
              ? "CANCELLED"
              : nextStatus === "refunded"
                ? "REFUNDED"
                : "PAYMENT_PENDING";
      await tx.eventTicketOrder.update({ where: { id: order.id }, data: { status: nextOrderStatus } });
      if (nextStatus === "paid" && !requiresRefund) {
        await tx.eventTicketReservation.update({ where: { id: order.reservationId }, data: { status: "CONVERTED" } });
        await issueEventTicketsForPaidOrder(tx, order.id);
      } else if (nextStatus === "failed" || nextStatus === "cancelled") {
        await tx.eventTicketReservation.update({ where: { id: order.reservationId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
      }
    }

    if (payment.ticketBooking) {
      await tx.ticketBooking.update({
        where: { id: payment.ticketBooking.id },
        data: { paymentStatus: nextStatus === "cancelled" ? "cancelled" : nextStatus },
      });
    }

    if (payment.stallBooking) {
      const booking = payment.stallBooking;
      await tx.stallBooking.update({
        where: { id: booking.id },
        data: { paymentStatus: nextStatus === "cancelled" ? "cancelled" : nextStatus },
      });

      if (nextStatus === "paid") {
        // A captured payment may arrive after this reservation was released
        // or reassigned. Serialize against every inventory writer and confirm
        // this exact booking still owns the reserved stall before marking it sold.
        const lockedStalls = await tx.$queryRawUnsafe<Array<{ id: string; status: string; exhibitionExhibitorId: string | null }>>(
          'SELECT "id", "status", "exhibitionExhibitorId" FROM "stalls" WHERE "id" = $1 FOR UPDATE',
          booking.stallId
        );
        const lockedStall = lockedStalls[0];
        const ownsReservation = Boolean(lockedStall && lockedStall.status === "reserved" &&
          lockedStall.exhibitionExhibitorId === booking.exhibitionExhibitorId);
        if (!ownsReservation) {
          requiresRefund = true;
          refundReason = "Captured exhibitor payment arrived after its stall reservation was released or reassigned";
        } else {
          const sold = await tx.stall.updateMany({
            where: { id: booking.stallId, status: "reserved", exhibitionExhibitorId: booking.exhibitionExhibitorId },
            data: { status: "sold", reservedAt: null },
          });
          if (sold.count !== 1) {
            requiresRefund = true;
            refundReason = "Captured exhibitor payment could not claim its original stall reservation";
          } else if (booking.exhibitionExhibitorId) {
            const confirmed = await tx.exhibitionExhibitor.updateMany({
              where: { id: booking.exhibitionExhibitorId, status: "payment_pending" },
              data: { status: "confirmed", confirmedAt: new Date() },
            });
            if (confirmed.count !== 1) {
              requiresRefund = true;
              refundReason = "Captured exhibitor payment no longer matches a payment-pending participation";
            }
          }
        }
      } else if (nextStatus === "failed" || nextStatus === "cancelled") {
        if (booking.exhibitionExhibitorId) {
          await tx.exhibitionExhibitor.updateMany({
            where: { id: booking.exhibitionExhibitorId, status: "payment_pending" },
            data: { status: "stall_reserved" },
          });
        }
      } else if (nextStatus === "refunded") {
        await tx.stall.updateMany({
          where: { id: booking.stallId },
          data: { status: "available", exhibitionExhibitorId: null, reservedAt: null },
        });
        if (booking.exhibitionExhibitorId) {
          await tx.exhibitionExhibitor.updateMany({
            where: { id: booking.exhibitionExhibitorId },
            data: { status: "cancelled" },
          });
        }
      }
    }

    return { applied: true as const, payment: updatedPayment, requiresRefund, refundReason };
  });
}

export async function recordWebhookEvent(params: {
  provider: string;
  providerEventId: string;
  eventType: string;
  payload: unknown;
  paymentId?: string;
}): Promise<{ isDuplicate: boolean }> {
  try {
    await prisma.paymentEvent.create({
      data: {
        provider: params.provider,
        providerEventId: params.providerEventId,
        eventType: params.eventType,
        payload: params.payload as Prisma.InputJsonValue,
        paymentId: params.paymentId,
      },
    });
    return { isDuplicate: false };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { isDuplicate: true };
    }
    throw err;
  }
}
