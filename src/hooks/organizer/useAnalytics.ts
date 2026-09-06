import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export interface OrganizerDashboardMetrics {
  totalExhibitions: number;
  activeExhibitions: number;
  confirmedExhibitors: number;
  totalExhibitorsAllStatuses: number;
  totalStalls: number;
  occupiedStalls: number;
  totalVisitors: number;
  totalCheckIns: number;
  attendanceRate: number;
  ticketRevenue: number | null;
  stallRevenue: number | null;
  totalRevenue: number | null;
  totalLeads: number | null;
  convertedLeads: number | null;
  leadConversionRate: number | null;
}

export function useOrganizerDashboardMetrics(params: { exhibitionId?: string; from?: string; to?: string } = {}) {
  const query = new URLSearchParams();
  if (params.exhibitionId) query.set("exhibitionId", params.exhibitionId);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  const qs = query.toString();

  return useQuery({
    queryKey: ["organizer-dashboard-metrics", params],
    queryFn: () => api.get<OrganizerDashboardMetrics>(`/api/organizer/analytics/dashboard${qs ? `?${qs}` : ""}`),
  });
}

export interface ExhibitionAnalytics {
  visitorsOverTime: { date: string; count: number }[];
  checkInsOverTime: { date: string; count: number }[];
  peakEntryPeriods: { hour: number; count: number }[];
  ticketSales: { ticketTypeId: string; name: string; capacity: number; sold: number; revenue: number }[];
  revenue: { ticket: number | null; stall: number | null; total: number } | null;
  stallOccupancy: { total: number; sold: number; reserved: number; available: number };
  exhibitorsCount: number;
  leads: { total: number; byStatus: Record<string, number> } | null;
  leadsPerExhibitor: { exhibitionExhibitorId: string; name: string; leadCount: number }[] | null;
  topExhibitors: { exhibitionExhibitorId: string; name: string; leadCount: number }[] | null;
}

export function useExhibitionAnalytics(exhibitionId: string | undefined, params: { from?: string; to?: string } = {}) {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  const qs = query.toString();

  return useQuery({
    queryKey: ["exhibition-analytics", exhibitionId, params],
    queryFn: () => api.get<ExhibitionAnalytics>(`/api/organizer/analytics/exhibitions/${exhibitionId}${qs ? `?${qs}` : ""}`),
    enabled: !!exhibitionId,
  });
}
