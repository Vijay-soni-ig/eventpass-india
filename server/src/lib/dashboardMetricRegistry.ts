export type DashboardMetricScope = "PLATFORM" | "ORGANIZER" | "EVENT" | "EXHIBITOR";
export type DashboardMetricUnit = "COUNT" | "PERCENT" | "CURRENCY";

export type DashboardMetricId =
  | "ORGANIZER_EVENT_COUNT"
  | "ORGANIZER_ACTIVE_EVENT_COUNT"
  | "ORGANIZER_EXHIBITOR_COUNT"
  | "ORGANIZER_STALL_COUNT"
  | "ORGANIZER_STALL_OCCUPANCY"
  | "ORGANIZER_VISITOR_COUNT"
  | "ORGANIZER_CHECKIN_COUNT"
  | "ORGANIZER_ATTENDANCE_RATE"
  | "ORGANIZER_TICKET_REVENUE_GROSS"
  | "ORGANIZER_STALL_REVENUE_GROSS"
  | "ORGANIZER_REVENUE_GROSS"
  | "ORGANIZER_LEAD_COUNT"
  | "ORGANIZER_LEAD_CONVERSION_RATE"
  | "EVENT_REGISTRATION_COUNT"
  | "EVENT_CONFIRMED_REGISTRATION_COUNT"
  | "EVENT_TICKET_COUNT"
  | "EVENT_CHECKIN_COUNT"
  | "EVENT_CHECKIN_RATE"
  | "EVENT_TICKET_REVENUE_GROSS"
  | "EVENT_TICKET_REVENUE_REFUNDED"
  | "EVENT_TICKET_REVENUE_NET"
  | "EXHIBITOR_VISITORS_INTERACTED"
  | "EXHIBITOR_LEAD_COUNT"
  | "EXHIBITOR_CONVERTED_LEAD_COUNT"
  | "EXHIBITOR_OPEN_FOLLOWUP_COUNT"
  | "EXHIBITOR_LEAD_CONVERSION_RATE";

export interface DashboardMetricDefinition {
  id: DashboardMetricId;
  label: string;
  description: string;
  scope: DashboardMetricScope;
  sourceDomain: "EVENT" | "EXHIBITION" | "PAYMENT" | "LEAD" | "TICKETING";
  dateField: string;
  requiredPermission: string;
  requiredModule?: string;
  supportedFilters: readonly ("dateRange" | "event" | "ticketType" | "exhibitor" | "venue")[];
  unit: DashboardMetricUnit;
  numerator?: string;
  denominator?: string;
}

const metric = (
  definition: DashboardMetricDefinition,
): DashboardMetricDefinition => definition;

