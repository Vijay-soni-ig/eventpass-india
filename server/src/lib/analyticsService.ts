import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

// ----------------------------------------------------------------------------
// Reusable analytics queries. Every number here comes from a real aggregate
// query against the actual tables — nothing is fabricated, and an
// exhibition/organizer with no data simply gets zeros/empty arrays back,
// never placeholder numbers. Routes call these; React components only ever
// render what a route returns.
// ----------------------------------------------------------------------------

export interface DateRange {
  from?: Date;
  to?: Date;
}

function dateRangeClause(column: string, range?: DateRange): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (range?.from) parts.push(Prisma.sql`${Prisma.raw(column)} >= ${range.from}`);
  if (range?.to) parts.push(Prisma.sql`${Prisma.raw(column)} <= ${range.to}`);
  if (parts.length === 0) return Prisma.sql``;
  return Prisma.sql`AND ${Prisma.join(parts, " AND ")}`;
}

// -------- Organizer dashboard --------

export interface OrganizerDashboardOptions extends DateRange {
  exhibitionId?: string;
  includeRevenue: boolean;
  includeLeads: boolean;
}

export interface OrganizerDashboardMetrics {
  totalExhibitions: number;
  activeExhibitions: number;
  // Phase 21C (P2-2 fix): renamed from the old, misleading "totalExhibitors"
  // (which actually only ever counted CONFIRMED participations) — kept as
  // its own accurate field rather than silently redefined, plus a genuine
  // total across every status so the UI can show "confirmed / total"
  // exactly like it already does for exhibitions and stalls.
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

export async function getOrganizerDashboard(
  organizerIds: string[],
  opts: OrganizerDashboardOptions
): Promise<OrganizerDashboardMetrics> {
  if (organizerIds.length === 0) {
    return {
      totalExhibitions: 0,
      activeExhibitions: 0,
      confirmedExhibitors: 0,
      totalExhibitorsAllStatuses: 0,
      totalStalls: 0,
      occupiedStalls: 0,
      totalVisitors: 0,
      totalCheckIns: 0,
      attendanceRate: 0,
      ticketRevenue: opts.includeRevenue ? 0 : null,
      stallRevenue: opts.includeRevenue ? 0 : null,
      totalRevenue: opts.includeRevenue ? 0 : null,
      totalLeads: opts.includeLeads ? 0 : null,
      convertedLeads: opts.includeLeads ? 0 : null,
      leadConversionRate: opts.includeLeads ? 0 : null,
    };
  }

  const exhibitionScope: Prisma.ExhibitionWhereInput = {
    organizerId: { in: organizerIds },
    ...(opts.exhibitionId ? { id: opts.exhibitionId } : {}),
  };
  const bookingCreatedAt: Prisma.DateTimeFilter | undefined =
    opts.from || opts.to ? { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } : undefined;

  const [
    totalExhibitions,
    activeExhibitions,
    confirmedExhibitors,
    totalExhibitorsAllStatuses,
    stallStats,
    totalVisitors,
    totalCheckIns,
    ticketRevenueAgg,
    stallRevenueAgg,
    leadStats,
  ] = await Promise.all([
    prisma.exhibition.count({ where: exhibitionScope }),
    prisma.exhibition.count({ where: { ...exhibitionScope, status: "live" } }),
    prisma.exhibitionExhibitor.count({ where: { exhibition: exhibitionScope, status: "confirmed" } }),
    prisma.exhibitionExhibitor.count({ where: { exhibition: exhibitionScope } }),
    prisma.stall.groupBy({
      by: ["status"],
      where: { exhibition: exhibitionScope },
      _count: { _all: true },
    }),
    prisma.ticketBooking.count({
      where: { exhibition: exhibitionScope, paymentStatus: "paid", ...(bookingCreatedAt ? { createdAt: bookingCreatedAt } : {}) },
    }),
    prisma.checkIn.count({
      where: {
        ticketBooking: { exhibition: exhibitionScope, ...(bookingCreatedAt ? { createdAt: bookingCreatedAt } : {}) },
      },
    }),
    opts.includeRevenue
      ? prisma.ticketBooking.aggregate({
          where: { exhibition: exhibitionScope, paymentStatus: "paid", ...(bookingCreatedAt ? { createdAt: bookingCreatedAt } : {}) },
          _sum: { amountPaid: true },
        })
      : null,
    opts.includeRevenue
      ? prisma.stallBooking.aggregate({
          where: { exhibition: exhibitionScope, paymentStatus: "paid", ...(bookingCreatedAt ? { createdAt: bookingCreatedAt } : {}) },
          _sum: { amountPaid: true },
        })
      : null,
    opts.includeLeads
      ? prisma.lead.groupBy({
          by: ["status"],
          where: { exhibitionExhibitor: { exhibition: exhibitionScope }, ...(bookingCreatedAt ? { capturedAt: bookingCreatedAt } : {}) },
          _count: { _all: true },
        })
      : null,
  ]);

  const totalStalls = stallStats.reduce((sum, s) => sum + s._count._all, 0);
  const occupiedStalls = stallStats.filter((s) => s.status === "sold" || s.status === "reserved").reduce((sum, s) => sum + s._count._all, 0);
  const attendanceRate = totalVisitors > 0 ? totalCheckIns / totalVisitors : 0;

  const ticketRevenue = opts.includeRevenue ? Number(ticketRevenueAgg?._sum.amountPaid ?? 0) : null;
  const stallRevenue = opts.includeRevenue ? Number(stallRevenueAgg?._sum.amountPaid ?? 0) : null;
  const totalRevenue = opts.includeRevenue ? (ticketRevenue ?? 0) + (stallRevenue ?? 0) : null;

  let totalLeads: number | null = null;
  let convertedLeads: number | null = null;
  let leadConversionRate: number | null = null;
  if (opts.includeLeads && leadStats) {
    totalLeads = leadStats.reduce((sum, s) => sum + s._count._all, 0);
    convertedLeads = leadStats.find((s) => s.status === "converted")?._count._all ?? 0;
    const lost = leadStats.find((s) => s.status === "lost")?._count._all ?? 0;
    const closed = convertedLeads + lost;
    leadConversionRate = closed > 0 ? convertedLeads / closed : 0;
  }

  return {
    totalExhibitions,
    activeExhibitions,
    confirmedExhibitors,
    totalExhibitorsAllStatuses,
    totalStalls,
    occupiedStalls,
    totalVisitors,
    totalCheckIns,
    attendanceRate,
    ticketRevenue,
    stallRevenue,
    totalRevenue,
    totalLeads,
    convertedLeads,
    leadConversionRate,
  };
}

// -------- Exhibition-level analytics --------

interface DaySeriesRow {
  day: Date;
  count: bigint | number;
}

async function daySeries(table: "ticket_bookings", exhibitionId: string, range?: DateRange) {
  const rows = await prisma.$queryRaw<DaySeriesRow[]>`
    SELECT date_trunc('day', "createdAt")::date AS day, COUNT(*)::int AS count
    FROM ${Prisma.raw(table)}
    WHERE "exhibitionId" = ${exhibitionId} AND "paymentStatus" = 'paid'
    ${dateRangeClause('"createdAt"', range)}
    GROUP BY day ORDER BY day
  `;
  return rows.map((r) => ({ date: r.day.toISOString().slice(0, 10), count: Number(r.count) }));
}

async function checkInDaySeries(exhibitionId: string, range?: DateRange) {
  const rows = await prisma.$queryRaw<DaySeriesRow[]>`
    SELECT date_trunc('day', ci."scannedAt")::date AS day, COUNT(*)::int AS count
    FROM check_ins ci
    JOIN ticket_bookings tb ON tb.id = ci."ticketBookingId"
    WHERE tb."exhibitionId" = ${exhibitionId}
    ${dateRangeClause('ci."scannedAt"', range)}
    GROUP BY day ORDER BY day
  `;
  return rows.map((r) => ({ date: r.day.toISOString().slice(0, 10), count: Number(r.count) }));
}

async function peakEntryHours(exhibitionId: string, range?: DateRange) {
  const rows = await prisma.$queryRaw<{ hour: number; count: bigint | number }[]>`
    SELECT EXTRACT(HOUR FROM ci."scannedAt")::int AS hour, COUNT(*)::int AS count
    FROM check_ins ci
    JOIN ticket_bookings tb ON tb.id = ci."ticketBookingId"
    WHERE tb."exhibitionId" = ${exhibitionId}
    ${dateRangeClause('ci."scannedAt"', range)}
    GROUP BY hour ORDER BY hour
  `;
  return rows.map((r) => ({ hour: Number(r.hour), count: Number(r.count) }));
}

export interface ExhibitionAnalyticsOptions extends DateRange {
  includeRevenue: boolean;
  includeLeads: boolean;
}

export async function getExhibitionAnalytics(exhibitionId: string, opts: ExhibitionAnalyticsOptions) {
  const range: DateRange = { from: opts.from, to: opts.to };

  const [
    visitorsOverTime,
    checkInsOverTime,
    peakEntryPeriods,
    ticketTypeSales,
    stallStats,
    exhibitorsCount,
    ticketRevenueAgg,
    stallRevenueAgg,
    leadsByStatus,
    leadsPerExhibitor,
  ] = await Promise.all([
    daySeries("ticket_bookings", exhibitionId, range),
    checkInDaySeries(exhibitionId, range),
    peakEntryHours(exhibitionId, range),
    prisma.ticketType.findMany({
      where: { exhibitionId },
      select: {
        id: true,
        name: true,
        price: true,
        quantity: true,
        bookings: { where: { paymentStatus: "paid" }, select: { quantity: true, amountPaid: true } },
      },
    }),
    prisma.stall.groupBy({ by: ["status"], where: { exhibitionId }, _count: { _all: true } }),
    prisma.exhibitionExhibitor.count({ where: { exhibitionId, status: "confirmed" } }),
    opts.includeRevenue
      ? prisma.ticketBooking.aggregate({ where: { exhibitionId, paymentStatus: "paid" }, _sum: { amountPaid: true } })
      : null,
    opts.includeRevenue
      ? prisma.stallBooking.aggregate({ where: { exhibitionId, paymentStatus: "paid" }, _sum: { amountPaid: true } })
      : null,
    opts.includeLeads
      ? prisma.lead.groupBy({ by: ["status"], where: { exhibitionExhibitor: { exhibitionId } }, _count: { _all: true } })
      : null,
    opts.includeLeads
      ? prisma.lead.groupBy({ by: ["exhibitionExhibitorId"], where: { exhibitionExhibitor: { exhibitionId } }, _count: { _all: true } })
      : null,
  ]);

  const ticketSales = ticketTypeSales.map((t) => ({
    ticketTypeId: t.id,
    name: t.name,
    capacity: t.quantity,
    sold: t.bookings.reduce((sum, b) => sum + b.quantity, 0),
    revenue: t.bookings.reduce((sum, b) => sum + Number(b.amountPaid), 0),
  }));

  const totalStalls = stallStats.reduce((sum, s) => sum + s._count._all, 0);
  const stallOccupancy = {
    total: totalStalls,
    sold: stallStats.find((s) => s.status === "sold")?._count._all ?? 0,
    reserved: stallStats.find((s) => s.status === "reserved")?._count._all ?? 0,
    available: stallStats.find((s) => s.status === "available")?._count._all ?? 0,
  };

  let leads: { total: number; byStatus: Record<string, number> } | null = null;
  // "leadsPerExhibitor": the complete per-exhibitor breakdown, for
  // reviewing every participant's engagement. "topExhibitors": just the
  // top 5, a quick leaderboard — a distinct, smaller-purpose view rather
  // than the same list restated.
  let leadsBreakdown: { exhibitionExhibitorId: string; name: string; leadCount: number }[] | null = null;
  let topExhibitors: { exhibitionExhibitorId: string; name: string; leadCount: number }[] | null = null;
  if (opts.includeLeads && leadsByStatus && leadsPerExhibitor) {
    const byStatus: Record<string, number> = {};
    for (const row of leadsByStatus) byStatus[row.status] = row._count._all;
    const total = leadsByStatus.reduce((sum, r) => sum + r._count._all, 0);
    leads = { total, byStatus };

    const ranked = [...leadsPerExhibitor].sort((a, b) => b._count._all - a._count._all);
    const participations = await prisma.exhibitionExhibitor.findMany({
      where: { id: { in: ranked.map((r) => r.exhibitionExhibitorId) } },
      select: { id: true, business: { select: { companyName: true } } },
    });
    const nameById = new Map(participations.map((p) => [p.id, p.business.companyName ?? "Unnamed business"]));
    leadsBreakdown = ranked.map((r) => ({
      exhibitionExhibitorId: r.exhibitionExhibitorId,
      name: nameById.get(r.exhibitionExhibitorId) ?? "Unnamed business",
      leadCount: r._count._all,
    }));
    topExhibitors = leadsBreakdown.slice(0, 5);
  }

  const ticketRevenue = opts.includeRevenue ? Number(ticketRevenueAgg?._sum.amountPaid ?? 0) : null;
  const stallRevenue = opts.includeRevenue ? Number(stallRevenueAgg?._sum.amountPaid ?? 0) : null;

  return {
    visitorsOverTime,
    checkInsOverTime,
    peakEntryPeriods,
    ticketSales,
    revenue: opts.includeRevenue ? { ticket: ticketRevenue, stall: stallRevenue, total: (ticketRevenue ?? 0) + (stallRevenue ?? 0) } : null,
    stallOccupancy,
    exhibitorsCount,
    leads,
    leadsPerExhibitor: leadsBreakdown,
    topExhibitors,
  };
}

// -------- Platform-wide dashboard (cross-tenant, platform admin only) --------

export type DashboardGranularity = "day" | "week" | "month";

export interface PlatformDashboardOptions {
  from: Date;
  to: Date;
  granularity: DashboardGranularity;
}

export interface PlatformPeriodMetric {
  current: number;
  previous: number;
  // null when the previous period had zero baseline — a "% change" against
  // zero is undefined, not honestly expressible as a number, so this is
  // left null rather than shown as +∞ or fabricated as 100%.
  changePct: number | null;
}

export interface PlatformAttentionItem {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  context: string;
  timestamp: Date;
  actionLabel: string;
  actionHref: string;
}

export interface PlatformDashboardMetrics {
  range: { from: Date; to: Date; granularity: DashboardGranularity };
  kpis: {
    revenue: PlatformPeriodMetric;
    transactions: PlatformPeriodMetric;
    activeExhibitions: { current: number; startingSoon: number };
    organizers: { total: number; active: number };
    exhibitors: { total: number; newInPeriod: number };
    visitors: PlatformPeriodMetric;
  };
  revenueSeries: { date: string; revenue: number; transactions: number }[];
  activityBreakdown: { newOrganizers: number; newExhibitions: number; newExhibitors: number; newVisitors: number };
  exhibitionBreakdown: { status: string; count: number }[];
  topExhibitions: {
    id: string;
    name: string;
    status: string;
    organizerName: string;
    startDate: Date | null;
    exhibitors: number;
    visitors: number;
    revenue: number;
  }[];
  topOrganizers: {
    id: string;
    name: string;
    suspended: boolean;
    exhibitions: number;
    exhibitors: number;
    visitors: number;
    revenue: number;
  }[];
  subscriptions: {
    active: number;
    trialing: number;
    expiringSoon: number;
    expired: number;
    cancelled: number;
    noPlan: number;
  };
  attention: PlatformAttentionItem[];
  recentActivity: {
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    actorUserId: string | null;
    actorEmail: string | null;
    createdAt: Date;
  }[];
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function previousRange(from: Date, to: Date): { from: Date; to: Date } {
  const spanMs = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - spanMs), to: new Date(from.getTime()) };
}

