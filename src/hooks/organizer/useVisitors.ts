import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { TicketBooking } from "@/types/exhibitor";

// Phase 21C (P1-1 fix): the organizer "Visitors" page was a stub despite
// visitor data already being real, correctly organizer-scoped, and
// available — GET /api/bookings/tickets (server/src/routes/bookings.ts) is
// already gated by organizerIdsWithPermission(user, "booking:view") and
// already backs the organizer's Tickets/Sales pages. Reusing it here is the
// smallest correctly-scoped solution — no new backend endpoint was needed.
export function useOrganizerVisitors(exhibitionId?: string) {
  return useQuery({
    queryKey: ["organizer-visitors", exhibitionId ?? "all"],
    queryFn: () =>
      api
        .get<{ bookings: TicketBooking[] }>(`/api/bookings/tickets${exhibitionId ? `?exhibitionId=${exhibitionId}` : ""}`)
        .then((r) => r.bookings),
  });
}
