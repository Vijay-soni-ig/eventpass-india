import crypto from "crypto";
import Razorpay from "razorpay";
import type { PaymentProvider, CreateOrderParams, CreateOrderResult, VerifyCheckoutParams, WebhookEvent, RefundResult } from "./types";

/** Real Razorpay integration. Credentials are supplied only through the environment. */
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

  get isConfigured(): boolean { return !!(this.keyId && this.keySecret && this.webhookSecret); }
  get publicKey(): string | null { return this.keyId ?? null; }

  async createOrder({ amount, currency, receipt, notes }: CreateOrderParams): Promise<CreateOrderResult> {
    if (!this.client) throw new Error("Razorpay is not configured");
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid payment amount");
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid payment currency");
    const order = await this.client.orders.create({ amount: Math.round(amount * 100), currency, receipt, notes });
    return { providerOrderId: order.id, raw: order };
  }

  verifyCheckoutSignature({ providerOrderId, providerPaymentId, signature }: VerifyCheckoutParams): boolean {
    if (!this.keySecret || !providerOrderId || !providerPaymentId || !/^[a-f0-9]{64}$/i.test(signature)) return false;
    const expected = crypto.createHmac("sha256", this.keySecret).update(`${providerOrderId}|${providerPaymentId}`).digest("hex");
    return timingSafeEqualHex(expected, signature);
  }

  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    if (!this.webhookSecret || !signatureHeader || !/^[a-f0-9]{64}$/i.test(signatureHeader)) return false;
    const expected = crypto.createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex");
    return timingSafeEqualHex(expected, signatureHeader);
  }

  parseWebhookEvent(rawBody: Buffer, providerEventId?: string): WebhookEvent {
    const body = JSON.parse(rawBody.toString("utf8"));
    const eventType = body.event as string;
    const paymentEntity = body.payload?.payment?.entity;
    const refundEntity = body.payload?.refund?.entity;
    const outcome = eventType === "payment.captured" ? "paid" : eventType === "payment.failed" ? "failed" : eventType === "refund.processed" ? "refunded" : undefined;
    const refundAmount = typeof refundEntity?.amount === "number" ? refundEntity.amount / 100 : undefined;
    return {
      providerEventId: providerEventId?.trim() || (paymentEntity?.id ? `${eventType}:${paymentEntity.id}` : refundEntity?.id ? `${eventType}:${refundEntity.id}` : `${eventType}:${Buffer.from(rawBody).toString("base64url")}`),
      eventType,
      providerOrderId: paymentEntity?.order_id ?? refundEntity?.order_id,
      providerPaymentId: paymentEntity?.id ?? refundEntity?.payment_id,
      providerRefundId: refundEntity?.id,
      refundAmount,
      outcome,
      failureReason: paymentEntity?.error_description ?? undefined,
      raw: body,
    };
  }

  async refund(providerPaymentId: string, amount: number): Promise<RefundResult> {
    if (!this.client) throw new Error("Razorpay is not configured");
    if (!providerPaymentId.trim()) throw new Error("Missing provider payment id");
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid refund amount");
    const refund = await this.client.payments.refund(providerPaymentId, { amount: Math.round(amount * 100) });
    return { providerRefundId: refund.id, status: "processed", raw: refund };
  }
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