// Every revenue query below (the time series, top exhibitions, top
// organizers) is built on this SAME "paid revenue by exhibition" union —
// Payment rows with status='paid', reached via TicketBooking.paymentId or
// StallBooking.paymentId — so every widget on the dashboard agrees on what
// "revenue" means. See Payment's own schema comment for why this table
// (not the legacy TicketBooking/StallBooking.amountPaid fields) is the
// source of truth here.
const PAID_REVENUE_BY_EXHIBITION_CTE = Prisma.sql`
  paid AS (
    SELECT tb."exhibitionId" AS exhibition_id, p.amount, p."createdAt"
    FROM payments p JOIN ticket_bookings tb ON tb."paymentId" = p.id
    WHERE p.status = 'paid'
    UNION ALL
    SELECT sb."exhibitionId" AS exhibition_id, p.amount, p."createdAt"
    FROM payments p JOIN stall_bookings sb ON sb."paymentId" = p.id
    WHERE p.status = 'paid'
  )
`;

interface TopExhibitionRow {
  id: string;
  name: string;
  status: string;
  startDate: Date | null;
  organizer_name: string;
  exhibitors: number;
  visitors: number;
  revenue: Prisma.Decimal | number | string;
}

interface TopOrganizerRow {
  id: string;
  name: string;
  suspended: boolean;
  exhibitions: number;
  exhibitors: number;
  visitors: number;
  revenue: Prisma.Decimal | number | string;
}

