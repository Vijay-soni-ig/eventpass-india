import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export interface PricingBreakdown {
  baseAmount: number;
  platformFeeAmount: number;
  gatewayFeeAmount: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  organizerAmount: number;
  platformRevenueAmount: number;
  pricingVersionId: string;
  feePaidBy: "organizer" | "attendee" | "split";
}

/**
 * Informational only — mirrors the server's authoritative pricing engine
 * (server/src/lib/pricingEngine.ts) purely so the UI can display an accurate
 * total BEFORE a booking is created. The actual booking/payment-creation
 * call always recalculates independently server-side; this quote is never
 * sent back as, or trusted to become, the charged amount. See
 * docs/PHASE_19A_COMMERCIAL_FOUNDATION_REPORT.md.
 */
export function usePricingQuote(baseAmount: number) {
  return useQuery({
    queryKey: ["pricing-quote", baseAmount],
    queryFn: () =>
      api
        .get<{ breakdown: PricingBreakdown }>(`/api/pricing/quote?baseAmount=${baseAmount}`)
        .then((r) => r.breakdown),
    enabled: Number.isFinite(baseAmount) && baseAmount >= 0,
    retry: 1,
    retryDelay: 500,
  });
}
