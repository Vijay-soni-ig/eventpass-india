import type { User } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { getDashboardWidget, type DashboardWidgetDefinition } from "./dashboardWidgetRegistry";
import { getDashboard } from "./dashboardService";
import { prisma } from "./prisma";

export class DashboardDataError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "DashboardDataError";
  }
}

export interface DashboardDataFilters {
  from: Date;
  to: Date;
  eventId?: string;
  ticketTypeId?: string;
  exhibitorBusinessId?: string;
  venueId?: string;
}

interface ResolvedMetric {
  value: number;
  unit: "COUNT" | "PERCENT" | "CURRENCY";
  numerator?: number;
  denominator?: number;
}

interface ResolvedWidget {
  widgetId: string;
  visualization: DashboardWidgetDefinition["visualization"];
  status: "READY" | "EMPTY" | "NO_DATA";
  metrics: Record<string, ResolvedMetric>;
  series?: Array<{ date: string; values: Record<string, number> }>;
}

const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 366;

function parseDate(value: unknown, fallback: Date): Date {
  if (typeof value !== "string" || !value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new DashboardDataError(400, "Invalid dashboard date filter");
  return parsed;
}

export function parseDashboardFilters(query: Record<string, unknown>, now = new Date()): DashboardDataFilters {
  const fallbackTo = new Date(now);
  const fallbackFrom = new Date(now);
  fallbackFrom.setUTCDate(fallbackFrom.getUTCDate() - (DEFAULT_RANGE_DAYS - 1));

  const from = parseDate(query.from, fallbackFrom);
  const to = parseDate(query.to, fallbackTo);
  if (from > to) throw new DashboardDataError(400, "Dashboard date range is invalid");
  const rangeDays = Math.ceil((to.getTime() - from.getTime()) / 86_400_000) + 1;
  if (rangeDays > MAX_RANGE_DAYS) throw new DashboardDataError(400, "Dashboard date range cannot exceed 366 days");

  const uuidFields = ["eventId", "ticketTypeId", "exhibitorBusinessId", "venueId"] as const;
  for (const field of uuidFields) {
    const value = query[field];
    if (value !== undefined && (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))) {
      throw new DashboardDataError(400, `Invalid ${field} filter`);
    }
  }

  return {
    from,
    to,
    eventId: typeof query.eventId === "string" ? query.eventId : undefined,
    ticketTypeId: typeof query.ticketTypeId === "string" ? query.ticketTypeId : undefined,
    exhibitorBusinessId: typeof query.exhibitorBusinessId === "string" ? query.exhibitorBusinessId : undefined,
    venueId: typeof query.venueId === "string" ? query.venueId : undefined,
  };
}

function metric(value: number, unit: ResolvedMetric["unit"], numerator?: number, denominator?: number): ResolvedMetric {
  return { value, unit, ...(numerator === undefined ? {} : { numerator }), ...(denominator === undefined ? {} : { denominator }) };
}

function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : 0;
}

function dayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function dateBuckets(from: Date, to: Date): string[] {
  const result: string[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (cursor <= end) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

async function assertEventScope(dashboardOwnerId: string | null, eventId: string): Promise<{
  id: string;
  organizerId: string;
  venueId: string | null;
}> {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      organizerId: dashboardOwnerId ?? undefined,
      archivedAt: null,
    },
    select: { id: true, organizerId: true, venueId: true },
  });
  if (!event) throw new DashboardDataError(404, "Event not found in dashboard scope");
  return event;
}

async function assertEventModule(eventId: string, moduleType: string): Promise<void> {
  const enabled = await prisma.eventModuleEnablement.findFirst({
    where: { eventId, moduleType: moduleType as never, enabled: true },
    select: { id: true },
  });
  if (!enabled) throw new DashboardDataError(409, `${moduleType} module is not enabled for this event`);
}

