import { Router } from "express";
import { getPaymentProvider } from "../lib/payments";
import { prisma } from "../lib/prisma";
import { applyPaymentOutcome, recordWebhookEvent } from "../lib/paymentService";

const router = Router();

/**
 * Real gateway webhook receiver. Mounted with express.raw() (see index.ts)
 * so `req.body` here is the exact raw byte buffer the gateway signed —
 * re-serializing a parsed JSON object would produce different bytes and
 * silently break signature verification.
 *
 * This is the authoritative confirmation path: it doesn't trust anything
 * the browser said, only a signature only the gateway's shared secret could
 * have produced.
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

  if (!provider.verifyWebhookSignature(rawBody, signatureHeader)) {
    return res.status(400).json({ error: "Invalid webhook signature" });
  }

  const event = provider.parseWebhookEvent(rawBody);

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
    // Same event delivered again (gateways retry on any non-2xx, or just
    // out of caution) — acknowledge without reprocessing.
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
