import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { UniversalEventDetail, UniversalEventListResponse, UniversalEventParticipant } from "@/types/event";

export interface PublicEventCategory { id: string; name: string; slug: string; description: string | null; parentCategoryId: string | null; }

export interface PublicEventParams {
  q?: string; eventType?: string; categoryId?: string; city?: string; dateFrom?: string; dateTo?: string;
  sort?: "soonest" | "newest" | "title"; page?: number; limit?: number;
}
export interface PublicEventTicketType {
  id: string; name: string; description: string | null; price: number | string; currency: string;
  capacity: number; maxPerOrder: number; maxPerAttendee: number; saleStartsAt: string | null;
  saleEndsAt: string | null; sortOrder: number; remaining: number; soldOut: boolean;
}
export interface PublicEventTicketsResponse {
  event: Pick<UniversalEventDetail, "id" | "title" | "startDate" | "endDate" | "timezone" | "venue" | "city" | "coverImageUrl">;
  ticketTypes: PublicEventTicketType[];
}
function queryString(params: PublicEventParams) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== "") q.set(key, String(value)); });
  return q.toString();
}
export function usePublicEventCategories() {
  return useQuery({
    queryKey: ["public-event-categories"],
    queryFn: () => api.get<{ categories: PublicEventCategory[] }>("/api/public/event-categories"),
    staleTime: 5 * 60 * 1000,
  });
}
export function usePublicEvents(params: PublicEventParams = {}) {
  return useQuery({
    queryKey: ["public-events", params],
    queryFn: () => api.get<UniversalEventListResponse>(`/api/public/events?${queryString(params)}`),
    retry: 1,
  });
}
export function usePublicEvent(id: string | undefined) {
  return useQuery({
    queryKey: ["public-event", id],
    queryFn: () => api.get<{ event: UniversalEventDetail; linkedExhibitionId: string | null }>(`/api/public/events/${id}`),
    enabled: Boolean(id),
    retry: false,
  });
}
export function usePublicEventTickets(id: string | undefined, enabled = false) {
  return useQuery({
    queryKey: ["public-event-tickets", id],
    queryFn: () => api.get<PublicEventTicketsResponse>(`/api/public/events/${id}/tickets`),
    enabled: Boolean(id) && enabled,
    staleTime: 30 * 1000,
    retry: 1,
  });
}
export function usePublicEventParticipants(id: string | undefined, enabled = false) {
  return useQuery({
    queryKey: ["public-event-participants", id],
    queryFn: () => api.get<{ participants: UniversalEventParticipant[] }>(`/api/public/events/${id}/participants`),
    enabled: Boolean(id) && enabled,
    retry: 1,
  });
}