export const DASHBOARD_METRICS = {
  ORGANIZER_EVENT_COUNT: metric({
    id: "ORGANIZER_EVENT_COUNT",
    label: "Events",
    description: "Number of organizer-owned events in scope.",
    scope: "ORGANIZER",
    sourceDomain: "EVENT",
    dateField: "createdAt",
    requiredPermission: "event:view",
    supportedFilters: ["dateRange"],
    unit: "COUNT",
  }),
  ORGANIZER_ACTIVE_EVENT_COUNT: metric({
    id: "ORGANIZER_ACTIVE_EVENT_COUNT",
    label: "Active events",
    description: "Published organizer-owned events currently active.",
    scope: "ORGANIZER",
    sourceDomain: "EVENT",
    dateField: "startDate",
    requiredPermission: "event:view",
    supportedFilters: ["dateRange"],
    unit: "COUNT",
  }),
  ORGANIZER_EXHIBITOR_COUNT: metric({
    id: "ORGANIZER_EXHIBITOR_COUNT",
    label: "Exhibitors",
    description: "Organizer-owned exhibition participations in scope.",
    scope: "ORGANIZER",
    sourceDomain: "EXHIBITION",
    dateField: "createdAt",
    requiredPermission: "exhibitionExhibitor:view",
    supportedFilters: ["dateRange", "event"],
    unit: "COUNT",
  }),
  ORGANIZER_STALL_COUNT: metric({
    id: "ORGANIZER_STALL_COUNT",
    label: "Stalls",
    description: "Stalls belonging to organizer-owned exhibition events.",
    scope: "ORGANIZER",
    sourceDomain: "EXHIBITION",
    dateField: "createdAt",
    requiredPermission: "stall:manage",
    supportedFilters: ["dateRange", "event", "venue"],
    unit: "COUNT",
  }),
  ORGANIZER_STALL_OCCUPANCY: metric({
    id: "ORGANIZER_STALL_OCCUPANCY",
    label: "Stall occupancy",
    description: "Occupied stalls divided by total stalls. Occupied means sold or reserved.",
    scope: "ORGANIZER",
    sourceDomain: "EXHIBITION",
    dateField: "updatedAt",
    requiredPermission: "stall:manage",
    supportedFilters: ["dateRange", "event", "venue"],
    unit: "PERCENT",
    numerator: "sold + reserved stalls",
    denominator: "total stalls",
  }),
  ORGANIZER_VISITOR_COUNT: metric({
    id: "ORGANIZER_VISITOR_COUNT",
    label: "Visitors",
    description: "Paid ticket-booking visitors in organizer scope.",
    scope: "ORGANIZER",
    sourceDomain: "TICKETING",
    dateField: "createdAt",
    requiredPermission: "registration:view",
    supportedFilters: ["dateRange", "event"],
    unit: "COUNT",
  }),
  ORGANIZER_CHECKIN_COUNT: metric({
    id: "ORGANIZER_CHECKIN_COUNT",
    label: "Check-ins",
    description: "Valid check-in records in organizer scope.",
    scope: "ORGANIZER",
    sourceDomain: "TICKETING",
    dateField: "scannedAt",
    requiredPermission: "scanner:use",
    supportedFilters: ["dateRange", "event"],
    unit: "COUNT",
  }),
  ORGANIZER_ATTENDANCE_RATE: metric({
    id: "ORGANIZER_ATTENDANCE_RATE",
    label: "Attendance rate",
    description: "Check-ins divided by eligible paid visitors.",
    scope: "ORGANIZER",
    sourceDomain: "TICKETING",
    dateField: "scannedAt",
    requiredPermission: "registration:view",
    supportedFilters: ["dateRange", "event"],
    unit: "PERCENT",
    numerator: "check-ins",
    denominator: "eligible paid visitors",
  }),
  ORGANIZER_TICKET_REVENUE_GROSS: metric({
    id: "ORGANIZER_TICKET_REVENUE_GROSS",
    label: "Gross ticket revenue",
    description: "Paid ticket revenue before refunds, fees and taxes unless explicitly represented by the source.",
    scope: "ORGANIZER",
    sourceDomain: "PAYMENT",
    dateField: "createdAt",
    requiredPermission: "payment:view",
    supportedFilters: ["dateRange", "event"],
    unit: "CURRENCY",
  }),
  ORGANIZER_STALL_REVENUE_GROSS: metric({
    id: "ORGANIZER_STALL_REVENUE_GROSS",
    label: "Gross stall revenue",
    description: "Paid stall-booking revenue before refunds, fees and taxes unless explicitly represented by the source.",
    scope: "ORGANIZER",
    sourceDomain: "PAYMENT",
    dateField: "createdAt",
    requiredPermission: "payment:view",
    supportedFilters: ["dateRange", "event"],
    unit: "CURRENCY",
  }),
  ORGANIZER_REVENUE_GROSS: metric({
    id: "ORGANIZER_REVENUE_GROSS",
    label: "Gross revenue",
    description: "Gross ticket plus stall revenue from approved payment sources.",
    scope: "ORGANIZER",
    sourceDomain: "PAYMENT",
    dateField: "createdAt",
    requiredPermission: "payment:view",
    supportedFilters: ["dateRange", "event"],
    unit: "CURRENCY",
  }),
  ORGANIZER_LEAD_COUNT: metric({
    id: "ORGANIZER_LEAD_COUNT",
    label: "Leads",
    description: "Leads captured for organizer-owned exhibition participation.",
    scope: "ORGANIZER",
    sourceDomain: "LEAD",
    dateField: "capturedAt",
    requiredPermission: "lead:analytics",
    supportedFilters: ["dateRange", "event", "exhibitor"],
    unit: "COUNT",
  }),
  ORGANIZER_LEAD_CONVERSION_RATE: metric({
    id: "ORGANIZER_LEAD_CONVERSION_RATE",
    label: "Lead conversion rate",
    description: "Converted leads divided by closed converted-or-lost leads.",
    scope: "ORGANIZER",
    sourceDomain: "LEAD",
    dateField: "capturedAt",
    requiredPermission: "lead:analytics",
    supportedFilters: ["dateRange", "event", "exhibitor"],
    unit: "PERCENT",
    numerator: "converted leads",
    denominator: "converted + lost leads",
  }),
  EVENT_REGISTRATION_COUNT: metric({
    id: "EVENT_REGISTRATION_COUNT",
    label: "Registrations",
    description: "All event registrations.",
    scope: "EVENT",
    sourceDomain: "EVENT",
    dateField: "createdAt",
    requiredPermission: "event:view",
    requiredModule: "REGISTRATION",
    supportedFilters: ["dateRange", "event"],
    unit: "COUNT",
  }),
  EVENT_CONFIRMED_REGISTRATION_COUNT: metric({
    id: "EVENT_CONFIRMED_REGISTRATION_COUNT",
    label: "Confirmed registrations",
    description: "Confirmed event registrations.",
    scope: "EVENT",
    sourceDomain: "EVENT",
    dateField: "createdAt",
    requiredPermission: "event:view",
    requiredModule: "REGISTRATION",
    supportedFilters: ["dateRange", "event"],
    unit: "COUNT",
  }),
  EVENT_TICKET_COUNT: metric({
    id: "EVENT_TICKET_COUNT",
    label: "Tickets",
    description: "Event tickets issued across ticket states.",
    scope: "EVENT",
    sourceDomain: "TICKETING",
    dateField: "createdAt",
    requiredPermission: "event:view",
    requiredModule: "TICKETING",
    supportedFilters: ["dateRange", "event", "ticketType"],
    unit: "COUNT",
  }),
  EVENT_CHECKIN_COUNT: metric({
    id: "EVENT_CHECKIN_COUNT",
    label: "Check-ins",
    description: "Event ticket check-ins.",
    scope: "EVENT",
    sourceDomain: "TICKETING",
    dateField: "checkedInAt",
    requiredPermission: "event:view",
    requiredModule: "CHECK_IN",
    supportedFilters: ["dateRange", "event"],
    unit: "COUNT",
  }),
  EVENT_CHECKIN_RATE: metric({
    id: "EVENT_CHECKIN_RATE",
    label: "Check-in rate",
    description: "Used tickets divided by issued tickets.",
    scope: "EVENT",
    sourceDomain: "TICKETING",
    dateField: "checkedInAt",
    requiredPermission: "event:view",
    requiredModule: "CHECK_IN",
    supportedFilters: ["dateRange", "event"],
    unit: "PERCENT",
    numerator: "used tickets",
    denominator: "issued tickets",
  }),
  EVENT_TICKET_REVENUE_GROSS: metric({
    id: "EVENT_TICKET_REVENUE_GROSS",
    label: "Gross ticket revenue",
    description: "Paid event-ticket order value before refunds.",
    scope: "EVENT",
    sourceDomain: "PAYMENT",
    dateField: "createdAt",
    requiredPermission: "payment:view",
    requiredModule: "TICKETING",
    supportedFilters: ["dateRange", "event", "ticketType"],
    unit: "CURRENCY",
  }),
  EVENT_TICKET_REVENUE_REFUNDED: metric({
    id: "EVENT_TICKET_REVENUE_REFUNDED",
    label: "Refunded ticket revenue",
    description: "Refunded event-ticket order value.",
    scope: "EVENT",
    sourceDomain: "PAYMENT",
    dateField: "createdAt",
    requiredPermission: "payment:view",
    requiredModule: "TICKETING",
    supportedFilters: ["dateRange", "event", "ticketType"],
    unit: "CURRENCY",
  }),
  EVENT_TICKET_REVENUE_NET: metric({
    id: "EVENT_TICKET_REVENUE_NET",
    label: "Net ticket revenue",
    description: "Gross event-ticket revenue minus refunded event-ticket order value.",
    scope: "EVENT",
    sourceDomain: "PAYMENT",
    dateField: "createdAt",
    requiredPermission: "payment:view",
    requiredModule: "TICKETING",
    supportedFilters: ["dateRange", "event", "ticketType"],
    unit: "CURRENCY",
  }),
  EXHIBITOR_VISITORS_INTERACTED: metric({
    id: "EXHIBITOR_VISITORS_INTERACTED",
    label: "Visitors interacted with",
    description: "Unique visitors represented by captured exhibitor leads.",
    scope: "EXHIBITOR",
    sourceDomain: "LEAD",
    dateField: "capturedAt",
    requiredPermission: "lead:view",
    supportedFilters: ["dateRange", "event"],
    unit: "COUNT",
  }),
  EXHIBITOR_LEAD_COUNT: metric({
    id: "EXHIBITOR_LEAD_COUNT",
    label: "Leads",
    description: "Leads owned by the exhibitor business.",
    scope: "EXHIBITOR",
    sourceDomain: "LEAD",
    dateField: "capturedAt",
    requiredPermission: "lead:view",
    supportedFilters: ["dateRange", "event"],
    unit: "COUNT",
  }),
  EXHIBITOR_CONVERTED_LEAD_COUNT: metric({
    id: "EXHIBITOR_CONVERTED_LEAD_COUNT",
    label: "Converted leads",
    description: "Exhibitor leads with converted status.",
    scope: "EXHIBITOR",
    sourceDomain: "LEAD",
    dateField: "capturedAt",
    requiredPermission: "lead:view",
    supportedFilters: ["dateRange", "event"],
    unit: "COUNT",
  }),
  EXHIBITOR_OPEN_FOLLOWUP_COUNT: metric({
    id: "EXHIBITOR_OPEN_FOLLOWUP_COUNT",
    label: "Open follow-ups",
    description: "Exhibitor leads with a due follow-up that are not closed.",
    scope: "EXHIBITOR",
    sourceDomain: "LEAD",
    dateField: "followUpDate",
    requiredPermission: "lead:view",
    supportedFilters: ["dateRange", "event"],
    unit: "COUNT",
  }),
  EXHIBITOR_LEAD_CONVERSION_RATE: metric({
    id: "EXHIBITOR_LEAD_CONVERSION_RATE",
    label: "Lead conversion rate",
    description: "Converted exhibitor leads divided by converted plus lost leads.",
    scope: "EXHIBITOR",
    sourceDomain: "LEAD",
    dateField: "capturedAt",
    requiredPermission: "lead:view",
    supportedFilters: ["dateRange", "event"],
    unit: "PERCENT",
    numerator: "converted leads",
    denominator: "converted + lost leads",
  }),
} as const satisfies Record<DashboardMetricId, DashboardMetricDefinition>;

export function getDashboardMetric(id: string): DashboardMetricDefinition | undefined {
  return DASHBOARD_METRICS[id as DashboardMetricId];
}

export function listDashboardMetrics(scope?: DashboardMetricScope): DashboardMetricDefinition[] {
  return Object.values(DASHBOARD_METRICS).filter((definition) => !scope || definition.scope === scope);
}

export function validateDashboardMetricRegistry(): void {
  const definitions = Object.values(DASHBOARD_METRICS);
  if (definitions.length !== 26) throw new Error(`Expected 26 dashboard metrics, found ${definitions.length}`);
  const ids = new Set(definitions.map((definition) => definition.id));
  if (ids.size !== definitions.length) throw new Error("Dashboard metric IDs must be unique");

  for (const definition of definitions) {
    if (!definition.description.trim()) throw new Error(`Missing description for ${definition.id}`);
    if (definition.unit === "PERCENT" && (!definition.numerator || !definition.denominator)) {
      throw new Error(`Percentage metric ${definition.id} must define numerator and denominator`);
    }
  }
}
