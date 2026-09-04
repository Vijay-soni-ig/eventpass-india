import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export interface PaymentOrder {
  providerOrderId: string;
  publicKey: string | null;
  amount: string;
  provider: string;
}

export interface Payment {
  id: string;
  amount: string | number;
  currency: string;
  provider: string | null;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  status: "created" | "pending" | "paid" | "failed" | "cancelled" | "refunded";
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Confirms a payment via the gateway checkout widget's own signed callback.
 * Only used for the real Razorpay path — the server independently verifies
 * the signature before ever marking anything paid.
 */
export function useVerifyPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, ...body }: { paymentId: string; providerOrderId: string; providerPaymentId: string; signature: string }) =>
      api.post<{ payment: Payment }>(`/api/payments/${paymentId}/verify`, body).then((r) => r.payment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["participations"] });
    },
  });
}

/**
 * Dev/test-only: asks the mock provider to simulate the gateway's own
 * decision (success or failure), which then goes through the exact same
 * signature-verification pipeline a real webhook would. Returns 403 unless
 * PAYMENT_PROVIDER=mock server-side — this is not a way to fake payments in
 * production.
 */
export function useMockCompletePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, outcome }: { paymentId: string; outcome: "success" | "failure" }) =>
      api.post<{ payment: Payment }>(`/api/payments/${paymentId}/mock-complete`, { outcome }).then((r) => r.payment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["participations"] });
    },
  });
}
