import { Router } from "express";
import { getPaymentProvider } from "../lib/payments";
import { prisma } from "../lib/prisma";
import { applyPaymentOutcome, recordWebhookEvent } from "../lib/paymentService";
import { finalizeRefundFailure, finalizeRefundSuccess, requestRefund } from "../lib/refundService";

const router = Router();

/**
 * A captured payment cannot be silently discarded just because its webhook
 * is replayed. The normal payment outcome path can mark a late ticket order
 * FAILED while leaving the payment financially PAID; this helper ensures the
 * corresponding compensation refund is recorded exactly once.
 */
async function ensureLatePaymentCompensation(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      eventTicketOrder: { include: { reservation: true } },
      stallBooking: { include: { stall: true } },
    },
  });
  if (!payment || payment.status !== "paid") return;

  const order = payment.eventTicketOrder;
  const lateTicketCapture = Boolean(
    order &&
    order.status === "FAILED" &&
    (order.reservation.status !== "ACTIVE" || order.reservation.expiresAt <= new Date())
  );
  // applyPaymentOutcome deliberately leaves a cancelled stall booking and its
  // inventory untouched when a provider reports a late capture. Replays must
  // still recover the compensation request if the first webhook failed after
  // recording the payment but before creating the refund.
  const stallBooking = payment.stallBooking;
  const lateStallCapture = Boolean(
    stallBooking &&
    (
      stallBooking.paymentStatus === "cancelled" ||
      stallBooking.stall.status !== "sold" ||
      (stallBooking.exhibitionExhibitorId != null &&
        stallBooking.stall.exhibitionExhibitorId !== stallBooking.exhibitionExhibitorId)
    )
  );
  if (!lateTicketCapture && !lateStallCapture) return;

  const requestedByUserId = order?.userId ?? payment.stallBooking?.buyerUserId;
  if (!requestedByUserId) return;

  await requestRefund({
    paymentId: payment.id,
    reason: "ADMINISTRATIVE",
    reasonNote: lateTicketCapture
      ? "Captured payment arrived after the ticket reservation expired or was cancelled"
      : "Captured exhibitor stall payment arrived after the payment attempt was cancelled; booking state was not reactivated",
    idempotencyKey: `late-payment-compensation:${payment.id}`,
    requestedByUserId,
  });
}

/**
 * Authoritative gateway webhook receiver. Mounted with express.raw() so the
 * exact signed bytes are verified before parsing or mutating financial state.
 */
