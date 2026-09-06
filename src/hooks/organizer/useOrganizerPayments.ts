import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export type PaymentStatus = "created" | "pending" | "paid" | "failed" | "cancelled" | "refunded" | "partially_refunded";
export type RefundStatus = "REQUESTED" | "PROCESSING" | "SUCCEEDED" | "FAILED";
export type RefundReason = "CUSTOMER_REQUEST" | "EVENT_CANCELLED" | "DUPLICATE_PAYMENT" | "ADMINISTRATIVE" | "OTHER";

export interface OrganizerPayment {
  id: string;
  amount: string | number;
  refundedAmount: string | number;
  currency: string;
  provider: string | null;
  status: PaymentStatus;
  createdAt: string;
}

export interface StallPaymentRow {
  id: string;
  amountPaid: string | number;
  paymentStatus: PaymentStatus;
  createdAt: string;
  exhibition: { id: string; name: string };
  stall: { id: string; code: string | null } | null;
  exhibitionExhibitor: { business: { companyName: string | null } } | null;
  payment: OrganizerPayment | null;
}

export interface TicketPaymentRow {
  id: string;
  attendeeName: string | null;
  attendeeEmail: string | null;
  amountPaid: string | number;
  paymentStatus: PaymentStatus;
  createdAt: string;
  exhibition: { id: string; name: string };
  ticketType: { id: string; name: string } | null;
  payment: OrganizerPayment | null;
}

export function useOrganizerPayments(exhibitionId?: string) {
  return useQuery({
    queryKey: ["organizer-payments", exhibitionId],
    queryFn: () =>
      api.get<{ bookings: StallPaymentRow[]; ticketBookings: TicketPaymentRow[] }>(
        `/api/organizer/payments${exhibitionId ? `?exhibitionId=${exhibitionId}` : ""}`
      ),
  });
}

export interface Refund {
  id: string;
  paymentId: string;
  amount: string | number;
  status: RefundStatus;
  reason: RefundReason;
  reasonNote: string | null;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface RefundTotals {
  originalAmount: number;
  refundedAmount: number;
  pendingAmount: number;
  refundableAmount: number;
}

export function usePaymentDetail(paymentId: string | undefined) {
  return useQuery({
    queryKey: ["organizer-payment-detail", paymentId],
    queryFn: () => api.get<{ payment: OrganizerPayment; totals: RefundTotals; refunds: Refund[] }>(`/api/organizer/payments/${paymentId}`),
    enabled: !!paymentId,
  });
}

/**
 * Requests a refund — full (omit `amount`) or partial. The server always
 * recomputes the refundable amount from the database; `idempotencyKey`
 * (generated once per dialog open, not per click) is what makes an
 * accidental double-submit safe rather than a second real provider refund.
 */
export function useRequestRefund(paymentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { amount?: number; reason: RefundReason; reasonNote?: string; idempotencyKey: string }) =>
      api.post<{ refund: Refund; payment: OrganizerPayment; totals: RefundTotals }>(`/api/organizer/payments/${paymentId}/refund`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizer-payment-detail", paymentId] });
      queryClient.invalidateQueries({ queryKey: ["organizer-payments"] });
    },
  });
}

/**
 * Dev/test-only: the mock provider never confirms a refund on its own (see
 * lib/payments/mock.ts) — this simulates the gateway's later confirmation.
 * Returns 403 unless PAYMENT_PROVIDER=mock server-side.
 */
export function useMockCompleteRefund(paymentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ refundId, outcome }: { refundId: string; outcome: "success" | "failure" }) =>
      api.post<{ refund: Refund; payment: OrganizerPayment; totals: RefundTotals }>(
        `/api/organizer/payments/${paymentId}/refunds/${refundId}/mock-complete`,
        { outcome }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizer-payment-detail", paymentId] });
      queryClient.invalidateQueries({ queryKey: ["organizer-payments"] });
    },
  });
}
