import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getPaymentProvider } from "./payments";

/**
 * Creates a Payment row in "created" status and asks the configured
 * provider to open a real order against it. Nothing here ever sets a
 * payment to "paid" — that only ever happens in applyPaymentOutcome, driven
 * by a verified signature (checkout callback) or a verified webhook.
 */
export async function createOrderForPayment(params: {
  amount: number;
  currency?: string;
  notes?: Record<string, string>;
}) {
  const provider = getPaymentProvider();
  const currency = params.currency ?? "INR";

  const payment = await prisma.payment.create({
    data: { amount: params.amount, currency, provider: provider.name, status: "created" },
  });

  const order = await provider.createOrder({
    amount: params.amount,
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
    order: { providerOrderId: order.providerOrderId, publicKey: provider.publicKey, amount: currency, provider: provider.name },
  };
}

type Outcome = "paid" | "failed" | "cancelled" | "refunded";

/**
 * The single place a Payment (and its linked booking) transitions based on
 * a verified gateway outcome. Both the checkout-callback verify route and
 * the webhook route funnel through this, so a duplicate delivery of either
 * is naturally idempotent: re-applying "paid" to an already-paid payment is
 * a no-op, not a double-charge or a double-confirm.
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

    // Terminal states don't get re-applied — this is what makes a duplicate
    // webhook (or a webhook arriving after the checkout-callback already
    // confirmed the same outcome) a no-op.
    if (payment.status === "paid" || payment.status === "refunded") {
      return { applied: false as const, reason: "ALREADY_TERMINAL" as const, payment };
    }
    if (payment.status === "cancelled" && outcome !== "paid") {
      return { applied: false as const, reason: "ALREADY_TERMINAL" as const, payment };
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
        // Stall stays reserved (not released) so the exhibitor can retry
        // payment; only a refund or an explicit cancel releases the stall.
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

/**
 * Idempotent webhook record: a duplicate (provider, providerEventId) is a
 * no-op via the unique constraint rather than reprocessing the event.
 */
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