router.post("/:provider", async (req, res) => {
  const provider = getPaymentProvider();
  if (req.params.provider !== provider.name) return res.status(404).json({ error: "Unknown payment provider" });

  const rawBody = req.body as Buffer;
  const signatureHeader = (req.headers["x-razorpay-signature"] ?? req.headers["x-mock-signature"]) as string | undefined;
  const providerEventIdHeader = req.headers["x-razorpay-event-id"];
  const providerEventId = Array.isArray(providerEventIdHeader) ? providerEventIdHeader[0] : providerEventIdHeader;

  if (!provider.verifyWebhookSignature(rawBody, signatureHeader)) return res.status(400).json({ error: "Invalid webhook signature" });

  let event;
  try {
    event = provider.parseWebhookEvent(rawBody, providerEventId);
  } catch {
    return res.status(400).json({ error: "Invalid webhook payload" });
  }

  // Refund webhooks are validated against the local refund ledger before
  // the webhook event is recorded as processed. This prevents a validly
  // signed provider payload with the wrong amount/payment/order identity from
  // mutating local financial state or being permanently marked duplicate.
  if (event.eventType === "refund.processed" || event.eventType === "refund.failed") {
    if (!event.providerRefundId) return res.status(400).json({ error: "Refund webhook is missing provider refund id" });
    if (!event.providerPaymentId) return res.status(400).json({ error: "Refund webhook is missing provider payment id" });

    let refund = await prisma.refund.findUnique({
      where: { providerRefundId: event.providerRefundId },
      include: { payment: { select: { providerPaymentId: true, providerOrderId: true } } },
    });

    // A provider can deliver a terminal refund event after creating the remote refund
    // but before requestRefund persists providerRefundId locally. New refund
    // requests carry our immutable Refund.id in provider notes so this signed
    // callback can resolve the exact local reservation without guessing among
    // multiple partial refunds for the same payment.
    if (!refund && event.providerRefundReference) {
      const referenced = await prisma.refund.findUnique({
        where: { id: event.providerRefundReference },
        include: { payment: { select: { providerPaymentId: true, providerOrderId: true } } },
      });
      if (referenced) {
        if (referenced.provider !== provider.name) return res.status(400).json({ error: "Refund provider mismatch" });
        if (!event.providerPaymentId || referenced.payment.providerPaymentId !== event.providerPaymentId) {
          return res.status(400).json({ error: "Refund payment mismatch" });
        }
        if (event.providerOrderId && referenced.payment.providerOrderId !== event.providerOrderId) {
          return res.status(400).json({ error: "Refund order mismatch" });
        }
        if (event.refundAmount == null || Math.abs(event.refundAmount - Number(referenced.amount)) > 0.005) {
          return res.status(400).json({ error: "Refund amount mismatch" });
        }
        if (referenced.providerRefundId && referenced.providerRefundId !== event.providerRefundId) {
          return res.status(409).json({ error: "Refund provider identity mismatch" });
        }
        refund = referenced;
      }
    }

    if (!refund) return res.status(200).json({ received: true, reconciled: false });
    if (refund.provider !== provider.name) return res.status(400).json({ error: "Refund provider mismatch" });
    if (event.providerRefundReference && refund.id !== event.providerRefundReference) {
      return res.status(400).json({ error: "Refund reference mismatch" });
    }
    if (refund.providerRefundId && refund.providerRefundId !== event.providerRefundId) {
      return res.status(409).json({ error: "Refund provider identity mismatch" });
    }
    if (event.refundAmount == null || Math.abs(event.refundAmount - Number(refund.amount)) > 0.005) {
      return res.status(400).json({ error: "Refund amount mismatch" });
    }
    if (refund.payment.providerPaymentId !== event.providerPaymentId) {
      return res.status(400).json({ error: "Refund payment mismatch" });
    }
    if (event.providerOrderId && refund.payment.providerOrderId !== event.providerOrderId) {
      return res.status(400).json({ error: "Refund order mismatch" });
    }

    const refundId = refund.id;
    const finalize = () => event.eventType === "refund.failed"
      ? finalizeRefundFailure(refundId, "Payment provider reported the refund as failed", undefined, event.providerRefundId)
      : finalizeRefundSuccess(refundId, event.providerRefundId);

    const { isDuplicate } = await recordWebhookEvent({
      provider: provider.name,
      providerEventId: event.providerEventId,
      eventType: event.eventType,
      payload: event.raw,
      paymentId: refund.paymentId,
    });
    if (isDuplicate) {
      // The event can be persisted before local refund finalization succeeds.
      // Re-run the idempotent finalizer while the refund is still pending.
      const currentRefund = await prisma.refund.findUnique({
        where: { id: refund.id },
        select: { status: true },
      });
      if (currentRefund && (currentRefund.status === "PROCESSING" || currentRefund.status === "REQUESTED")) {
        await finalize();
        return res.status(200).json({ received: true, duplicate: true, reconciled: true });
      }
      return res.status(200).json({ received: true, duplicate: true });
    }

    await finalize();
    return res.status(200).json({ received: true, reconciled: true });
  }

  const payment = event.providerOrderId
    ? await prisma.payment.findUnique({
        where: { providerOrderId: event.providerOrderId },
        include: { ticketBooking: true, eventTicketOrder: true, stallBooking: true },
      })
    : null;

  if (payment && event.providerPaymentId && payment.providerPaymentId && payment.providerPaymentId !== event.providerPaymentId) {
    return res.status(400).json({ error: "Payment identity mismatch" });
  }

  // A valid signature proves who sent the event, not that the captured amount
  // and currency match this local order. Reject mismatches before recording
  // the event so a corrected provider delivery can be processed later.
  if (payment && event.outcome === "paid") {
    if (event.paymentAmount == null || !Number.isFinite(event.paymentAmount)) {
      return res.status(400).json({ error: "Captured payment is missing a valid amount" });
    }
    if (!event.paymentCurrency) {
      return res.status(400).json({ error: "Captured payment is missing currency" });
    }
    if (Math.abs(event.paymentAmount - Number(payment.amount)) > 0.005) {
      return res.status(400).json({ error: "Payment amount mismatch" });
    }
    if (event.paymentCurrency !== payment.currency) {
      return res.status(400).json({ error: "Payment currency mismatch" });
    }
  }

  const { isDuplicate } = await recordWebhookEvent({
    provider: provider.name,
    providerEventId: event.providerEventId,
    eventType: event.eventType,
    payload: event.raw,
    paymentId: payment?.id,
  });

  // The webhook ledger write and payment transition are separate operations.
  // A process failure between them leaves a durable event with an unapplied
  // outcome. Re-run the idempotent, payment-row-locked transition for every
  // duplicate with a recognized outcome; terminal states make successful
  // replays no-ops. This also recovers events first received before the local
  // provider-order mapping was persisted.

  if (payment && event.outcome) {
    const outcomeResult = await applyPaymentOutcome(payment.id, event.outcome, {
      providerPaymentId: event.providerPaymentId,
      failureReason: event.failureReason,
    });
    if (event.outcome === "paid" && "requiresRefund" in outcomeResult && outcomeResult.requiresRefund && outcomeResult.payment) {
      const requestedByUserId = payment.eventTicketOrder?.userId ?? payment.stallBooking?.buyerUserId ?? payment.ticketBooking?.buyerUserId;
      if (requestedByUserId) {
        await requestRefund({
          paymentId: payment.id,
          reason: "ADMINISTRATIVE",
          reasonNote: outcomeResult.refundReason ?? "Captured payment could not be applied to its original booking or inventory",
          idempotencyKey: `late-payment-compensation:${payment.id}`,
          requestedByUserId,
        });
      }
    }
    if (event.outcome === "paid") {
      await ensureLatePaymentCompensation(payment.id);
    }
  }

  return res.status(200).json({ received: true, ...(isDuplicate ? { duplicate: true } : {}) });
});

export default router;