export function validateDashboardFilterSupport(
  definition: DashboardWidgetDefinition,
  filters: Pick<DashboardDataFilters, "eventId" | "ticketTypeId" | "exhibitorBusinessId" | "venueId">,
): void {
  const supported = new Set(definition.supportedFilters);
  const checks: Array<[keyof typeof filters, string]> = [
    ["eventId", "event"],
    ["ticketTypeId", "ticketType"],
    ["exhibitorBusinessId", "exhibitor"],
    ["venueId", "venue"],
  ];
  for (const [field, filterName] of checks) {
    if (filters[field] && !supported.has(filterName as DashboardWidgetDefinition["supportedFilters"][number])) {
      throw new DashboardDataError(400, `${definition.id} does not support the ${filterName} filter`);
    }
  }
}

async function resolveOrganizerWidget(
  definition: DashboardWidgetDefinition,
  ownerId: string,
  filters: DashboardDataFilters,
): Promise<ResolvedWidget> {
  const eventWhere = filters.eventId ? { id: filters.eventId, organizerId: ownerId, archivedAt: null } : { organizerId: ownerId, archivedAt: null };
  if (filters.eventId) await assertEventScope(ownerId, filters.eventId);

  switch (definition.id) {
    case "ORGANIZER_EVENT_KPI": {
      const count = await prisma.event.count({ where: { ...eventWhere, createdAt: { gte: filters.from, lte: filters.to } } });
      return { widgetId: definition.id, visualization: definition.visualization, status: count ? "READY" : "NO_DATA", metrics: { ORGANIZER_EVENT_COUNT: metric(count, "COUNT") } };
    }
    case "ORGANIZER_REVENUE_KPI": {
      const legacyExhibitionWhere: Prisma.ExhibitionWhereInput = {
        organizerId: ownerId,
        eventId: null,
        ...(filters.eventId ? { id: "__no-match__" } : {}),
      };
      const legacyExhibitions = filters.eventId
        ? []
        : await prisma.exhibition.findMany({ where: legacyExhibitionWhere, select: { id: true } });
      const legacyExhibitionIds = legacyExhibitions.map((row) => row.id);
      const [canonicalTicket, legacyTicket, stall] = await Promise.all([
        prisma.eventTicketOrder.aggregate({
          where: { event: eventWhere, status: "PAID", createdAt: { gte: filters.from, lte: filters.to } },
          _sum: { totalAmount: true },
        }),
        legacyExhibitionIds.length
          ? prisma.ticketBooking.aggregate({
              where: { exhibitionId: { in: legacyExhibitionIds }, paymentStatus: "paid", createdAt: { gte: filters.from, lte: filters.to } },
              _sum: { amountPaid: true },
            })
          : Promise.resolve({ _sum: { amountPaid: null } }),
        legacyExhibitionIds.length
          ? prisma.stallBooking.aggregate({
              where: { exhibitionId: { in: legacyExhibitionIds }, paymentStatus: "paid", createdAt: { gte: filters.from, lte: filters.to } },
              _sum: { amountPaid: true },
            })
          : Promise.resolve({ _sum: { amountPaid: null } }),
      ]);
      const value = Number(canonicalTicket._sum.totalAmount ?? 0) + Number(legacyTicket._sum.amountPaid ?? 0) + Number(stall._sum.amountPaid ?? 0);
      return { widgetId: definition.id, visualization: definition.visualization, status: value ? "READY" : "NO_DATA", metrics: { ORGANIZER_REVENUE_GROSS: metric(value, "CURRENCY") } };
    }
    case "ORGANIZER_ATTENDANCE_KPI": {
      const legacyExhibitions = filters.eventId
        ? []
        : await prisma.exhibition.findMany({ where: { organizerId: ownerId, eventId: null }, select: { id: true } });
      const legacyIds = legacyExhibitions.map((row) => row.id);
      const [issuedCanonical, checkedCanonical, issuedLegacy, checkedLegacy] = await Promise.all([
        prisma.eventTicket.count({
          where: { event: eventWhere, status: { notIn: ["CANCELLED", "REFUNDED"] }, createdAt: { gte: filters.from, lte: filters.to } },
        }),
        prisma.eventTicket.count({
          where: { event: eventWhere, status: "USED", checkedInAt: { gte: filters.from, lte: filters.to } },
        }),
        legacyIds.length
          ? prisma.ticketBooking.count({ where: { exhibitionId: { in: legacyIds }, paymentStatus: "paid", createdAt: { gte: filters.from, lte: filters.to } } })
          : Promise.resolve(0),
        legacyIds.length
          ? prisma.checkIn.count({ where: { ticketBooking: { exhibitionId: { in: legacyIds } }, scannedAt: { gte: filters.from, lte: filters.to } } })
          : Promise.resolve(0),
      ]);
      const issued = issuedCanonical + issuedLegacy;
      const checkedIn = checkedCanonical + checkedLegacy;
      return { widgetId: definition.id, visualization: definition.visualization, status: issued ? "READY" : "NO_DATA", metrics: { ORGANIZER_ATTENDANCE_RATE: metric(pct(checkedIn, issued), "PERCENT", checkedIn, issued) } };
    }
    case "ORGANIZER_STALL_OCCUPANCY": {
      const exhibitions = await prisma.exhibition.findMany({
        where: { organizerId: ownerId, ...(filters.eventId ? { eventId: filters.eventId } : {}), ...(filters.venueId ? { event: { venueId: filters.venueId } } : {}) },
        select: { id: true },
      });
      const ids = exhibitions.map((row) => row.id);
      const [total, occupied] = ids.length
        ? await Promise.all([
            prisma.stall.count({ where: { exhibitionId: { in: ids } } }),
            prisma.stall.count({ where: { exhibitionId: { in: ids }, status: { in: ["reserved", "sold"] } } }),
          ])
        : [0, 0];
      return { widgetId: definition.id, visualization: definition.visualization, status: total ? "READY" : "NO_DATA", metrics: { ORGANIZER_STALL_OCCUPANCY: metric(pct(occupied, total), "PERCENT", occupied, total) } };
    }
    case "ORGANIZER_LEAD_CONVERSION": {
      const where: Prisma.LeadWhereInput = {
        exhibitionExhibitor: { exhibition: { organizerId: ownerId, ...(filters.eventId ? { eventId: filters.eventId } : {}) } },
        capturedAt: { gte: filters.from, lte: filters.to },
        ...(filters.exhibitorBusinessId ? { exhibitionExhibitor: { exhibitorBusinessId: filters.exhibitorBusinessId, exhibition: { organizerId: ownerId, ...(filters.eventId ? { eventId: filters.eventId } : {}) } } } : {}),
      };
      const grouped = await prisma.lead.groupBy({ by: ["status"], where, _count: { _all: true } });
      const converted = grouped.find((row) => row.status === "converted")?._count._all ?? 0;
      const lost = grouped.find((row) => row.status === "lost")?._count._all ?? 0;
      return { widgetId: definition.id, visualization: definition.visualization, status: converted + lost ? "READY" : "NO_DATA", metrics: { ORGANIZER_LEAD_CONVERSION_RATE: metric(pct(converted, converted + lost), "PERCENT", converted, converted + lost) } };
    }
    default:
      throw new DashboardDataError(422, `Unsupported organizer dashboard widget ${definition.id}`);
  }
}

