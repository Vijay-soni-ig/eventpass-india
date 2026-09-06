import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { Exhibition, Stall, StallBooking } from "@/types/exhibitor";
import type { Payment, PaymentOrder } from "@/hooks/usePayments";

export type ParticipationStatus =
  | "applied"
  | "approved"
  | "rejected"
  | "stall_pending"
  | "stall_reserved"
  | "payment_pending"
  | "confirmed"
  | "cancelled";

export interface Participation {
  id: string;
  exhibitionId: string;
  exhibitorBusinessId: string;
  status: ParticipationStatus;
  boothNumber: string | null;
  invitedAt: string;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  exhibition?: Exhibition;
  stalls?: Stall[];
}

export function useParticipations(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["participations"],
    queryFn: () => api.get<{ participations: Participation[] }>("/api/exhibitor/participations").then((r) => r.participations),
    enabled: options.enabled ?? true,
  });
}

export function useApplyToExhibition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (exhibitionId: string) =>
      api.post<{ participation: Participation }>("/api/exhibitor/participations", { exhibitionId }).then((r) => r.participation),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["participations"] }),
  });
}

export function useCancelParticipation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.patch<{ participation: Participation }>(`/api/exhibitor/participations/${id}/cancel`).then((r) => r.participation),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["participations"] }),
  });
}

export function useSelectStall() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stallId }: { id: string; stallId: string }) =>
      api.post<{ participation: Participation }>(`/api/exhibitor/participations/${id}/stall`, { stallId }).then((r) => r.participation),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["participations"] }),
  });
}

export function useInitiatePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      // `alreadyPaid`/`order: null` cover the Phase 21B retry-safe responses
      // (already-succeeded or resumed-in-place attempts) — see
      // server/src/routes/exhibitorParticipations.ts POST /:id/payment.
      api.post<{ booking: StallBooking; payment: Payment; order: PaymentOrder | null; alreadyPaid?: boolean }>(
        `/api/exhibitor/participations/${id}/payment`
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["participations"] }),
  });
}

/** All stall payments across every participation this exhibitor business owns — the exhibitor-scoped equivalent of the organizer "Sales" data (see server/src/routes/exhibitorParticipations.ts GET /payments). */
export function useMyStallPayments() {
  return useQuery({
    queryKey: ["participations", "payments", "mine"],
    queryFn: () => api.get<{ bookings: StallBooking[] }>("/api/exhibitor/participations/payments").then((r) => r.bookings),
  });
}

export function usePaymentHistory(participationId: string | undefined) {
  return useQuery({
    queryKey: ["participations", participationId, "payments"],
    queryFn: () =>
      api.get<{ bookings: StallBooking[] }>(`/api/exhibitor/participations/${participationId}/payments`).then((r) => r.bookings),
    enabled: !!participationId,
  });
}
