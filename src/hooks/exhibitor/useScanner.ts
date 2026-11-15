import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { ScannerTicketBooking, ScannerCheckInReceipt } from "@/types/exhibitor";

// Exhibitor-scoped mirror of hooks/exhibitor/useBookings.ts's
// useLookupBooking/useCheckInBooking — calls the new /api/exhibitor/scanner
// endpoints (scoped to exhibitions the caller's exhibitor business is
// CONFIRMED to participate in), never the organizer-scoped /api/bookings
// ones. See server/src/routes/exhibitorScanner.ts.

export function useLookupTicket() {
  return useMutation({
    mutationFn: (qrCode: string) =>
      api.get<{ booking: ScannerTicketBooking }>(`/api/exhibitor/scanner/lookup/${encodeURIComponent(qrCode)}`).then((r) => r.booking),
  });
}

export interface ExhibitorCheckInResponse {
  booking: ScannerTicketBooking;
  checkIn: ScannerCheckInReceipt;
  wasOverride: boolean;
}

export function useCheckInTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, force }: { bookingId: string; force?: boolean }) =>
      api.patch<ExhibitorCheckInResponse>(`/api/exhibitor/scanner/tickets/${bookingId}/check-in`, force ? { force } : undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["participations"] }),
  });
}
