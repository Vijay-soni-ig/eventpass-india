import { useQuery } from "@tanstack/react-query";
import { api, getToken } from "@/lib/apiClient";
import type { Lead, LeadStatus, LeadPriority } from "@/hooks/exhibitor/useLeads";

export type { Lead, LeadStatus, LeadPriority };

export interface OrganizerLeadFilters {
  search?: string;
  status?: LeadStatus;
  priority?: LeadPriority;
  exhibitionId?: string;
  exhibitorBusinessId?: string;
}

function toQueryString(filters: OrganizerLeadFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Organizer-scoped mirror of hooks/exhibitor/useLeads.ts — calls /api/organizer/leads (see server/src/routes/organizerLeads.ts), never the exhibitor-only /api/leads. */
export function useOrganizerLeads(filters: OrganizerLeadFilters = {}) {
  return useQuery({
    queryKey: ["organizer-leads", filters],
    queryFn: () => api.get<{ leads: Lead[] }>(`/api/organizer/leads${toQueryString(filters)}`).then((r) => r.leads),
  });
}

export function useOrganizerLead(id: string | undefined) {
  return useQuery({
    queryKey: ["organizer-leads", "detail", id],
    queryFn: () => api.get<{ lead: Lead }>(`/api/organizer/leads/${id}`).then((r) => r.lead),
    enabled: !!id,
  });
}

/** Triggers a browser download of the filtered lead list as CSV, scoped to the organizer's own tenant. */
export async function exportOrganizerLeads(filters: OrganizerLeadFilters = {}) {
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";
  const token = getToken();
  const res = await fetch(`${apiUrl}/api/organizer/leads/export${toQueryString(filters)}`, {
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
