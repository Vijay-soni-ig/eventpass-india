import type { EventModule } from "@prisma/client";
import type { Permission } from "./permissions";

import {
  DASHBOARD_METRICS,
  type DashboardMetricDefinition,
  type DashboardMetricId,
  type DashboardMetricScope,
} from "./dashboardMetricRegistry";

export type DashboardWidgetId =
  | "ORGANIZER_EVENT_KPI"
  | "ORGANIZER_REVENUE_KPI"
  | "ORGANIZER_ATTENDANCE_KPI"
  | "ORGANIZER_STALL_OCCUPANCY"
  | "ORGANIZER_LEAD_CONVERSION"
  | "EVENT_REGISTRATION_KPI"
  | "EVENT_TICKET_REVENUE_KPI"
  | "EVENT_CHECKIN_RATE"
  | "EVENT_TICKET_REVENUE_TREND"
  | "EVENT_REGISTRATION_TREND"
  | "EXHIBITOR_LEAD_KPI"
  | "EXHIBITOR_CONVERSION_KPI"
  | "EXHIBITOR_FOLLOWUP_KPI";

export type DashboardWidgetVisualization = "KPI" | "PROGRESS" | "TREND" | "BREAKDOWN" | "FUNNEL";
export type DashboardWidgetRole = "PLATFORM_ADMIN" | "ORGANIZER" | "EXHIBITOR";
export type DashboardWidgetFilter = "dateRange" | "event" | "ticketType" | "exhibitor" | "venue";
export type DashboardWidgetDimension = "event" | "ticketType" | "exhibitor" | "venue" | "date";

export interface DashboardWidgetDefinition {
  id: DashboardWidgetId;
  label: string;
  description: string;
  scope: DashboardMetricScope;
  visualization: DashboardWidgetVisualization;
  metricIds: readonly DashboardMetricId[];
  roles: readonly DashboardWidgetRole[];
  requiredPermissions: readonly Permission[];
  requiredModule?: EventModule;
  supportedFilters: readonly DashboardWidgetFilter[];
  supportedDimensions: readonly DashboardWidgetDimension[];
  defaultLayout: { width: number; height: number; minWidth: number; minHeight: number };
}

const widget = (definition: DashboardWidgetDefinition): DashboardWidgetDefinition => definition;

