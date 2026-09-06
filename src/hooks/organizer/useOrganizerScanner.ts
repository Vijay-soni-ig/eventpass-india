import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { TicketBooking, CheckIn } from "@/types/exhibitor";

// Organizer-scoped mirror of hooks/exhibitor/useScanner.ts — same shapes,
// same behavior, but calls the organizer-axis endpoints in
// server/src/routes/bookings.ts (scoped to exhibitions the caller's
// organizer membership has scanner:use for), never the exhibitor-scoped
// /api/exhibitor/scanner ones. This is what lets the shared Scanner
// component (src/pages/exhibitor/scanner/Scanner.tsx) serve an
// ORGANIZER_SCANNER user without merging the two tenant axes.

export function useLookupTicketOrganizer() {
  return useMutation({
    mutationFn: (qrCode: string) =>
      api.get<{ booking: TicketBooking }>(`/api/bookings/tickets/lookup/${encodeURIComponent(qrCode)}`).then((r) => r.booking),
  });
}

export interface OrganizerCheckInResponse {
  booking: TicketBooking;
  checkIn: CheckIn;
  wasOverride: boolean;
}

export function useCheckInTicketOrganizer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, force }: { bookingId: string; force?: boolean }) =>
      api.patch<OrganizerCheckInResponse>(`/api/bookings/tickets/${bookingId}/check-in`, force ? { force } : undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ticket-bookings"] }),
  });
}
