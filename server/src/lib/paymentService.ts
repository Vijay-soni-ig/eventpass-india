import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getPaymentProvider } from "./payments";
import { calculatePricing, type PricingBreakdown } from "./pricingEngine";

/**
 * Creates a Payment row in "created" status and asks the configured
 * provider to open a real order against it. Nothing here ever sets a
 * payment to "paid" — that only ever happens in applyPaymentOutcome, driven
 * by a verified signature (checkout callback) or a verified webhook.
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

  const order = await provider.createOrder({
    amount: breakdown.totalAmount,
    currency,
    receipt: payment.id,
    notes: params.notes,
  });

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

/**
 * Single payment-state transition point. Verified checkout callbacks and
 * verified webhooks both use this function, so booking/payment state changes
 * remain consistent and duplicate terminal deliveries are harmless.
 */
export async function applyPaymentOutcome(
  paymentId: string,
  outcome: Outcome,
  details: { providerPaymentId?: string; failureReason?: string } = {}
) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { ticketBooking: true, stallBooking: { include: { exhibitionExhibitor: true } } },
    });
    if (!payment) return { applied: false as const, reason: "PAYMENT_NOT_FOUND" as const };

    // A cancelled attempt must never be revived by a late provider callback.
    // Partially refunded payments are also terminal for capture purposes.
    if (["paid", "partially_refunded", "refunded", "cancelled"].includes(payment.status)) {
      return { applied: false as const, reason: "ALREADY_TERMINAL" as const, payment };
    }

    // A payment may only become paid/refunded with a provider payment id.
    // The explicit cancelled/failed outcomes are allowed without one because
    // they represent non-settlement outcomes.
    if ((outcome === "paid" || outcome === "refunded") && !details.providerPaymentId && !payment.providerPaymentId) {
      return { applied: false as const, reason: "MISSING_PROVIDER_PAYMENT_ID" as const, payment };
    }

    const nextStatus: Outcome = outcome;
    const updatedPayment = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: nextStatus,
        providerPaymentId: details.providerPaymentId ?? payment.providerPaymentId,
        failureReason: nextStatus === "failed" ? (details.failureReason ?? null) : payment.failureReason,
      },
    });

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
        await tx.stall.updateMany({ where: { id: booking.stallId }, data: { status: "sold" } });
        if (booking.exhibitionExhibitorId) {
          await tx.exhibitionExhibitor.updateMany({
            where: { id: booking.exhibitionExhibitorId, status: "payment_pending" },
            data: { status: "confirmed", confirmedAt: new Date() },
          });
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
          data: { status: "available", exhibitionExhibitorId: null },
        });
        if (booking.exhibitionExhibitorId) {
          await tx.exhibitionExhibitor.updateMany({
            where: { id: booking.exhibitionExhibitorId },
            data: { status: "cancelled" },
          });
        }
      }
    }

    return { applied: true as const, payment: updatedPayment };
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