export const DASHBOARD_WIDGETS = {
  ORGANIZER_EVENT_KPI: widget({
    id: "ORGANIZER_EVENT_KPI", label: "Events", description: "Organizer event count KPI.", scope: "ORGANIZER", visualization: "KPI",
    metricIds: ["ORGANIZER_EVENT_COUNT"], roles: ["ORGANIZER"], requiredPermissions: ["event:view"],
    supportedFilters: ["dateRange"], supportedDimensions: [], defaultLayout: { width: 3, height: 2, minWidth: 2, minHeight: 2 },
  }),
  ORGANIZER_REVENUE_KPI: widget({
    id: "ORGANIZER_REVENUE_KPI", label: "Gross revenue", description: "Organizer gross ticket plus stall revenue KPI.", scope: "ORGANIZER", visualization: "KPI",
    metricIds: ["ORGANIZER_REVENUE_GROSS"], roles: ["ORGANIZER"], requiredPermissions: ["payment:view"],
    supportedFilters: ["dateRange", "event"], supportedDimensions: [], defaultLayout: { width: 3, height: 2, minWidth: 2, minHeight: 2 },
  }),
  ORGANIZER_ATTENDANCE_KPI: widget({
    id: "ORGANIZER_ATTENDANCE_KPI", label: "Attendance rate", description: "Organizer attendance rate KPI.", scope: "ORGANIZER", visualization: "PROGRESS",
    metricIds: ["ORGANIZER_ATTENDANCE_RATE"], roles: ["ORGANIZER"], requiredPermissions: ["registration:view"],
    supportedFilters: ["dateRange", "event"], supportedDimensions: [], defaultLayout: { width: 3, height: 2, minWidth: 2, minHeight: 2 },
  }),
  ORGANIZER_STALL_OCCUPANCY: widget({
    id: "ORGANIZER_STALL_OCCUPANCY", label: "Stall occupancy", description: "Organizer stall occupancy progress widget.", scope: "ORGANIZER", visualization: "PROGRESS",
    metricIds: ["ORGANIZER_STALL_OCCUPANCY"], roles: ["ORGANIZER"], requiredPermissions: ["stall:manage"],
    supportedFilters: ["dateRange", "event", "venue"], supportedDimensions: ["event", "venue"], defaultLayout: { width: 4, height: 3, minWidth: 3, minHeight: 2 },
  }),
  ORGANIZER_LEAD_CONVERSION: widget({
    id: "ORGANIZER_LEAD_CONVERSION", label: "Lead conversion", description: "Organizer lead conversion progress widget.", scope: "ORGANIZER", visualization: "PROGRESS",
    metricIds: ["ORGANIZER_LEAD_CONVERSION_RATE"], roles: ["ORGANIZER"], requiredPermissions: ["lead:analytics"],
    supportedFilters: ["dateRange", "event", "exhibitor"], supportedDimensions: ["event", "exhibitor"], defaultLayout: { width: 4, height: 3, minWidth: 3, minHeight: 2 },
  }),
  EVENT_REGISTRATION_KPI: widget({
    id: "EVENT_REGISTRATION_KPI", label: "Registrations", description: "Event registration count KPI.", scope: "EVENT", visualization: "KPI",
    metricIds: ["EVENT_REGISTRATION_COUNT"], roles: ["ORGANIZER"], requiredPermissions: ["event:view"], requiredModule: "REGISTRATION",
    supportedFilters: ["dateRange", "event"], supportedDimensions: [], defaultLayout: { width: 3, height: 2, minWidth: 2, minHeight: 2 },
  }),
  EVENT_TICKET_REVENUE_KPI: widget({
    id: "EVENT_TICKET_REVENUE_KPI", label: "Net ticket revenue", description: "Event net ticket revenue KPI.", scope: "EVENT", visualization: "KPI",
    metricIds: ["EVENT_TICKET_REVENUE_NET"], roles: ["ORGANIZER"], requiredPermissions: ["payment:view"], requiredModule: "TICKETING",
    supportedFilters: ["dateRange", "event", "ticketType"], supportedDimensions: [], defaultLayout: { width: 3, height: 2, minWidth: 2, minHeight: 2 },
  }),
  EVENT_CHECKIN_RATE: widget({
    id: "EVENT_CHECKIN_RATE", label: "Check-in rate", description: "Event ticket check-in progress widget.", scope: "EVENT", visualization: "PROGRESS",
    metricIds: ["EVENT_CHECKIN_RATE"], roles: ["ORGANIZER"], requiredPermissions: ["event:view"], requiredModule: "CHECK_IN",
    supportedFilters: ["dateRange", "event"], supportedDimensions: [], defaultLayout: { width: 4, height: 3, minWidth: 3, minHeight: 2 },
  }),
  EVENT_TICKET_REVENUE_TREND: widget({
    id: "EVENT_TICKET_REVENUE_TREND", label: "Ticket revenue trend", description: "Event ticket revenue over time.", scope: "EVENT", visualization: "TREND",
    metricIds: ["EVENT_TICKET_REVENUE_GROSS", "EVENT_TICKET_REVENUE_REFUNDED", "EVENT_TICKET_REVENUE_NET"], roles: ["ORGANIZER"], requiredPermissions: ["payment:view"], requiredModule: "TICKETING",
    supportedFilters: ["dateRange", "event", "ticketType"], supportedDimensions: ["date"], defaultLayout: { width: 6, height: 4, minWidth: 4, minHeight: 3 },
  }),
  EVENT_REGISTRATION_TREND: widget({
    id: "EVENT_REGISTRATION_TREND", label: "Registration trend", description: "Event registrations over time.", scope: "EVENT", visualization: "TREND",
    metricIds: ["EVENT_REGISTRATION_COUNT", "EVENT_CONFIRMED_REGISTRATION_COUNT"], roles: ["ORGANIZER"], requiredPermissions: ["event:view"], requiredModule: "REGISTRATION",
    supportedFilters: ["dateRange", "event"], supportedDimensions: ["date"], defaultLayout: { width: 6, height: 4, minWidth: 4, minHeight: 3 },
  }),
  EXHIBITOR_LEAD_KPI: widget({
    id: "EXHIBITOR_LEAD_KPI", label: "Leads", description: "Exhibitor lead count KPI.", scope: "EXHIBITOR", visualization: "KPI",
    metricIds: ["EXHIBITOR_LEAD_COUNT"], roles: ["EXHIBITOR"], requiredPermissions: ["lead:view"],
    supportedFilters: ["dateRange", "event"], supportedDimensions: [], defaultLayout: { width: 3, height: 2, minWidth: 2, minHeight: 2 },
  }),
  EXHIBITOR_CONVERSION_KPI: widget({
    id: "EXHIBITOR_CONVERSION_KPI", label: "Lead conversion", description: "Exhibitor lead conversion progress widget.", scope: "EXHIBITOR", visualization: "PROGRESS",
    metricIds: ["EXHIBITOR_LEAD_CONVERSION_RATE"], roles: ["EXHIBITOR"], requiredPermissions: ["lead:view"],
    supportedFilters: ["dateRange", "event"], supportedDimensions: [], defaultLayout: { width: 4, height: 3, minWidth: 3, minHeight: 2 },
  }),
  EXHIBITOR_FOLLOWUP_KPI: widget({
    id: "EXHIBITOR_FOLLOWUP_KPI", label: "Open follow-ups", description: "Exhibitor open follow-up count KPI.", scope: "EXHIBITOR", visualization: "KPI",
    metricIds: ["EXHIBITOR_OPEN_FOLLOWUP_COUNT"], roles: ["EXHIBITOR"], requiredPermissions: ["lead:view"],
    supportedFilters: ["dateRange", "event"], supportedDimensions: [], defaultLayout: { width: 3, height: 2, minWidth: 2, minHeight: 2 },
  }),
} as const satisfies Record<DashboardWidgetId, DashboardWidgetDefinition>;

