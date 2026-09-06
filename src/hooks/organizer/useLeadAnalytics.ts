import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export interface LeadAnalytics {
  totalLeads: number;
  byStatus: Record<string, number>;
  byExhibitor: { exhibitorBusinessId: string; name: string; count: number; converted: number }[];
  byDay: { date: string; count: number }[];
  conversionRate: number;
}

export function useLeadAnalytics(exhibitionId?: string) {
  return useQuery({
    queryKey: ["lead-analytics", exhibitionId ?? "all"],
    queryFn: () =>
      api.get<LeadAnalytics>(`/api/organizer/leads/analytics${exhibitionId ? `?exhibitionId=${exhibitionId}` : ""}`),
  });
}
