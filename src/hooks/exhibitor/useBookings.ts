import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { StallBooking, TicketBooking } from "@/types/exhibitor";
import type { Payment, PaymentOrder } from "@/hooks/usePayments";

export function useTicketBookings(exhibitionId?: string) {
  return useQuery({
    queryKey: ["ticket-bookings", exhibitionId ?? "all"],
    queryFn: () =>
      api
        .get<{ bookings: TicketBooking[] }>(`/api/bookings/tickets${exhibitionId ? `?exhibitionId=${exhibitionId}` : ""}`)
        .then((r) => r.bookings),
  });
}

export function useStallBookings(exhibitionId?: string) {
  return useQuery({
    queryKey: ["stall-bookings", exhibitionId ?? "all"],
    queryFn: () =>
      api
        .get<{ bookings: StallBooking[] }>(`/api/bookings/stalls${exhibitionId ? `?exhibitionId=${exhibitionId}` : ""}`)
        .then((r) => r.bookings),
  });
}

export function useMyTicketBookings() {
  return useQuery({
    queryKey: ["ticket-bookings", "mine"],
    queryFn: () => api.get<{ bookings: TicketBooking[] }>("/api/bookings/tickets/mine").then((r) => r.bookings),
  });
}

export function useLookupBooking() {
  return useMutation({
    mutationFn: (qrCode: string) =>
      api.get<{ booking: TicketBooking }>(`/api/bookings/tickets/lookup/${encodeURIComponent(qrCode)}`).then((r) => r.booking),
  });
}

export function useCheckInBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) =>
      api.patch<{ booking: TicketBooking }>(`/api/bookings/tickets/${bookingId}/check-in`).then((r) => r.booking),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ticket-bookings"] }),
  });
}

export function useCreateTicketBooking() {
  return useMutation({
    mutationFn: (data: {
      exhibitionId: string;
      ticketTypeId: string;
      attendeeName: string;
      attendeeEmail: string;
      attendeePhone?: string;
      quantity: number;
      visitDate?: string;
    }) =>
      api.post<{ booking: TicketBooking; payment: Payment; order: PaymentOrder }>("/api/bookings/tickets", data),
  });
}

// There is no useCreateStallBooking here anymore — stall bookings are only
// created through the exhibitor participation workflow
// (see hooks/exhibitor/useParticipations.ts: useSelectStall + useInitiatePayment),
// which requires an approved application first. The old direct
// POST /api/bookings/stalls endpoint was removed for the same reason.
