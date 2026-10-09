import { Router } from "express";
import { getPaymentProvider } from "../lib/payments";
import { prisma } from "../lib/prisma";
import { applyPaymentOutcome, recordWebhookEvent } from "../lib/paymentService";
import { finalizeRefundSuccess, requestRefund } from "../lib/refundService";

const router = Router();

/**
 * A captured payment cannot be silently discarded just because its webhook
 * is replayed. The normal payment outcome path can mark a late ticket order
 * FAILED while leaving the payment financially PAID; this helper ensures the
 * corresponding compensation refund is recorded exactly once.
 */
async function ensureLateTicketPaymentCompensation(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { eventTicketOrder: { include: { reservation: true } } },
  });
  const order = payment?.eventTicketOrder;
  if (!payment || payment.status !== "paid" || !order || order.status !== "FAILED") return;

  const reservation = order.reservation;
  const inventoryReleased =
    reservation.status !== "ACTIVE" || reservation.expiresAt <= new Date();
  if (!inventoryReleased) return;

  await requestRefund({
    paymentId: payment.id,
    reason: "ADMINISTRATIVE",
    reasonNote: "Captured payment arrived after the ticket reservation expired or was cancelled",
    idempotencyKey: `late-payment-compensation:${payment.id}`,
    requestedByUserId: order.userId,
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
  if (event.eventType === "refund.processed") {
    if (!event.providerRefundId) return res.status(400).json({ error: "Refund webhook is missing provider refund id" });

    const refund = await prisma.refund.findUnique({
      where: { providerRefundId: event.providerRefundId },
      include: { payment: { select: { providerPaymentId: true, providerOrderId: true } } },
    });
    if (!refund) return res.status(200).json({ received: true, reconciled: false });

    if (event.refundAmount == null || Math.abs(event.refundAmount - Number(refund.amount)) > 0.005) {
      return res.status(400).json({ error: "Refund amount mismatch" });
    }
    if (event.providerPaymentId && refund.payment.providerPaymentId !== event.providerPaymentId) {
      return res.status(400).json({ error: "Refund payment mismatch" });
    }
    if (event.providerOrderId && refund.payment.providerOrderId !== event.providerOrderId) {
      return res.status(400).json({ error: "Refund order mismatch" });
    }

    const { isDuplicate } = await recordWebhookEvent({
      provider: provider.name,
      providerEventId: event.providerEventId,
      eventType: event.eventType,
      payload: event.raw,
      paymentId: refund.paymentId,
    });
    if (isDuplicate) return res.status(200).json({ received: true, duplicate: true });

    await finalizeRefundSuccess(refund.id, event.providerRefundId);
    return res.status(200).json({ received: true, reconciled: true });
  }

  const payment = event.providerOrderId
    ? await prisma.payment.findUnique({ where: { providerOrderId: event.providerOrderId } })
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

  // Non-success duplicates have no compensation work to recover. For captured
  // payments, continue through the idempotent outcome handler even on replay:
  // a prior attempt may have recorded the webhook but failed before creating
  // the required compensation refund.
  if (isDuplicate && event.outcome !== "paid") {
    return res.status(200).json({ received: true, duplicate: true });
  }

  if (payment && event.outcome) {
    await applyPaymentOutcome(payment.id, event.outcome, {
      providerPaymentId: event.providerPaymentId,
      failureReason: event.failureReason,
    });
    if (event.outcome === "paid") {
      await ensureLateTicketPaymentCompensation(payment.id);
    }
  }

  return res.status(200).json({ received: true, ...(isDuplicate ? { duplicate: true } : {}) });
});

export default router;
