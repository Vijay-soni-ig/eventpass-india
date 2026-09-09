import { Router } from "express";
import { getPaymentProvider } from "../lib/payments";
import { prisma } from "../lib/prisma";
import { applyPaymentOutcome, recordWebhookEvent } from "../lib/paymentService";
import { finalizeRefundSuccess } from "../lib/refundService";

const router = Router();

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

  const payment = event.providerOrderId
    ? await prisma.payment.findUnique({ where: { providerOrderId: event.providerOrderId } })
    : null;

  const { isDuplicate } = await recordWebhookEvent({
    provider: provider.name,
    providerEventId: event.providerEventId,
    eventType: event.eventType,
    payload: event.raw,
    paymentId: payment?.id,
  });

  if (isDuplicate) return res.status(200).json({ received: true, duplicate: true });

  // Refund webhooks finalize the existing Refund ledger row. A provider
  // refund event must never invent a financial state when no local refund
  // matches its stable providerRefundId.
  if (event.eventType === "refund.processed") {
    if (!event.providerRefundId) return res.status(200).json({ received: true, reconciled: false });

    const refund = await prisma.refund.findUnique({ where: { providerRefundId: event.providerRefundId } });
    if (!refund) return res.status(200).json({ received: true, reconciled: false });

    await finalizeRefundSuccess(refund.id, event.providerRefundId);
    return res.status(200).json({ received: true, reconciled: true });
  }

  if (payment && event.outcome) {
    await applyPaymentOutcome(payment.id, event.outcome, {
      providerPaymentId: event.providerPaymentId,
      failureReason: event.failureReason,
    });
  }

  return res.status(200).json({ received: true });
});

export default router;
