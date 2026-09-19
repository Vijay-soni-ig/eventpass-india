import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export type EventType = "EXHIBITION" | "CONFERENCE" | "WORKSHOP" | "SEMINAR" | "CONCERT" | "FESTIVAL" | "SPORTS" | "COMMUNITY" | "OTHER";
export type EventStatus = "DRAFT" | "PUBLISHED" | "PAUSED" | "COMPLETED" | "CANCELLED";

export interface EventRecord {
  id: string; title: string; description?: string | null; eventType: EventType; status: EventStatus;
  visibility: "public" | "private"; startDate?: string | null; endDate?: string | null; timezone?: string | null;
  venue?: string | null; city?: string | null; coverImageUrl?: string | null; archivedAt?: string | null;
  category?: { id: string; name: string; slug: string } | null;
  exhibition?: { id: string } | null;
  moduleEnablements?: Array<{ id: string; moduleType: string; enabled: boolean }>;
}
export interface EventListResponse { events: EventRecord[]; total: number; page: number; pageSize: number; }
export interface CreateEventInput {
  eventType: Exclude<EventType, "EXHIBITION">; title: string; description?: string; category?: string;
  status?: EventStatus; visibility?: "public" | "private"; startDate?: string; endDate?: string;
  timezone?: string; venue?: string; city?: string; coverImageUrl?: string; modules?: string[];
}

export function useEvents(params: Record<string, string | number | boolean | undefined> = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== "") query.set(key, String(value)); });
  return useQuery({
    queryKey: ["events", params],
    queryFn: () => api.get<EventListResponse>("/api/events" + (query.toString() ? "?" + query.toString() : "")),
  });
}
export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateEventInput) => api.post<{ event: EventRecord }>("/api/events", data).then((r) => r.event),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["events"] }),
  });
}
export function useArchiveEvent() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api.delete("/api/events/" + id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["events"] }) });
}
export function useRestoreEvent() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api.post("/api/events/" + id + "/restore"), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["events"] }) });
}

export function usePublishEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<{ event: EventRecord }>(`/api/events/${id}/publish`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["events"] }),
  });
}
