import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getToken, getActiveExhibitorBusinessId } from "@/lib/apiClient";

export type EventLeadStatus = "NEW" | "CONTACTED" | "INTERESTED" | "QUALIFIED" | "NEGOTIATION" | "CONVERTED" | "LOST" | "ARCHIVED";
export type EventLeadPriority = "LOW" | "MEDIUM" | "HIGH";
export type EventLeadInteractionType = "NOTE" | "CALL" | "EMAIL" | "WHATSAPP" | "MEETING" | "OTHER";

export interface EventLead {
  id: string;
  eventId: string;
  exhibitorBusinessId: string | null;
  visitorName: string;
  visitorEmail: string | null;
  visitorPhone: string | null;
  companyName: string | null;
  source: string;
  status: EventLeadStatus;
  priority: EventLeadPriority;
  notes: string | null;
  assignedToUserId: string | null;
  capturedByUserId: string | null;
  createdAt: string;
  archivedAt: string | null;
  event: { id: string; title: string; organizerId: string; eventType: string };
  exhibitorBusiness: { id: string; companyName: string | null } | null;
  exhibitionExhibitor: { id: string; exhibitionId: string; status: string; business: { id: string; companyName: string | null } } | null;
  stall: { id: string; code: string; status: string } | null;
  assignedToUser: { id: string; fullName: string | null; email: string } | null;
  capturedByUser: { id: string; fullName: string | null; email: string } | null;
  interactions: { id: string; type: EventLeadInteractionType; note: string; createdAt: string; createdByUser: { id: string; fullName: string | null; email: string } }[];
  followUps: { id: string; dueAt: string; status: "OPEN" | "COMPLETED" | "CANCELLED"; note: string | null; assignedToUser: { id: string; fullName: string | null; email: string } }[];
}

export interface EventLeadAnalytics {
  totalLeads: number;
  newLeads: number;
  contactedLeads: number;
  convertedLeads: number;
  lostLeads: number;
  conversionRate: number;
  followUpsDue: number;
  visitorsInteractedWith: number;
}

export function useEventLeads(filters: Record<string, string | undefined> = {}, page = 1, pageSize = 25) {
  const params = new URLSearchParams();
  const businessId = getActiveExhibitorBusinessId();
  Object.entries({ ...filters, exhibitorBusinessId: businessId ?? undefined, page: String(page), pageSize: String(pageSize) }).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return useQuery({
    queryKey: ["event-leads", "list", businessId ?? "all-authorized", filters, page, pageSize],
    queryFn: () => api.get<{ leads: EventLead[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }>(`/api/event-leads?${params.toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function useEventLead(id?: string) {
  const businessId = getActiveExhibitorBusinessId();
  return useQuery({
    queryKey: ["event-leads", "detail", id, businessId],
    queryFn: () => api.get<{ lead: EventLead }>(`/api/event-leads/${id}${businessId ? `?exhibitorBusinessId=${encodeURIComponent(businessId)}` : ""}`).then((r) => r.lead),
    enabled: Boolean(id),
  });
}

export function useEventLeadAnalytics() {
  const businessId = getActiveExhibitorBusinessId();
  return useQuery({
    queryKey: ["event-leads", "analytics", businessId],
    queryFn: () => api.get<EventLeadAnalytics>("/api/event-leads/analytics" + (businessId ? "?exhibitorBusinessId=" + encodeURIComponent(businessId) : "")),
  });
}

export function useUpdateEventLead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; status?: EventLeadStatus; priority?: EventLeadPriority; notes?: string | null; assignedToUserId?: string | null; companyName?: string | null }) =>
      api.patch<{ lead: EventLead }>(`/api/event-leads/${id}`, data).then((r) => r.lead),
    onSuccess: (_data, variables) => {
      client.invalidateQueries({ queryKey: ["event-leads"] });
      client.invalidateQueries({ queryKey: ["exhibitor-lead-analytics"] });
      client.invalidateQueries({ queryKey: ["event-leads", "detail", variables.id] });
    },
  });
}

export function useAddEventLeadInteraction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, type, note }: { id: string; type: EventLeadInteractionType; note: string }) =>
      api.post(`/api/event-leads/${id}/interactions`, { type, note }),
    onSuccess: (_data, variables) => client.invalidateQueries({ queryKey: ["event-leads", "detail", variables.id] }),
  });
}

export function useAddEventLeadFollowUp() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, assignedToUserId, dueAt, note }: { id: string; assignedToUserId: string; dueAt: string; note?: string }) =>
      api.post(`/api/event-leads/${id}/follow-ups`, { assignedToUserId, dueAt, note }),
    onSuccess: (_data, variables) => {
      client.invalidateQueries({ queryKey: ["event-leads", "detail", variables.id] });
      client.invalidateQueries({ queryKey: ["event-leads", "analytics"] });
    },
  });
}

export function useUpdateEventLeadFollowUp() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, followUpId, status, note, dueAt, assignedToUserId }: { id: string; followUpId: string; status?: "OPEN" | "COMPLETED" | "CANCELLED"; note?: string | null; dueAt?: string; assignedToUserId?: string }) =>
      api.patch(`/api/event-leads/${id}/follow-ups/${followUpId}`, { status, note }),
    onSuccess: (_data, variables) => {
      client.invalidateQueries({ queryKey: ["event-leads", "detail", variables.id] });
      client.invalidateQueries({ queryKey: ["event-leads", "analytics"] });
    },
  });
}

export async function exportEventLeads(filters: { search?: string; status?: string; priority?: string } = {}) {
  const params = new URLSearchParams();
  const businessId = getActiveExhibitorBusinessId();
  Object.entries({ ...filters, exhibitorBusinessId: businessId ?? undefined }).forEach(([key, value]) => { if (value) params.set(key, value); });
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";
  const token = getToken();
  const response = await fetch(`${apiUrl}/api/event-leads/export?${params.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Failed to export event leads");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `event-leads-${Date.now()}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function useArchiveEventLead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/event-leads/${id}`),
    onSuccess: (_data, id) => {
      client.invalidateQueries({ queryKey: ["event-leads"] });
      client.invalidateQueries({ queryKey: ["event-leads", "detail", id] });
      client.invalidateQueries({ queryKey: ["event-leads", "analytics"] });
    },
  });
}
