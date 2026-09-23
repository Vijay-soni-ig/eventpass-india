import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export const PARTICIPANT_TYPES = ["PARTICIPANT", "SPEAKER", "SPONSOR", "VENDOR", "PARTNER", "STAFF"] as const;
export type ParticipantType = (typeof PARTICIPANT_TYPES)[number];

export interface EventParticipant {
  id: string;
  participantType: "SPEAKER" | "SPONSOR" | "VENDOR" | "PARTNER" | "STAFF" | "CUSTOM";
  customType?: string | null;
  name: string;
  title?: string | null;
  organization?: string | null;
  bio?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  photoUrl?: string | null;
  sortOrder: number;
  isPublic: boolean;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

const routeFor = (type: ParticipantType) => {
  switch (type) {
    case "PARTICIPANT": return "participants";
    case "SPEAKER": return "speakers";
    case "SPONSOR": return "sponsors";
    case "VENDOR": return "vendors";
    case "PARTNER": return "partners";
    case "STAFF": return "staff";
  }
};

const responseKeyFor = (type: ParticipantType) => {
  switch (type) {
    case "PARTICIPANT": return "participants";
    case "SPEAKER": return "speakers";
    case "SPONSOR": return "sponsors";
    case "VENDOR": return "vendors";
    case "PARTNER": return "partners";
    case "STAFF": return "staff";
  }
};

export type ParticipantStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type ParticipantSort = "sortOrder" | "name" | "organization" | "createdAt";

export interface EventModuleEnablement {
  id: string;
  moduleType: string;
  enabled: boolean;
  config?: Record<string, unknown> | null;
}

export function useEventModules(eventId: string | undefined) {
  return useQuery({
    queryKey: ["event-modules", eventId],
    queryFn: () => api.get<{ modules: EventModuleEnablement[] }>(`/api/events/${eventId}/modules`).then((r) => r.modules),
    enabled: !!eventId && enabled,
  });
}

export function useSetEventModule(eventId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ moduleType, enabled }: { moduleType: string; enabled: boolean }) =>
      api.put<{ module: EventModuleEnablement }>(`/api/events/${eventId}/modules/${moduleType}`, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["event-modules", eventId] }),
  });
}

export function useEventParticipants(
  eventId: string | undefined,
  type: ParticipantType,
  search: string,
  status?: ParticipantStatus,
  page = 1,
  sortBy: ParticipantSort = "sortOrder",
  sortDir: "asc" | "desc" = "asc",
  enabled = true,
) {
  return useQuery({
    queryKey: ["event-participants", eventId, type, search, status, page, sortBy, sortDir],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (status) params.set("status", status);
      params.set("page", String(page));
      params.set("limit", "25");
      params.set("sortBy", sortBy);
      params.set("sortDir", sortDir);
      const response = await api.get<Record<string, EventParticipant[]> & { total: number; page: number; pageSize: number }>(
        `/api/events/${eventId}/${routeFor(type)}?${params.toString()}`
      );
      return { items: response[responseKeyFor(type)] ?? [], total: response.total ?? 0, page: response.page ?? 1, pageSize: response.pageSize ?? 50 };
    },
    enabled: !!eventId,
  });
}

export interface ParticipantInput {
  name: string;
  title?: string;
  organization?: string;
  bio?: string;
  email?: string;
  phone?: string;
  website?: string;
  photoUrl?: string;
  sortOrder: number;
  isPublic: boolean;
}

export function useCreateEventParticipant(eventId: string | undefined, type: ParticipantType) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ParticipantInput) => api.post<{ [key: string]: EventParticipant }>(
      `/api/events/${eventId}/${routeFor(type)}`,
      type === "PARTICIPANT" ? { ...data, participantType: "CUSTOM", customType: "Participant" } : data
    ).then((r) => r[responseKeyFor(type).slice(0, -1)] ?? Object.values(r)[0]),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["event-participants", eventId] }),
  });
}

export function useUpdateEventParticipant(eventId: string | undefined, type: ParticipantType) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ParticipantInput> }) =>
      api.patch<{ [key: string]: EventParticipant }>(`/api/events/${eventId}/${routeFor(type)}/${id}`, data)
        .then((r) => Object.values(r)[0]),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["event-participants", eventId] }),
  });
}

export function useArchiveEventParticipant(eventId: string | undefined, type: ParticipantType) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/events/${eventId}/${routeFor(type)}/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["event-participants", eventId] }),
  });
}

export function useRestoreEventParticipant(eventId: string | undefined, type: ParticipantType) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/api/events/${eventId}/${routeFor(type)}/${id}/restore`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["event-participants", eventId] }),
  });
}
