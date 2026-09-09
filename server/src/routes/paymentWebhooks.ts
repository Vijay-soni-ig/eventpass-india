import { Router } from "express";
import { getPaymentProvider } from "../lib/payments";
import { prisma } from "../lib/prisma";
import { applyPaymentOutcome, recordWebhookEvent } from "../lib/paymentService";

const router = Router();

/**
 * Real gateway webhook receiver. Mounted with express.raw() so `req.body`
 * remains the exact byte sequence signed by the gateway.
 *
 * This is the authoritative payment confirmation path: browser callbacks are
 * never trusted as the source of truth. Signature verification, stable event
 * ID deduplication, and server-side payment lookup happen before any outcome
 * can change a booking.
 */
router.post("/:provider", async (req, res) => {
  const provider = getPaymentProvider();
  if (req.params.provider !== provider.name) {
    return res.status(404).json({ error: "Unknown payment provider" });
  }

  const rawBody = req.body as Buffer;
  const signatureHeader = (req.headers["x-razorpay-signature"] ?? req.headers["x-mock-signature"]) as
    | string
    | undefined;
  const providerEventIdHeader = req.headers["x-razorpay-event-id"];
  const providerEventId = Array.isArray(providerEventIdHeader)
    ? providerEventIdHeader[0]
    : providerEventIdHeader;

  if (!provider.verifyWebhookSignature(rawBody, signatureHeader)) {
    return res.status(400).json({ error: "Invalid webhook signature" });
  }

  let event;
  try {
    event = provider.parseWebhookEvent(rawBody, providerEventId);
  } catch {
    // Never expose gateway payload parsing details to callers.
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

  if (isDuplicate) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  if (payment && event.outcome) {
    await applyPaymentOutcome(payment.id, event.outcome, {
      providerPaymentId: event.providerPaymentId,
      failureReason: event.failureReason,
    });
  }

  res.status(200).json({ received: true });
});

export default router;