interface LatestSubscriptionRow {
  status: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
}

interface RevenueSeriesRow {
  bucket: Date;
  revenue: Prisma.Decimal | number | string;
  transactions: number;
}

const EXHIBITION_STATUSES = ["draft", "live", "paused", "completed"] as const;

export async function getPlatformDashboard(opts: PlatformDashboardOptions): Promise<PlatformDashboardMetrics> {
  const { from, to, granularity } = opts;
  const prev = previousRange(from, to);
  const now = new Date();
  const soonHorizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const startingSoonHorizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const draftApproachingHorizon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    totalOrganizers,
    activeOrganizers,
    activeExhibitionsCurrent,
    startingSoonCount,
    totalExhibitors,
    newExhibitorsInPeriod,
    newOrganizersInPeriod,
    newExhibitionsInPeriod,
    revenueCurrentAgg,
    revenuePreviousAgg,
    transactionsCurrent,
    transactionsPrevious,
    visitorsCurrentRows,
    visitorsPreviousRows,
    revenueSeriesRows,
    exhibitionStatusRows,
    topExhibitionsRows,
    topOrganizersRows,
    subscriptionRows,
    failedPaymentsAgg,
    latestFailedPayment,
    refundsRequestedCount,
    latestRefundRequested,
    kycPendingCount,
    draftApproachingCount,
    recentActivityRows,
  ] = await Promise.all([
    prisma.organizer.count(),
    prisma.organizer.count({ where: { suspended: false } }),
    prisma.exhibition.count({ where: { status: "live" } }),
    prisma.exhibition.count({ where: { status: "live", startDate: { gte: now, lte: startingSoonHorizon } } }),
    prisma.exhibitorBusiness.count(),
    prisma.exhibitorBusiness.count({ where: { createdAt: { gte: from, lte: to } } }),
    prisma.organizer.count({ where: { createdAt: { gte: from, lte: to } } }),
    prisma.exhibition.count({ where: { createdAt: { gte: from, lte: to } } }),
    prisma.payment.aggregate({ where: { status: "paid", createdAt: { gte: from, lte: to } }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { status: "paid", createdAt: { gte: prev.from, lte: prev.to } }, _sum: { amount: true } }),
    prisma.payment.count({ where: { status: "paid", createdAt: { gte: from, lte: to } } }),
    prisma.payment.count({ where: { status: "paid", createdAt: { gte: prev.from, lte: prev.to } } }),
    prisma.ticketBooking.findMany({
      where: { buyerUserId: { not: null }, createdAt: { gte: from, lte: to } },
      distinct: ["buyerUserId"],
      select: { buyerUserId: true },
    }),
    prisma.ticketBooking.findMany({
      where: { buyerUserId: { not: null }, createdAt: { gte: prev.from, lte: prev.to } },
      distinct: ["buyerUserId"],
      select: { buyerUserId: true },
    }),
    // Zero-filled via generate_series rather than a plain GROUP BY — a
    // sparse result (only the days/weeks/months that actually had a paid
    // payment) renders as a handful of disconnected points on a line/area
    // chart instead of a continuous series, which reads as broken rather
    // than "quiet." A bucket with no paid payments is correctly 0, not
    // omitted.
    prisma.$queryRaw<RevenueSeriesRow[]>`
      WITH buckets AS (
        SELECT generate_series(
          date_trunc(${granularity}, ${from}::timestamptz),
          date_trunc(${granularity}, ${to}::timestamptz),
          (1 || ' ' || ${granularity})::interval
        ) AS bucket
      )
      SELECT b.bucket::date AS bucket,
        COALESCE(SUM(p.amount), 0) AS revenue,
        COUNT(p.id)::int AS transactions
      FROM buckets b
      LEFT JOIN payments p
        ON p.status = 'paid'
        AND p."createdAt" BETWEEN ${from} AND ${to}
        AND date_trunc(${granularity}, p."createdAt") = b.bucket
      GROUP BY b.bucket
      ORDER BY b.bucket
    `,
    prisma.exhibition.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.$queryRaw<TopExhibitionRow[]>`
      WITH ${PAID_REVENUE_BY_EXHIBITION_CTE},
      exhibitor_counts AS (
        SELECT "exhibitionId", COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed
        FROM exhibition_exhibitors GROUP BY "exhibitionId"
      ),
      visitor_counts AS (
        SELECT "exhibitionId", COUNT(DISTINCT "buyerUserId")::int AS visitors
        FROM ticket_bookings WHERE "paymentStatus" = 'paid' AND "buyerUserId" IS NOT NULL
        GROUP BY "exhibitionId"
      )
      SELECT e.id, e.name, e.status, e."startDate", o.name AS organizer_name,
        COALESCE(ec.confirmed, 0) AS exhibitors,
        COALESCE(vc.visitors, 0) AS visitors,
        COALESCE(SUM(paid.amount) FILTER (WHERE paid."createdAt" BETWEEN ${from} AND ${to}), 0) AS revenue
      FROM exhibitions e
      JOIN organizers o ON o.id = e."organizerId"
      LEFT JOIN paid ON paid.exhibition_id = e.id
      LEFT JOIN exhibitor_counts ec ON ec."exhibitionId" = e.id
      LEFT JOIN visitor_counts vc ON vc."exhibitionId" = e.id
      GROUP BY e.id, o.name, ec.confirmed, vc.visitors
      ORDER BY revenue DESC
      LIMIT 5
    `,
    prisma.$queryRaw<TopOrganizerRow[]>`
      WITH ${PAID_REVENUE_BY_EXHIBITION_CTE},
      paid_with_org AS (
        SELECT e."organizerId" AS organizer_id, paid.amount, paid."createdAt"
        FROM paid JOIN exhibitions e ON e.id = paid.exhibition_id
      ),
      exhibitor_counts AS (
        SELECT e."organizerId" AS organizer_id, COUNT(DISTINCT ee."exhibitorBusinessId")::int AS exhibitors
        FROM exhibition_exhibitors ee JOIN exhibitions e ON e.id = ee."exhibitionId"
        WHERE ee.status = 'confirmed'
        GROUP BY e."organizerId"
      ),
      visitor_counts AS (
        SELECT e."organizerId" AS organizer_id, COUNT(DISTINCT tb."buyerUserId")::int AS visitors
        FROM ticket_bookings tb JOIN exhibitions e ON e.id = tb."exhibitionId"
        WHERE tb."paymentStatus" = 'paid' AND tb."buyerUserId" IS NOT NULL
        GROUP BY e."organizerId"
      )
      SELECT o.id, o.name, o.suspended,
        COUNT(DISTINCT e.id)::int AS exhibitions,
        COALESCE(ec.exhibitors, 0) AS exhibitors,
        COALESCE(vc.visitors, 0) AS visitors,
        COALESCE(SUM(p.amount) FILTER (WHERE p."createdAt" BETWEEN ${from} AND ${to}), 0) AS revenue
      FROM organizers o
      LEFT JOIN exhibitions e ON e."organizerId" = o.id
      LEFT JOIN paid_with_org p ON p.organizer_id = o.id
      LEFT JOIN exhibitor_counts ec ON ec.organizer_id = o.id
      LEFT JOIN visitor_counts vc ON vc.organizer_id = o.id
      GROUP BY o.id, ec.exhibitors, vc.visitors
      ORDER BY revenue DESC
      LIMIT 5
    `,
    // Subscription is a HISTORY table (many rows per organizer over time) —
    // DISTINCT ON picks only each organizer's latest row, which is the only
    // one that reflects their current subscription state.
    prisma.$queryRaw<LatestSubscriptionRow[]>`
      SELECT DISTINCT ON (s."organizerId") s.status, s."trialEndsAt", s."currentPeriodEnd"
      FROM subscriptions s
      ORDER BY s."organizerId", s."createdAt" DESC
    `,
    prisma.payment.aggregate({
      where: { status: "failed", createdAt: { gte: last24h } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.payment.findFirst({ where: { status: "failed" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.refund.count({ where: { status: "REQUESTED" } }),
    prisma.refund.findFirst({ where: { status: "REQUESTED" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.organizer.count({ where: { kycStatus: "pending" } }),
    prisma.exhibition.count({ where: { status: "draft", startDate: { gte: now, lte: draftApproachingHorizon } } }),
    prisma.auditLog.findMany({
      take: 20,
      orderBy: { createdAt: "desc" },
      include: { actorUser: { select: { email: true } } },
    }),
  ]);

  const revenueCurrent = Number(revenueCurrentAgg._sum.amount ?? 0);
  const revenuePrevious = Number(revenuePreviousAgg._sum.amount ?? 0);
  const visitorsCurrent = visitorsCurrentRows.length;
  const visitorsPrevious = visitorsPreviousRows.length;

  const exhibitionCountByStatus = new Map(exhibitionStatusRows.map((r) => [r.status, r._count._all]));
  const exhibitionBreakdown = EXHIBITION_STATUSES.map((status) => ({ status, count: exhibitionCountByStatus.get(status) ?? 0 }));

  let subActive = 0;
  let subTrialing = 0;
  let subExpired = 0;
  let subCancelled = 0;
  let subExpiringSoon = 0;
  for (const s of subscriptionRows) {
    if (s.status === "active") subActive++;
    else if (s.status === "trialing") subTrialing++;
    else if (s.status === "expired") subExpired++;
    else if (s.status === "cancelled") subCancelled++;

    if (s.status === "active" || s.status === "trialing") {
      const endDate = s.status === "trialing" ? s.trialEndsAt : s.currentPeriodEnd;
      if (endDate && endDate >= now && endDate <= soonHorizon) subExpiringSoon++;
    }
  }
  const noPlan = Math.max(0, totalOrganizers - subscriptionRows.length);

  const failedPaymentsCount = failedPaymentsAgg._count._all;
  const attention: PlatformAttentionItem[] = [];
  if (failedPaymentsCount > 0) {
    attention.push({
      id: "failed-payments",
      severity: "critical",
      title: "Payments failing",
      context: `${failedPaymentsCount} payment${failedPaymentsCount === 1 ? "" : "s"} failed in the last 24 hours (₹${Number(
        failedPaymentsAgg._sum.amount ?? 0
      ).toLocaleString("en-IN")} attempted)`,
      timestamp: latestFailedPayment?.createdAt ?? now,
      actionLabel: "View payments",
      actionHref: "/platform/payments",
    });
  }
  if (refundsRequestedCount > 0) {
    attention.push({
      id: "refunds-requested",
      severity: "warning",
      title: "Refunds awaiting action",
      context: `${refundsRequestedCount} refund request${refundsRequestedCount === 1 ? "" : "s"} still pending`,
      timestamp: latestRefundRequested?.createdAt ?? now,
      actionLabel: "View payments",
      actionHref: "/platform/payments",
    });
  }
  if (subExpiringSoon > 0) {
    attention.push({
      id: "subscriptions-expiring",
      severity: "warning",
      title: "Subscriptions expiring soon",
      context: `${subExpiringSoon} organizer subscription${subExpiringSoon === 1 ? "" : "s"} expiring within 7 days`,
      timestamp: now,
      actionLabel: "Review organizers",
      actionHref: "/platform/organizers",
    });
  }
  if (subExpired > 0) {
    attention.push({
      id: "subscriptions-expired",
      severity: "warning",
      title: "Expired subscriptions",
      context: `${subExpired} organizer subscription${subExpired === 1 ? "" : "s"} expired`,
      timestamp: now,
      actionLabel: "Review organizers",
      actionHref: "/platform/organizers",
    });
  }
  if (kycPendingCount > 0) {
    attention.push({
      id: "kyc-pending",
      severity: "info",
      title: "Organizer verification pending",
      context: `${kycPendingCount} organizer${kycPendingCount === 1 ? "" : "s"} awaiting KYC verification`,
      timestamp: now,
      actionLabel: "Review organizers",
      actionHref: "/platform/organizers",
    });
  }
  if (draftApproachingCount > 0) {
    attention.push({
      id: "draft-exhibitions-approaching",
      severity: "warning",
      title: "Exhibitions not yet published",
      context: `${draftApproachingCount} exhibition${draftApproachingCount === 1 ? "" : "s"} start within 3 days but ${
        draftApproachingCount === 1 ? "is" : "are"
      } still in draft`,
      timestamp: now,
      actionLabel: "Review exhibitions",
      actionHref: "/platform/exhibitions",
    });
  }
  const severityRank = { critical: 0, warning: 1, info: 2 } as const;
  attention.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || b.timestamp.getTime() - a.timestamp.getTime());

  return {
    range: { from, to, granularity },
    kpis: {
      revenue: { current: revenueCurrent, previous: revenuePrevious, changePct: pctChange(revenueCurrent, revenuePrevious) },
      transactions: { current: transactionsCurrent, previous: transactionsPrevious, changePct: pctChange(transactionsCurrent, transactionsPrevious) },
      activeExhibitions: { current: activeExhibitionsCurrent, startingSoon: startingSoonCount },
      organizers: { total: totalOrganizers, active: activeOrganizers },
      exhibitors: { total: totalExhibitors, newInPeriod: newExhibitorsInPeriod },
      visitors: { current: visitorsCurrent, previous: visitorsPrevious, changePct: pctChange(visitorsCurrent, visitorsPrevious) },
    },
    revenueSeries: revenueSeriesRows.map((r) => ({
      date: r.bucket.toISOString().slice(0, 10),
      revenue: Number(r.revenue),
      transactions: Number(r.transactions),
    })),
    activityBreakdown: {
      newOrganizers: newOrganizersInPeriod,
      newExhibitions: newExhibitionsInPeriod,
      newExhibitors: newExhibitorsInPeriod,
      newVisitors: visitorsCurrent,
    },
    exhibitionBreakdown,
    topExhibitions: topExhibitionsRows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      organizerName: r.organizer_name,
      startDate: r.startDate,
      exhibitors: Number(r.exhibitors),
      visitors: Number(r.visitors),
      revenue: Number(r.revenue),
    })),
    topOrganizers: topOrganizersRows.map((r) => ({
      id: r.id,
      name: r.name,
      suspended: r.suspended,
      exhibitions: Number(r.exhibitions),
      exhibitors: Number(r.exhibitors),
      visitors: Number(r.visitors),
      revenue: Number(r.revenue),
    })),
    subscriptions: {
      active: subActive,
      trialing: subTrialing,
      expiringSoon: subExpiringSoon,
      expired: subExpired,
      cancelled: subCancelled,
      noPlan,
    },
    attention,
    recentActivity: recentActivityRows.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      actorUserId: r.actorUserId,
      actorEmail: r.actorUser?.email ?? null,
      createdAt: r.createdAt,
    })),
  };
}

// -------- Exhibitor-side analytics (their own leads only) --------

export async function getExhibitorAnalytics(exhibitorBusinessId: string, range?: DateRange) {
  const where: Prisma.LeadWhereInput = {
    exhibitionExhibitor: { exhibitorBusinessId },
    ...(range?.from || range?.to
      ? { capturedAt: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } }
      : {}),
  };

  const [byStatus, followUpsDue, leads] = await Promise.all([
    prisma.lead.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.lead.count({
      where: { ...where, followUpDate: { lte: new Date() }, status: { notIn: ["converted", "lost"] } },
    }),
    prisma.lead.findMany({ where, select: { id: true, ticketBookingId: true, visitorEmail: true, visitorPhone: true } }),
  ]);

  const total = byStatus.reduce((sum, r) => sum + r._count._all, 0);
  const newLeads = byStatus.find((r) => r.status === "new")?._count._all ?? 0;
  const contactedLeads = byStatus.find((r) => r.status === "contacted")?._count._all ?? 0;
  const convertedLeads = byStatus.find((r) => r.status === "converted")?._count._all ?? 0;
  const lostLeads = byStatus.find((r) => r.status === "lost")?._count._all ?? 0;
  const closed = convertedLeads + lostLeads;
  const conversionRate = closed > 0 ? convertedLeads / closed : 0;

  // A visitor is identified by their ticket booking when scanned, or by
  // email/phone for a manually-captured lead with no ticket-holder account
  // — de-duplicated so the same visitor met twice isn't double-counted. A
  // lead with none of those (shouldn't happen — capture requires at least
  // one) falls back to its own id rather than colliding with others.
  const visitorKeys = new Set(leads.map((l) => l.ticketBookingId ?? l.visitorEmail ?? l.visitorPhone ?? l.id));

  return {
    totalLeads: total,
    newLeads,
    contactedLeads,
    convertedLeads,
    lostLeads,
    conversionRate,
    followUpsDue,
    visitorsInteractedWith: visitorKeys.size,
  };
}
