import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { TicketPayload } from "@/lib/eventTicketForm";

export type EventTicketStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

/** A ticket type as the organizer sees it, with live inventory. `price` is a decimal string from the API. */
export interface OrganizerEventTicket {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  price: string;
  currency: string;
  capacity: number;
  maxPerOrder: number;
  maxPerAttendee: number | null;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  status: EventTicketStatus;
  sortOrder: number;
  sold: number;
  reserved: number;
  remaining: number;
}

const ticketsKey = (eventId: string | undefined) => ["event-tickets", "organizer", eventId];

export function useEventTicketTypes(eventId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ticketsKey(eventId),
    queryFn: () => api.get<{ tickets: OrganizerEventTicket[] }>("/api/event-tickets?eventId=" + eventId).then((r) => r.tickets),
    enabled: !!eventId && enabled,
    retry: false,
  });
}

export function useCreateEventTicketType(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: TicketPayload & { currency?: string }) =>
      api.post<{ ticket: OrganizerEventTicket }>("/api/event-tickets", { eventId, ...data }).then((r) => r.ticket),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ticketsKey(eventId) }),
  });
}

export function useUpdateEventTicketType(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TicketPayload> }) =>
      api.patch<{ ticket: OrganizerEventTicket }>("/api/event-tickets/" + id, data).then((r) => r.ticket),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ticketsKey(eventId) }),
  });
}

export function useArchiveEventTicketType(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ticket: OrganizerEventTicket }>("/api/event-tickets/" + id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ticketsKey(eventId) }),
  });
}
