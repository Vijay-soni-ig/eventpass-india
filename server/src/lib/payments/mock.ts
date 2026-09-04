import crypto from "crypto";
import { randomUUID } from "crypto";
import type {
  PaymentProvider,
  CreateOrderParams,
  CreateOrderResult,
  VerifyCheckoutParams,
  WebhookEvent,
  RefundResult,
} from "./types";

/**
 * Local/dev/test stand-in for a real gateway. It is NOT a shortcut that lets
 * the frontend assert "payment succeeded" — every outcome still has to be
 * signed with MOCK_PAYMENT_SECRET (an env var, never sent to the browser)
 * and verified with the exact same HMAC-compare code path a real gateway's
 * signature would go through. The only thing "mocked" is which external
 * service produces that signature: here it's this server simulating the
 * gateway's own decision (see routes/paymentsMock.ts, which is the only
 * caller allowed to mint one, and only when PAYMENT_PROVIDER=mock).
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";
  private readonly secret: string;

  constructor() {
    // Falls back to a fixed dev-only string rather than throwing, since this
    // provider only ever runs in non-production/test contexts by design
    // (getPaymentProvider() never selects it when RAZORPAY_* is configured).
    this.secret = process.env.MOCK_PAYMENT_SECRET || "mock-payment-secret-dev-only";
  }

  get isConfigured(): boolean {
    return true;
  }

  get publicKey(): string | null {
    return "mock_public_key";
  }

  async createOrder({ receipt }: CreateOrderParams): Promise<CreateOrderResult> {
    const providerOrderId = `mock_order_${randomUUID()}`;
    return { providerOrderId, raw: { id: providerOrderId, receipt, mock: true } };
  }

  verifyCheckoutSignature({ providerOrderId, providerPaymentId, signature }: VerifyCheckoutParams): boolean {
    const expected = this.sign(`${providerOrderId}|${providerPaymentId}`);
    return expected === signature;
  }

  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    if (!signatureHeader) return false;
    const expected = this.sign(rawBody.toString("utf8"));
    return expected === signatureHeader;
  }

  parseWebhookEvent(rawBody: Buffer): WebhookEvent {
    const body = JSON.parse(rawBody.toString("utf8"));
    return {
      providerEventId: body.eventId,
      eventType: body.eventType,
      providerOrderId: body.providerOrderId,
      providerPaymentId: body.providerPaymentId,
      outcome: body.outcome,
      failureReason: body.failureReason,
      raw: body,
    };
  }

  async refund(providerPaymentId: string): Promise<RefundResult> {
    return {
      providerRefundId: `mock_refund_${randomUUID()}`,
      status: "pending",
      raw: { providerPaymentId, mock: true, note: "Mock provider never moves real money; marked pending for manual follow-up." },
    };
  }

  /** Only used internally by the mock-gateway-decision route — never exported for general use. */
  sign(payload: string): string {
    return crypto.createHmac("sha256", this.secret).update(payload).digest("hex");
  }
}
