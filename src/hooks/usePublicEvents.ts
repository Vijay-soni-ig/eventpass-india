import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { UniversalEventDetail, UniversalEventListResponse } from "@/types/event";

export interface PublicEventParams {
  q?: string; eventType?: string; categoryId?: string; city?: string; dateFrom?: string; dateTo?: string;
  sort?: "soonest" | "newest" | "title"; page?: number; limit?: number;
}
function queryString(params: PublicEventParams) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== "") q.set(key, String(value)); });
  return q.toString();
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
    retry: 1,
  });
}
