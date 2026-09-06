import { RazorpayProvider } from "./razorpay";
import { MockPaymentProvider } from "./mock";
import type { PaymentProvider } from "./types";

export type { PaymentProvider, WebhookEvent, CreateOrderResult } from "./types";
export { MockPaymentProvider } from "./mock";

let cached: PaymentProvider | null = null;

/**
 * Resolves the single configured payment provider. Never picks an arbitrary
 * one at random: if PAYMENT_PROVIDER=razorpay is requested but credentials
 * are missing, this fails loudly rather than silently downgrading. When
 * PAYMENT_PROVIDER is unset entirely, it defaults to the mock provider only
 * outside production (NODE_ENV=production) — in production an unset value
 * throws instead of silently accepting real money-shaped requests through
 * the mock, no-real-charge payment path.
 */
export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;

  const requested = process.env.PAYMENT_PROVIDER?.toLowerCase();

  if (requested === "razorpay") {
    const provider = new RazorpayProvider();
    if (!provider.isConfigured) {
      throw new Error(
        "PAYMENT_PROVIDER=razorpay but RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET are not fully set"
      );
    }
    cached = provider;
    return provider;
  }

  if (requested === "mock") {
    cached = new MockPaymentProvider();
    return cached;
  }

  if (!requested) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "PAYMENT_PROVIDER is not set. Refusing to silently fall back to the mock payment provider in production — set PAYMENT_PROVIDER=razorpay (or mock, if that is genuinely intended) explicitly."
      );
    }
    cached = new MockPaymentProvider();
    return cached;
  }

  throw new Error(`Unknown PAYMENT_PROVIDER "${requested}" — supported values are "razorpay" or "mock"`);
}

/** For tests: reset the cached provider so env changes take effect. */
export function resetPaymentProviderCache() {
  cached = null;
}