async function resolveEventWidget(
  definition: DashboardWidgetDefinition,
  ownerId: string,
  filters: DashboardDataFilters,
): Promise<ResolvedWidget> {
  if (!filters.eventId) throw new DashboardDataError(400, `eventId is required for ${definition.id}`);
  const event = await assertEventScope(ownerId, filters.eventId);
  if (definition.requiredModule) await assertEventModule(event.id, definition.requiredModule);

  const baseOrderWhere = {
    eventId: event.id,
    createdAt: { gte: filters.from, lte: filters.to },
    ...(filters.ticketTypeId ? { tickets: { some: { eventTicketTypeId: filters.ticketTypeId } } } : {}),
  };

  switch (definition.id) {
    case "EVENT_REGISTRATION_KPI": {
      const count = await prisma.eventRegistration.count({ where: { eventId: event.id, createdAt: { gte: filters.from, lte: filters.to } } });
      return { widgetId: definition.id, visualization: definition.visualization, status: count ? "READY" : "NO_DATA", metrics: { EVENT_REGISTRATION_COUNT: metric(count, "COUNT") } };
    }
    case "EVENT_TICKET_REVENUE_KPI": {
      const [paid, refundedAggregate] = await Promise.all([
        prisma.eventTicketOrder.aggregate({ where: { ...baseOrderWhere, status: "PAID" }, _sum: { totalAmount: true } }),
        prisma.eventTicketOrder.aggregate({ where: { eventId: event.id, status: "REFUNDED", createdAt: { gte: filters.from, lte: filters.to }, ...(filters.ticketTypeId ? { tickets: { some: { eventTicketTypeId: filters.ticketTypeId } } } : {}) }, _sum: { totalAmount: true } }),
      ]);
      const gross = Number(paid._sum.totalAmount ?? 0);
      const refunded = Number(refundedAggregate._sum.totalAmount ?? 0);
      return { widgetId: definition.id, visualization: definition.visualization, status: gross || refunded ? "READY" : "NO_DATA", metrics: { EVENT_TICKET_REVENUE_NET: metric(gross - refunded, "CURRENCY") } };
    }
    case "EVENT_CHECKIN_RATE": {
      const [issued, used] = await Promise.all([
        prisma.eventTicket.count({ where: { eventId: event.id, status: { notIn: ["CANCELLED", "REFUNDED"] }, createdAt: { gte: filters.from, lte: filters.to }, ...(filters.ticketTypeId ? { eventTicketTypeId: filters.ticketTypeId } : {}) } }),
        prisma.eventTicket.count({ where: { eventId: event.id, status: "USED", checkedInAt: { gte: filters.from, lte: filters.to }, ...(filters.ticketTypeId ? { eventTicketTypeId: filters.ticketTypeId } : {}) } }),
      ]);
      return { widgetId: definition.id, visualization: definition.visualization, status: issued ? "READY" : "NO_DATA", metrics: { EVENT_CHECKIN_RATE: metric(pct(used, issued), "PERCENT", used, issued) } };
    }
    case "EVENT_TICKET_REVENUE_TREND": {
      const [paidRows, refundRows] = await Promise.all([
        prisma.eventTicketOrder.findMany({ where: { ...baseOrderWhere, status: "PAID" }, select: { createdAt: true, totalAmount: true } }),
        prisma.eventTicketOrder.findMany({ where: { eventId: event.id, status: "REFUNDED", createdAt: { gte: filters.from, lte: filters.to }, ...(filters.ticketTypeId ? { tickets: { some: { eventTicketTypeId: filters.ticketTypeId } } } : {}) }, select: { createdAt: true, totalAmount: true } }),
      ]);
      const buckets = new Map(dateBuckets(filters.from, filters.to).map((date) => [date, { gross: 0, refunded: 0, net: 0 }]));
      for (const row of paidRows) buckets.get(dayKey(row.createdAt))!.gross += Number(row.totalAmount);
      for (const row of refundRows) buckets.get(dayKey(row.createdAt))!.refunded += Number(row.totalAmount);
      return { widgetId: definition.id, visualization: definition.visualization, status: paidRows.length || refundRows.length ? "READY" : "NO_DATA", metrics: {}, series: [...buckets.entries()].map(([date, values]) => ({ date, values })) };
    }
    case "EVENT_REGISTRATION_TREND": {
      const rows = await prisma.eventRegistration.findMany({ where: { eventId: event.id, createdAt: { gte: filters.from, lte: filters.to } }, select: { createdAt: true, status: true } });
      const buckets = new Map(dateBuckets(filters.from, filters.to).map((date) => [date, { total: 0, confirmed: 0 }]));
      for (const row of rows) {
        const bucket = buckets.get(dayKey(row.createdAt))!;
        bucket.total++;
        if (row.status === "CONFIRMED") bucket.confirmed++;
      }
      return { widgetId: definition.id, visualization: definition.visualization, status: rows.length ? "READY" : "NO_DATA", metrics: {}, series: [...buckets.entries()].map(([date, values]) => ({ date, values })) };
    }
    default:
      throw new DashboardDataError(422, `Unsupported event dashboard widget ${definition.id}`);
  }
}

