// Provider-agnostic contract every payment gateway integration implements.
// Nothing outside this folder (routes, paymentService) ever talks to a
// gateway SDK directly — they only ever see this interface, so swapping or
// adding a provider never touches booking/webhook logic.

export interface CreateOrderParams {
  amount: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface CreateOrderResult {
  providerOrderId: string;
  raw: unknown;
}

export interface VerifyCheckoutParams {
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
}

export interface WebhookEvent {
  providerEventId: string;
  eventType: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  providerRefundId?: string;
  /** Normalized outcome this event implies, if any. */
  outcome?: "paid" | "failed" | "refunded";
  failureReason?: string;
  raw: unknown;
}

export interface RefundResult {
  providerRefundId: string;
  status: "processed" | "pending";
  raw: unknown;
}

export interface PaymentProvider {
  readonly name: string;
  readonly isConfigured: boolean;
  readonly publicKey: string | null;
  createOrder(params: CreateOrderParams): Promise<CreateOrderResult>;
  verifyCheckoutSignature(params: VerifyCheckoutParams): boolean;
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean;
  parseWebhookEvent(rawBody: Buffer, providerEventId?: string): WebhookEvent;
  refund(providerPaymentId: string, amount: number): Promise<RefundResult>;
}
