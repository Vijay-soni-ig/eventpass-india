import crypto from "crypto";
import { randomUUID } from "crypto";
import type { PaymentProvider, CreateOrderParams, CreateOrderResult, VerifyCheckoutParams, WebhookEvent, RefundResult } from "./types";

/** Local/dev/test stand-in for a real gateway. It never moves real money. */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";
  private readonly secret: string;

  constructor() {
    this.secret = process.env.MOCK_PAYMENT_SECRET || "mock-payment-secret-dev-only";
  }

  get isConfigured(): boolean { return true; }
  get publicKey(): string | null { return "mock_public_key"; }

  async createOrder({ amount, currency, receipt, notes }: CreateOrderParams): Promise<CreateOrderResult> {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Payment amount must be a positive finite number");
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Currency must be a valid ISO 4217 code");
    const providerOrderId = `mock_order_${randomUUID()}`;
    return { providerOrderId, raw: { id: providerOrderId, amount, currency, receipt, notes, mock: true } };
  }

  verifyCheckoutSignature({ providerOrderId, providerPaymentId, signature }: VerifyCheckoutParams): boolean {
    if (!providerOrderId || !providerPaymentId || !/^[a-f0-9]{64}$/i.test(signature)) return false;
    return timingSafeEqualHex(this.sign(`${providerOrderId}|${providerPaymentId}`), signature);
  }

  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    if (!signatureHeader || !/^[a-f0-9]{64}$/i.test(signatureHeader)) return false;
    return timingSafeEqualHex(this.sign(rawBody.toString("utf8")), signatureHeader);
  }

  parseWebhookEvent(rawBody: Buffer): WebhookEvent {
    const body = JSON.parse(rawBody.toString("utf8"));
    return {
      providerEventId: body.eventId,
      eventType: body.eventType,
      providerOrderId: body.providerOrderId,
      providerPaymentId: body.providerPaymentId,
      providerRefundId: body.providerRefundId,
      outcome: body.outcome,
      failureReason: body.failureReason,
      raw: body,
    };
  }

  async refund(providerPaymentId: string, amount: number): Promise<RefundResult> {
    if (!providerPaymentId || !Number.isFinite(amount) || amount <= 0) throw new Error("Invalid refund request");
    return {
      providerRefundId: `mock_refund_${randomUUID()}`,
      status: "pending",
      raw: { providerPaymentId, amount, mock: true, note: "Mock provider never moves real money; marked pending for manual follow-up." },
    };
  }

  sign(payload: string): string { return crypto.createHmac("sha256", this.secret).update(payload).digest("hex"); }
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
