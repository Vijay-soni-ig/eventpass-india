import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { paymentVerifyRateLimit } from "../middleware/rateLimit";
import { getPaymentProvider, MockPaymentProvider } from "../lib/payments";
import { applyPaymentOutcome, recordWebhookEvent } from "../lib/paymentService";
import { requestRefund } from "../lib/refundService";

const router = Router();

router.use(requireAuth);

async function loadOwnedPayment(paymentId: string, userId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { ticketBooking: true, eventTicketOrder: true, stallBooking: true },
  });
  if (!payment) return null;
  const ownerId = payment.ticketBooking?.buyerUserId ?? payment.eventTicketOrder?.userId ?? payment.stallBooking?.buyerUserId;
  if (ownerId !== userId) return null;
  return payment;
}

router.get("/:id", async (req, res) => {
  const payment = await loadOwnedPayment(req.params.id, req.user!.id);
  if (!payment) return res.status(404).json({ error: "Payment not found" });
  res.json({ payment });
});

// -------- Checkout-callback verification (fast path) --------
//
// This is what the gateway's checkout widget hands the browser on
// completion. It is a UX fast-path only — verifying the signature proves the
// browser is relaying something the gateway actually produced (the
// browser itself never gets to just assert "paid"), but the webhook remains
// authoritative and can independently confirm/correct the same payment.
const verifySchema = z.object({
  providerOrderId: z.string(),
  providerPaymentId: z.string(),
  signature: z.string(),
});

router.post("/:id/verify", paymentVerifyRateLimit, async (req, res) => {
  const payment = await loadOwnedPayment(req.params.id, req.user!.id);
  if (!payment) return res.status(404).json({ error: "Payment not found" });

  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  if (payment.providerOrderId !== parsed.data.providerOrderId) {
    return res.status(400).json({ error: "Order mismatch" });
  }

  const provider = getPaymentProvider();
  const valid = provider.verifyCheckoutSignature(parsed.data);
  if (!valid) {
    // Invalid client-supplied proof is not evidence of a gateway-side failure.
    // Never let a bad callback mutate a legitimate payment state.
    return res.status(400).json({ error: "Payment signature could not be verified" });
  }

  if (provider.name !== "mock") {
    let providerPayment;
    try {
      providerPayment = await provider.fetchPayment(parsed.data.providerPaymentId);
    } catch {
      return res.status(502).json({ error: "Payment provider could not verify the captured payment" });
    }
    if (providerPayment.providerPaymentId !== parsed.data.providerPaymentId) {
      return res.status(400).json({ error: "Payment provider identity mismatch" });
    }
    if (providerPayment.providerOrderId !== payment.providerOrderId) {
      return res.status(400).json({ error: "Payment provider order mismatch" });
    }
    if (providerPayment.status !== "captured") {
      return res.status(409).json({ error: "Payment has not been captured by the provider" });
    }
    if (Math.abs(providerPayment.amount - Number(payment.amount)) > 0.005) {
      return res.status(400).json({ error: "Payment amount mismatch" });
    }
    if (providerPayment.currency !== payment.currency) {
      return res.status(400).json({ error: "Payment currency mismatch" });
    }
  }

  const result = await applyPaymentOutcome(payment.id, "paid", {
    providerPaymentId: parsed.data.providerPaymentId,
  });
  if ("requiresRefund" in result && result.requiresRefund && result.payment) {
    await requestRefund({
      paymentId: result.payment.id,
      reason: "ADMINISTRATIVE",
      reasonNote: result.refundReason,
      idempotencyKey: `late-payment-compensation:${result.payment.id}`,
      requestedByUserId: payment.eventTicketOrder?.userId ?? req.user!.id,
    });
  }
  res.json({ payment: result.payment ?? payment });
});

// -------- Mock-gateway decision (test/dev only) --------
//
// Only reachable when PAYMENT_PROVIDER=mock (or unset). It does NOT let the
// frontend assert a payment status directly — it asks the mock provider
// (standing in for the gateway/bank/card network's own decision) to mint a
// signed outcome, then feeds it through the exact same
// verify-signature -> record-event -> apply-outcome pipeline the real
// webhook route uses. The frontend only ever chooses which OUTCOME to
// simulate for local testing; it never touches Payment.status directly.
const mockCompleteSchema = z.object({ outcome: z.enum(["success", "failure"]) });

router.post("/:id/mock-complete", paymentVerifyRateLimit, async (req, res) => {
  const provider = getPaymentProvider();
  if (!(provider instanceof MockPaymentProvider)) {
    return res.status(403).json({ error: "Mock payment completion is only available when PAYMENT_PROVIDER=mock" });
  }

  const payment = await loadOwnedPayment(req.params.id, req.user!.id);
  if (!payment) return res.status(404).json({ error: "Payment not found" });

  const parsed = mockCompleteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const providerPaymentId = `mock_pay_${payment.id}`;
  const eventType = parsed.data.outcome === "success" ? "payment.captured" : "payment.failed";
  const body = {
    eventId: `${eventType}:${providerPaymentId}:${Date.now()}`,
    eventType,
    providerOrderId: payment.providerOrderId,
    providerPaymentId,
    amount: Number(payment.amount),
    currency: payment.currency,
    outcome: parsed.data.outcome === "success" ? "paid" : "failed",
    failureReason: parsed.data.outcome === "failure" ? "Simulated failure for testing" : undefined,
  };
  const rawBody = Buffer.from(JSON.stringify(body), "utf8");
  const signature = provider.sign(rawBody.toString("utf8"));

  // Feed it through the real verification path rather than calling
  // applyPaymentOutcome directly — this exercises the identical code a
  // genuine webhook delivery would run.
  if (!provider.verifyWebhookSignature(rawBody, signature)) {
    return res.status(500).json({ error: "Mock signing failed" });
  }
  const event = provider.parseWebhookEvent(rawBody);
  const { isDuplicate } = await recordWebhookEvent({
    provider: provider.name,
    providerEventId: event.providerEventId,
    eventType: event.eventType,
    payload: event.raw,
    paymentId: payment.id,
  });
  if (!isDuplicate && event.outcome) {
    const result = await applyPaymentOutcome(payment.id, event.outcome, { providerPaymentId: event.providerPaymentId, failureReason: event.failureReason });
    if (result.requiresRefund && result.payment) {
      await requestRefund({
        paymentId: result.payment.id,
        reason: "ADMINISTRATIVE",
        reasonNote: result.refundReason,
        idempotencyKey: `late-payment-compensation:${result.payment.id}`,
        requestedByUserId: payment.eventTicketOrder?.userId ?? req.user!.id,
      });
    }
  }

  const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
  res.json({ payment: updated });
});

export default router;
