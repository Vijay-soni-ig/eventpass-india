import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { StallBooking, TicketBooking, CheckIn } from "@/types/exhibitor";
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

// UI-04 — single-ticket detail, buyer-scoped server-side (GET /tickets/:id
// filters by the authenticated buyerUserId, never a client-supplied id — see
// server/src/routes/bookings.ts). Lets a ticket-details page fetch real data
// on a cold load/refresh instead of only ever deriving it from the already-
// fetched "mine" list.
export function useTicketBooking(bookingId: string | undefined) {
  return useQuery({
    queryKey: ["ticket-bookings", "detail", bookingId],
    queryFn: () => api.get<{ booking: TicketBooking }>(`/api/bookings/tickets/${bookingId}`).then((r) => r.booking),
    enabled: !!bookingId,
    retry: false,
  });
}

export function useLookupBooking() {
  return useMutation({
    mutationFn: (qrCode: string) =>
      api.get<{ booking: TicketBooking }>(`/api/bookings/tickets/lookup/${encodeURIComponent(qrCode)}`).then((r) => r.booking),
  });
}

export interface CheckInResponse {
  booking: TicketBooking;
  checkIn: CheckIn;
  wasOverride: boolean;
}

export function useCheckInBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, force }: { bookingId: string; force?: boolean }) =>
      api.patch<CheckInResponse>(`/api/bookings/tickets/${bookingId}/check-in`, force ? { force } : undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ticket-bookings"] }),
  });
}

export function useTicketQr(bookingId: string | undefined) {
  return useQuery({
    queryKey: ["ticket-qr", bookingId],
    queryFn: () => api.get<{ qrCode: string; qrImage: string }>(`/api/bookings/tickets/${bookingId}/qr`),
    enabled: !!bookingId,
  });
}

export function useCreateTicketBooking() {
  return useMutation({
    mutationFn: ({
      idempotencyKey,
      ...data
    }: {
      exhibitionId: string;
      ticketTypeId: string;
      attendeeName: string;
      attendeeEmail: string;
      attendeePhone?: string;
      quantity: number;
      visitDate?: string;
      /** See src/lib/bookingIntent.ts — stable per booking-intent, so a page
       * refresh or retry of the SAME attempt reuses the same key instead of
       * creating a duplicate booking (Phase 21B, P1-1). */
      idempotencyKey?: string;
    }) =>
      api.post<{ booking: TicketBooking; payment: Payment; order: PaymentOrder | null; replayed?: boolean }>(
        "/api/bookings/tickets",
        data,
        idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined
      ),
  });
}

// There is no useCreateStallBooking here anymore — stall bookings are only
// created through the exhibitor participation workflow
// (see hooks/exhibitor/useParticipations.ts: useSelectStall + useInitiatePayment),
// which requires an approved application first. The old direct
// POST /api/bookings/stalls endpoint was removed for the same reason.
