import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export type EventType = "EXHIBITION" | "CONFERENCE" | "WORKSHOP" | "SEMINAR" | "CONCERT" | "FESTIVAL" | "SPORTS" | "COMMUNITY" | "OTHER";
export type EventStatus = "DRAFT" | "PUBLISHED" | "PAUSED" | "COMPLETED" | "CANCELLED";
export type EventModule =
  | "EXHIBITION" | "REGISTRATION" | "TICKETING" | "EXHIBITORS" | "STALL_BOOKING"
  | "FLOOR_PLAN" | "CHECK_IN" | "LEADS" | "SPEAKERS" | "SESSIONS" | "SPONSORS"
  | "PARTNERS" | "VENDORS" | "VOLUNTEERS" | "SEATING" | "PARTICIPANTS" | "ANALYTICS";

export interface EventRecord {
  id: string; title: string; description?: string | null; eventType: EventType; status: EventStatus;
  visibility: "public" | "private"; startDate?: string | null; endDate?: string | null; timezone?: string | null;
  venue?: string | null; city?: string | null; latitude?: number | null; longitude?: number | null;
  coverImageUrl?: string | null; refundPolicy?: string | null; terms?: string | null; archivedAt?: string | null;
  category?: { id: string; name: string; slug: string } | null;
  exhibition?: { id: string } | null;
  moduleEnablements?: Array<{ id: string; moduleType: string; enabled: boolean; config?: unknown }>;
}
export interface EventListResponse { events: EventRecord[]; total: number; page: number; pageSize: number; }
export interface CreateEventInput {
  eventType: Exclude<EventType, "EXHIBITION">; title: string; description?: string; categoryId?: string;
  status?: EventStatus; visibility?: "public" | "private"; startDate?: string; endDate?: string;
  timezone?: string; venue?: string; city?: string; latitude?: number | null; longitude?: number | null;
  coverImageUrl?: string; modules?: EventModule[];
}
export interface UpdateEventInput {
  title?: string; description?: string; category?: string; categoryId?: string | null; status?: EventStatus;
  visibility?: "public" | "private"; startDate?: string; endDate?: string; timezone?: string;
  venue?: string; city?: string; latitude?: number | null; longitude?: number | null;
  coverImageUrl?: string; refundPolicy?: string; terms?: string; slug?: string | null;
}

export function useEvents(params: Record<string, string | number | boolean | undefined> = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== "") query.set(key, String(value)); });
  return useQuery({
    queryKey: ["events", params],
    queryFn: () => api.get<EventListResponse>("/api/events" + (query.toString() ? "?" + query.toString() : "")),
  });
}

export function useEvent(id: string | undefined) {
  return useQuery({
    queryKey: ["event", id],
    queryFn: () => api.get<{ event: EventRecord }>("/api/events/" + id).then((r) => r.event),
    enabled: !!id,
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateEventInput) => api.post<{ event: EventRecord }>("/api/events", data).then((r) => r.event),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["events"] }),
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateEventInput }) =>
      api.patch<{ event: EventRecord }>("/api/events/" + id, data).then((r) => r.event),
    onSuccess: (event) => {
      queryClient.setQueryData(["event", event.id], event);
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
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
    onSuccess: (result) => {
      queryClient.setQueryData(["event", result.event.id], result.event);
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });
}


export function useEventModules(id: string | undefined) {
  return useQuery({
    queryKey: ["event-modules", id],
    queryFn: () => api.get<{ modules: Array<{ id: string; moduleType: EventModule; enabled: boolean; config?: unknown }> }>(`/api/events/${id}/modules`).then((r) => r.modules),
    enabled: !!id,
  });
}

export function useSetEventModule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, moduleType, enabled }: { eventId: string; moduleType: EventModule; enabled: boolean }) =>
      api.put<{ module: { id: string; moduleType: EventModule; enabled: boolean; config?: unknown } }>(`/api/events/${eventId}/modules/${moduleType}`, { enabled }).then((r) => r.module),
    onSuccess: (module) => {
      queryClient.invalidateQueries({ queryKey: ["event-modules", module.eventId] });
      queryClient.invalidateQueries({ queryKey: ["event", module.eventId] });
    },
  });
}
