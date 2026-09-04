// Provider-agnostic contract every payment gateway integration implements.
// Nothing outside this folder (routes, paymentService) ever talks to a
// gateway SDK directly — they only ever see this interface, so swapping or
// adding a provider never touches booking/webhook logic.

export interface CreateOrderParams {
  amount: number; // in the currency's smallest unit is handled by the provider impl, callers pass a plain decimal amount
  currency: string;
  receipt: string; // our own payment id, for correlation in the gateway dashboard
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
  /** Short, stable name stored on Payment.provider (e.g. "razorpay", "mock"). */
  readonly name: string;

  /** Whether this provider instance has real credentials configured. */
  readonly isConfigured: boolean;

  /** The public identifier the frontend needs to open the gateway's checkout widget (never a secret). */
  readonly publicKey: string | null;

  createOrder(params: CreateOrderParams): Promise<CreateOrderResult>;

  /**
   * Verifies the signature the gateway's checkout widget hands back to the
   * browser on completion. This is a fast client-side-confirmation path —
   * the webhook (verifyWebhookSignature + parseWebhookEvent) remains the
   * authoritative source of truth and can arrive independently.
   */
  verifyCheckoutSignature(params: VerifyCheckoutParams): boolean;

  /** Verifies a raw webhook request body against its signature header. */
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean;

  /** Parses an already-verified webhook body into a normalized event. */
  parseWebhookEvent(rawBody: Buffer): WebhookEvent;

  /** Issues a refund. Providers without live credentials mark it "pending" for manual follow-up rather than pretending money moved. */
  refund(providerPaymentId: string, amount: number): Promise<RefundResult>;
}
