import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export interface DashboardWidget {
  id: string;
  dashboardId: string;
  widgetType: string;
  x: number;
  y: number;
  width: number;
  height: number;
  configuration: Record<string, unknown> | null;
  isVisible: boolean;
  archivedAt: string | null;
}

export interface Dashboard {
  id: string;
  ownerType: "PLATFORM" | "ORGANIZER" | "EXHIBITOR";
  ownerId: string | null;
  name: string;
  isDefault: boolean;
  version: number;
  archivedAt: string | null;
  widgets: DashboardWidget[];
}

export interface DashboardDataFilters {
  from?: string;
  to?: string;
  eventId?: string;
  ticketTypeId?: string;
  exhibitorBusinessId?: string;
  venueId?: string;
}

export interface DashboardMetric {
  value: number;
  unit: "COUNT" | "PERCENT" | "CURRENCY";
  numerator?: number;
  denominator?: number;
}

export interface ResolvedDashboardWidget {
  widgetId: string;
  visualization: "KPI" | "PROGRESS" | "TREND" | "BREAKDOWN" | "FUNNEL";
  status: "READY" | "EMPTY" | "NO_DATA";
  metrics: Record<string, DashboardMetric>;
  series?: Array<{ date: string; values: Record<string, number> }>;
}

export interface DashboardDataResponse {
  dashboardId: string;
  version: number;
  generatedAt: string;
  filters: {
    from: string;
    to: string;
    eventId?: string;
    ticketTypeId?: string;
    exhibitorBusinessId?: string;
    venueId?: string;
  };
  widgets: ResolvedDashboardWidget[];
}

export function useDashboards(ownerType: "ORGANIZER" | "EXHIBITOR", ownerId?: string) {
  return useQuery({
    queryKey: ["dashboards", ownerType, ownerId],
    queryFn: async () => (await api.get<{ dashboards: Dashboard[] }>(`/api/dashboards?ownerType=${ownerType}${ownerId ? `&ownerId=${encodeURIComponent(ownerId)}` : ""}`)).dashboards,
    enabled: !!ownerId,
  });
}

export function useDashboardData(dashboardId: string | undefined, filters: DashboardDataFilters) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);

  return useQuery({
    queryKey: ["dashboard-data", dashboardId, filters],
    queryFn: () => api.get<DashboardDataResponse>(`/api/dashboards/${dashboardId}/data?${query.toString()}`),
    enabled: !!dashboardId,
    refetchInterval: 60_000,
  });
}

export function useCreateDashboard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      ownerType: "ORGANIZER" | "EXHIBITOR";
      ownerId: string;
      name: string;
      isDefault?: boolean;
      widgets?: Array<{ widgetType: string; x?: number; y?: number; width?: number; height?: number; isVisible?: boolean }>;
    }) => api.post<{ dashboard: Dashboard }>("/api/dashboards", input).then((response) => response.dashboard),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboards"] }),
  });
}

export function useUpdateDashboard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; version: number; name?: string; isDefault?: boolean }) =>
      api.put<Dashboard>(`/api/dashboards/${id}`, input),
    onSuccess: (dashboard) => {
      queryClient.invalidateQueries({ queryKey: ["dashboards"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-data", dashboard.id] });
    },
  });
}

export function useAddDashboardWidget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ dashboardId, ...input }: { dashboardId: string; widgetType: string; x?: number; y?: number; width?: number; height?: number; isVisible?: boolean }) =>
      api.post<DashboardWidget>(`/api/dashboards/${dashboardId}/widgets`, input),
    onSuccess: (_widget, variables) => {
      queryClient.invalidateQueries({ queryKey: ["dashboards"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-data", variables.dashboardId] });
    },
  });
}

export function useUpdateDashboardWidget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ dashboardId, widgetId, ...input }: { dashboardId: string; widgetId: string; version: number; x?: number; y?: number; width?: number; height?: number; isVisible?: boolean }) =>
      api.put<DashboardWidget>(`/api/dashboards/${dashboardId}/widgets/${widgetId}`, input),
    onSuccess: (_widget, variables) => {
      queryClient.invalidateQueries({ queryKey: ["dashboards"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-data", variables.dashboardId] });
    },
  });
}

export function useDeleteDashboardWidget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ dashboardId, widgetId }: { dashboardId: string; widgetId: string; version: number }) =>
      api.delete<void>(`/api/dashboards/${dashboardId}/widgets/${widgetId}`),
    onSuccess: (_value, variables) => {
      queryClient.invalidateQueries({ queryKey: ["dashboards"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-data", variables.dashboardId] });
    },
  });
}