async function resolveExhibitorWidget(
  definition: DashboardWidgetDefinition,
  ownerId: string,
  filters: DashboardDataFilters,
): Promise<ResolvedWidget> {
  const where: Prisma.LeadWhereInput = {
    exhibitionExhibitor: {
      exhibitorBusinessId: ownerId,
      ...(filters.eventId ? { exhibition: { eventId: filters.eventId } } : {}),
    },
    capturedAt: { gte: filters.from, lte: filters.to },
  };
  const [grouped, followups] = await Promise.all([
    prisma.lead.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.lead.count({ where: { ...where, followUpDate: { lte: new Date() }, status: { notIn: ["converted", "lost"] } } }),
  ]);
  const converted = grouped.find((row) => row.status === "converted")?._count._all ?? 0;
  const lost = grouped.find((row) => row.status === "lost")?._count._all ?? 0;
  const total = grouped.reduce((sum, row) => sum + row._count._all, 0);

  if (definition.id === "EXHIBITOR_LEAD_KPI") return { widgetId: definition.id, visualization: definition.visualization, status: total ? "READY" : "NO_DATA", metrics: { EXHIBITOR_LEAD_COUNT: metric(total, "COUNT") } };
  if (definition.id === "EXHIBITOR_CONVERSION_KPI") return { widgetId: definition.id, visualization: definition.visualization, status: converted + lost ? "READY" : "NO_DATA", metrics: { EXHIBITOR_LEAD_CONVERSION_RATE: metric(pct(converted, converted + lost), "PERCENT", converted, converted + lost) } };
  return { widgetId: definition.id, visualization: definition.visualization, status: followups ? "READY" : "NO_DATA", metrics: { EXHIBITOR_OPEN_FOLLOWUP_COUNT: metric(followups, "COUNT") } };
}

export async function resolveDashboardData(user: User, dashboardId: string, filters: DashboardDataFilters) {
  const dashboard = await getDashboard(user, dashboardId);
  const ownerId = dashboard.ownerId;
  if (dashboard.ownerType === "PLATFORM") throw new DashboardDataError(501, "Platform dashboard data is not enabled in FD-06");
  if (!ownerId) throw new DashboardDataError(400, "Dashboard owner is missing");

  const widgets: ResolvedWidget[] = [];
  for (const row of dashboard.widgets) {
    const definition = getDashboardWidget(row.widgetType);
    if (!definition || !row.isVisible) continue;
    validateDashboardFilterSupport(definition, filters);
    const resolved = definition.scope === "EVENT"
      ? await resolveEventWidget(definition, ownerId, filters)
      : dashboard.ownerType === "ORGANIZER"
        ? await resolveOrganizerWidget(definition, ownerId, filters)
        : await resolveExhibitorWidget(definition, ownerId, filters);
    if (resolved) widgets.push(resolved);
  }
  return { dashboardId: dashboard.id, version: dashboard.version, generatedAt: new Date().toISOString(), filters, widgets };
}
