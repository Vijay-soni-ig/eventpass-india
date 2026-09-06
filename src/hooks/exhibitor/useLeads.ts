import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getToken } from "@/lib/apiClient";

export type LeadStatus = "new" | "contacted" | "interested" | "negotiation" | "converted" | "lost";
export type LeadPriority = "low" | "medium" | "high";
export type LeadSource = "qr_scan" | "manual";

export interface Lead {
  id: string;
  exhibitionExhibitorId: string;
  ticketBookingId: string | null;
  visitorName: string | null;
  visitorEmail: string | null;
  visitorPhone: string | null;
  source: LeadSource;
  capturedByUserId: string | null;
  assignedToUserId: string | null;
  status: LeadStatus;
  priority: LeadPriority;
  notes: string | null;
  followUpDate: string | null;
  capturedAt: string;
  createdAt: string;
  updatedAt: string;
  exhibitionExhibitor: {
    id: string;
    exhibition: { id: string; name: string; city: string | null };
    business: { id: string; companyName: string | null };
  };
  ticketBooking: { id: string; attendeeName: string | null; attendeeEmail: string | null; attendeePhone: string | null } | null;
  capturedByUser: { id: string; fullName: string | null; email: string } | null;
  assignedToUser: { id: string; fullName: string | null; email: string } | null;
}

export interface LeadFilters {
  search?: string;
  status?: LeadStatus;
  priority?: LeadPriority;
  exhibitionId?: string;
  assignedToUserId?: string;
}

function toQueryString(filters: LeadFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useLeads(filters: LeadFilters = {}) {
  return useQuery({
    queryKey: ["leads", filters],
    queryFn: () => api.get<{ leads: Lead[] }>(`/api/leads${toQueryString(filters)}`).then((r) => r.leads),
  });
}

export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: ["leads", "detail", id],
    queryFn: () => api.get<{ lead: Lead }>(`/api/leads/${id}`).then((r) => r.lead),
    enabled: !!id,
  });
}

export function useCaptureLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      exhibitionExhibitorId: string;
      ticketBookingId?: string;
      visitorName?: string;
      visitorEmail?: string;
      visitorPhone?: string;
      source?: LeadSource;
      notes?: string;
      priority?: LeadPriority;
    }) => api.post<{ lead: Lead }>("/api/leads", data).then((r) => r.lead),
    // Phase 21E: also invalidate lead analytics — capturing a lead changes
    // totalLeads/conversionRate/etc, and without this a component that stays
    // mounted across both the capture action and a later analytics read
    // (e.g. the same page holding both) would show stale numbers.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["exhibitor-lead-analytics"] });
    },
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      status?: LeadStatus;
      priority?: LeadPriority;
      notes?: string | null;
      followUpDate?: string | null;
      assignedToUserId?: string | null;
    }) => api.patch<{ lead: Lead }>(`/api/leads/${id}`, data).then((r) => r.lead),
    // Phase 21E: a status change (e.g. -> converted/lost) changes analytics
    // too — same reasoning as useCaptureLead above.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["exhibitor-lead-analytics"] });
    },
  });
}

export interface ExhibitorLeadAnalytics {
  totalLeads: number;
  newLeads: number;
  contactedLeads: number;
  convertedLeads: number;
  lostLeads: number;
  conversionRate: number;
  followUpsDue: number;
  visitorsInteractedWith: number;
}

export function useExhibitorLeadAnalytics() {
  return useQuery({
    queryKey: ["exhibitor-lead-analytics"],
    queryFn: () => api.get<ExhibitorLeadAnalytics>("/api/leads/analytics"),
  });
}

/** Triggers a browser download of the filtered lead list as CSV. */
export async function exportLeads(filters: LeadFilters = {}) {
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";
  const token = getToken();
  const res = await fetch(`${apiUrl}/api/leads/export${toQueryString(filters)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to export leads");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `leads-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
