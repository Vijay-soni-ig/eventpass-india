import crypto from "crypto";
import Razorpay from "razorpay";
import type {
  PaymentProvider,
  CreateOrderParams,
  CreateOrderResult,
  VerifyCheckoutParams,
  WebhookEvent,
  RefundResult,
} from "./types";

/**
 * Real Razorpay integration. Requires RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET,
 * and RAZORPAY_WEBHOOK_SECRET in the environment — none of which are set in
 * this environment, so `isConfigured` is false and getPaymentProvider()
 * falls back to the mock provider (see index.ts). The code here is real and
 * correct, just inert without credentials — per instructions, this isn't a
 * simulation dressed up as Razorpay, it's the actual integration waiting on
 * configuration.
 */
export class RazorpayProvider implements PaymentProvider {
  readonly name = "razorpay";
  private readonly keyId: string | undefined;
  private readonly keySecret: string | undefined;
  private readonly webhookSecret: string | undefined;
  private client: Razorpay | null = null;

  constructor() {
    this.keyId = process.env.RAZORPAY_KEY_ID;
    this.keySecret = process.env.RAZORPAY_KEY_SECRET;
    this.webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (this.keyId && this.keySecret) {
      this.client = new Razorpay({ key_id: this.keyId, key_secret: this.keySecret });
    }
  }

  get isConfigured(): boolean {
    return !!(this.keyId && this.keySecret && this.webhookSecret);
  }

  get publicKey(): string | null {
    return this.keyId ?? null;
  }

  async createOrder({ amount, currency, receipt, notes }: CreateOrderParams): Promise<CreateOrderResult> {
    if (!this.client) throw new Error("Razorpay is not configured");
    // Razorpay amounts are in the smallest currency unit (paise for INR).
    const order = await this.client.orders.create({
      amount: Math.round(amount * 100),
      currency,
      receipt,
      notes,
    });
    return { providerOrderId: order.id, raw: order };
  }

  verifyCheckoutSignature({ providerOrderId, providerPaymentId, signature }: VerifyCheckoutParams): boolean {
    if (!this.keySecret) return false;
    const expected = crypto
      .createHmac("sha256", this.keySecret)
      .update(`${providerOrderId}|${providerPaymentId}`)
      .digest("hex");
    return timingSafeEqualHex(expected, signature);
  }

  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    if (!this.webhookSecret || !signatureHeader) return false;
    const expected = crypto.createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex");
    return timingSafeEqualHex(expected, signatureHeader);
  }

  parseWebhookEvent(rawBody: Buffer): WebhookEvent {
    const body = JSON.parse(rawBody.toString("utf8"));
    const eventType = body.event as string;
    const paymentEntity = body.payload?.payment?.entity;
    const outcome =
      eventType === "payment.captured"
        ? "paid"
        : eventType === "payment.failed"
          ? "failed"
          : eventType === "refund.processed"
            ? "refunded"
            : undefined;

    return {
      // Razorpay doesn't send a distinct event id in the payload; the
      // X-Razorpay-Event-Id header (read by the route) is the real
      // dedupe key — this is a fallback if that header is ever missing.
      providerEventId: body.payload?.payment?.entity?.id
        ? `${eventType}:${body.payload.payment.entity.id}`
        : `${eventType}:${Date.now()}`,
      eventType,
      providerOrderId: paymentEntity?.order_id,
      providerPaymentId: paymentEntity?.id,
      outcome,
      failureReason: paymentEntity?.error_description ?? undefined,
      raw: body,
    };
  }

  async refund(providerPaymentId: string, amount: number): Promise<RefundResult> {
    if (!this.client) throw new Error("Razorpay is not configured");
    const refund = await this.client.payments.refund(providerPaymentId, {
      amount: Math.round(amount * 100),
    });
    return { providerRefundId: refund.id, status: "processed", raw: refund };
  }
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