export function getDashboardWidget(id: string): DashboardWidgetDefinition | undefined {
  return DASHBOARD_WIDGETS[id as DashboardWidgetId];
}

export function listDashboardWidgets(scope?: DashboardMetricScope): DashboardWidgetDefinition[] {
  return Object.values(DASHBOARD_WIDGETS).filter((definition) => !scope || definition.scope === scope);
}

export function validateDashboardWidgetRegistry(): void {
  const definitions = Object.values(DASHBOARD_WIDGETS);
  if (new Set(definitions.map((item) => item.id)).size !== definitions.length) throw new Error("Dashboard widget IDs must be unique");
  for (const definition of definitions) {
    if (!definition.metricIds.length) throw new Error(`Widget ${definition.id} must reference at least one metric`);
    if (definition.defaultLayout.width < definition.defaultLayout.minWidth || definition.defaultLayout.height < definition.defaultLayout.minHeight) {
      throw new Error(`Invalid default layout for ${definition.id}`);
    }
    if (definition.defaultLayout.width > 12 || definition.defaultLayout.minWidth > 12) throw new Error(`Widget ${definition.id} exceeds 12-column grid`);
    for (const metricId of definition.metricIds) {
      const metric: DashboardMetricDefinition | undefined = DASHBOARD_METRICS[metricId];
      if (!metric) throw new Error(`Widget ${definition.id} references unknown metric ${metricId}`);
      if (metric.scope !== definition.scope) throw new Error(`Widget ${definition.id} scope does not match metric ${metricId}`);
    }
  }
}
