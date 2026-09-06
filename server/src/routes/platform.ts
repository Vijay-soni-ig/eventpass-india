import { Router, type Response } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePlatformAdmin } from "../middleware/auth";
import { getPlatformDashboard, getExhibitionAnalytics } from "../lib/analyticsService";
import { logAudit } from "../lib/audit";
import { dateString } from "../lib/validation";
import { activateSubscription, cancelSubscription, expireSubscription, changePlan, SubscriptionError } from "../lib/subscriptionService";
import { getOrganizerEntitlement } from "../lib/entitlementService";

const router = Router();

// Platform admin routes never go through organizerIdsWithPermission /
// exhibitorBusinessIdsWithPermission or any other tenant-membership
// helper — they query Prisma directly. That's deliberate: a platform admin
// very likely has zero OrganizerMembership/ExhibitorMembership rows of
// their own, and routing through those helpers would (correctly, for a
// normal user) return an empty scope. Gating is requirePlatformAdmin only.
router.use(requireAuth, requirePlatformAdmin);

// -------- Dashboard --------

const dashboardQuerySchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  granularity: z.enum(["day", "week", "month"]).default("day"),
});

router.get("/dashboard", async (req, res) => {
  const parsed = dashboardQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const to = parsed.data.to ? new Date(parsed.data.to) : new Date();
  const from = parsed.data.from ? new Date(parsed.data.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

  const metrics = await getPlatformDashboard({ from, to, granularity: parsed.data.granularity });
  res.json(metrics);
});

// -------- Organizers (also serves as "Organizations" — this schema has no
// separate Organization entity distinct from Organizer, so rather than
// invent a parallel fake one, both nav sections point at this same data) --

const listQuerySchema = z.object({
  search: z.string().optional(),
  suspended: z.enum(["true", "false"]).optional(),
  kycStatus: z.enum(["pending", "verified"]).optional(),
  subscriptionStatus: z.enum(["trialing", "active", "cancelled", "expired", "inactive"]).optional(),
});

interface OrganizerListRow {
  id: string;
  name: string;
  kycStatus: string;
  bankVerified: boolean;
  suspended: boolean;
  suspendedReason: string | null;
  suspendedAt: Date | null;
  createdAt: Date;
  exhibitions_count: number;
  team_count: number;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  exhibitors_count: number;
  visitors_count: number;
  ticket_revenue: Prisma.Decimal | number | string;
  stall_revenue: Prisma.Decimal | number | string;
  subscription_status: string | null;
  plan_name: string | null;
  last_active: Date | null;
}

// One enriched query (a handful of one-row-per-organizer CTEs LEFT JOINed
// onto the organizer list, never a per-row round trip) rather than N+1 —
// this list is meant to scale past a handful of dev-seed organizers.
router.get("/organizers", async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { search, suspended, kycStatus, subscriptionStatus } = parsed.data;

  const rows = await prisma.$queryRaw<OrganizerListRow[]>`
    WITH exhibitions_counts AS (
      SELECT "organizerId" AS organizer_id, COUNT(*)::int AS exhibitions FROM exhibitions GROUP BY "organizerId"
    ),
    team_counts AS (
      SELECT "organizerId" AS organizer_id, COUNT(*) FILTER (WHERE status = 'active')::int AS team
      FROM organizer_memberships GROUP BY "organizerId"
    ),
    owner_contact AS (
      SELECT DISTINCT ON (om."organizerId") om."organizerId" AS organizer_id, u."fullName" AS contact_name, u.email AS contact_email, u.phone AS contact_phone
      FROM organizer_memberships om
      JOIN users u ON u.id = om."userId"
      WHERE om.status = 'active'
      ORDER BY om."organizerId", (CASE om.role WHEN 'owner' THEN 0 ELSE 1 END), om."createdAt" ASC
    ),
    exhibitor_counts AS (
      SELECT e."organizerId" AS organizer_id, COUNT(DISTINCT ee."exhibitorBusinessId")::int AS exhibitors
      FROM exhibition_exhibitors ee JOIN exhibitions e ON e.id = ee."exhibitionId"
      GROUP BY e."organizerId"
    ),
    visitor_counts AS (
      SELECT e."organizerId" AS organizer_id, COUNT(DISTINCT tb."buyerUserId")::int AS visitors
      FROM ticket_bookings tb JOIN exhibitions e ON e.id = tb."exhibitionId"
      WHERE tb."paymentStatus" = 'paid' AND tb."buyerUserId" IS NOT NULL
      GROUP BY e."organizerId"
    ),
    revenue AS (
      SELECT organizer_id,
        COALESCE(SUM(amount) FILTER (WHERE kind = 'ticket'), 0) AS ticket_revenue,
        COALESCE(SUM(amount) FILTER (WHERE kind = 'stall'), 0) AS stall_revenue
      FROM (
        SELECT e."organizerId" AS organizer_id, p.amount, 'ticket' AS kind
        FROM payments p JOIN ticket_bookings tb ON tb."paymentId" = p.id JOIN exhibitions e ON e.id = tb."exhibitionId"
        WHERE p.status = 'paid'
        UNION ALL
        SELECT e."organizerId" AS organizer_id, p.amount, 'stall' AS kind
        FROM payments p JOIN stall_bookings sb ON sb."paymentId" = p.id JOIN exhibitions e ON e.id = sb."exhibitionId"
        WHERE p.status = 'paid'
      ) paid_with_org
      GROUP BY organizer_id
    ),
    latest_sub AS (
      SELECT DISTINCT ON (s."organizerId") s."organizerId" AS organizer_id, s.status, p.name AS plan_name
      FROM subscriptions s JOIN plans p ON p.id = s."planId"
      ORDER BY s."organizerId", s."createdAt" DESC
    ),
    last_active AS (
      SELECT "entityId" AS organizer_id, MAX("createdAt") AS last_active
      FROM audit_logs WHERE "entityType" = 'Organizer' AND "entityId" IS NOT NULL GROUP BY "entityId"
    )
    SELECT o.id, o.name, o."kycStatus", o."bankVerified", o.suspended, o."suspendedReason", o."suspendedAt", o."createdAt",
      COALESCE(ecs.exhibitions, 0) AS exhibitions_count,
      COALESCE(tc.team, 0) AS team_count,
      oc.contact_name, oc.contact_email, oc.contact_phone,
      COALESCE(ec.exhibitors, 0) AS exhibitors_count,
      COALESCE(vc.visitors, 0) AS visitors_count,
      COALESCE(r.ticket_revenue, 0) AS ticket_revenue,
      COALESCE(r.stall_revenue, 0) AS stall_revenue,
      ls.status AS subscription_status,
      ls.plan_name,
      la.last_active
    FROM organizers o
    LEFT JOIN exhibitions_counts ecs ON ecs.organizer_id = o.id
    LEFT JOIN team_counts tc ON tc.organizer_id = o.id
    LEFT JOIN owner_contact oc ON oc.organizer_id = o.id
    LEFT JOIN exhibitor_counts ec ON ec.organizer_id = o.id
    LEFT JOIN visitor_counts vc ON vc.organizer_id = o.id
    LEFT JOIN revenue r ON r.organizer_id = o.id
    LEFT JOIN latest_sub ls ON ls.organizer_id = o.id
    LEFT JOIN last_active la ON la.organizer_id = o.id
    WHERE (${search ?? null}::text IS NULL OR o.name ILIKE '%' || ${search ?? null}::text || '%')
      AND (${suspended ?? null}::text IS NULL OR o.suspended = (${suspended ?? null}::text = 'true'))
      AND (${kycStatus ?? null}::text IS NULL OR o."kycStatus"::text = ${kycStatus ?? null}::text)
      AND (${subscriptionStatus ?? null}::text IS NULL OR ls.status::text = ${subscriptionStatus ?? null}::text)
    ORDER BY o."createdAt" DESC
  `;

  const organizers = rows.map((r) => ({
    id: r.id,
    name: r.name,
    kycStatus: r.kycStatus,
    bankVerified: r.bankVerified,
    suspended: r.suspended,
    suspendedReason: r.suspendedReason,
    suspendedAt: r.suspendedAt,
    createdAt: r.createdAt,
    _count: { exhibitions: r.exhibitions_count, memberships: r.team_count },
    contact: { name: r.contact_name, email: r.contact_email, phone: r.contact_phone },
    exhibitorsCount: r.exhibitors_count,
    visitorsCount: r.visitors_count,
    ticketRevenue: Number(r.ticket_revenue),
    stallRevenue: Number(r.stall_revenue),
    subscription: r.subscription_status ? { status: r.subscription_status, planName: r.plan_name } : null,
    lastActive: r.last_active,
  }));

  res.json({ organizers });
});

router.get("/organizers/:id", async (req, res) => {
  const organizer = await prisma.organizer.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { exhibitions: true, memberships: true } } },
  });
  if (!organizer) return res.status(404).json({ error: "Organizer not found" });
  res.json({ organizer });
});

const organizerProfileSchema = z.object({
  name: z.string().min(1).optional(),
  businessType: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  gst: z.string().nullable().optional(),
  pan: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
});

router.patch("/organizers/:id", async (req, res) => {
  const parsed = organizerProfileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  if (Object.keys(parsed.data).length === 0) return res.status(400).json({ error: "No fields to update" });

  const existing = await prisma.organizer.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Organizer not found" });

  const organizer = await prisma.organizer.update({ where: { id: existing.id }, data: parsed.data });

  await logAudit({
    actorUserId: req.user!.id,
    action: "platform.organizer_updated",
    entityType: "Organizer",
    entityId: organizer.id,
    metadata: { before: organizerProfileSchema.parse(existing), after: parsed.data },
  });

  res.json({ organizer });
});

const kycSchema = z.object({ verified: z.boolean() });

router.patch("/organizers/:id/kyc", async (req, res) => {
  const parsed = kycSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const existing = await prisma.organizer.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Organizer not found" });

  const organizer = await prisma.organizer.update({
    where: { id: existing.id },
    data: { kycStatus: parsed.data.verified ? "verified" : "pending" },
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: parsed.data.verified ? "platform.organizer_kyc_verified" : "platform.organizer_kyc_reverted",
    entityType: "Organizer",
    entityId: organizer.id,
    metadata: { previousStatus: existing.kycStatus },
  });

  res.json({ organizer });
});

const suspendSchema = z.object({ suspended: z.boolean(), reason: z.string().optional() });

router.patch("/organizers/:id/suspend", async (req, res) => {
  const parsed = suspendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const existing = await prisma.organizer.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Organizer not found" });

  const organizer = await prisma.organizer.update({
    where: { id: existing.id },
    data: {
      suspended: parsed.data.suspended,
      suspendedReason: parsed.data.suspended ? (parsed.data.reason ?? null) : null,
      suspendedAt: parsed.data.suspended ? new Date() : null,
    },
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: parsed.data.suspended ? "platform.organizer_suspended" : "platform.organizer_activated",
    entityType: "Organizer",
    entityId: organizer.id,
    metadata: { reason: parsed.data.reason },
  });

  res.json({ organizer });
});

router.get("/organizers/:id/exhibitions", async (req, res) => {
  const organizer = await prisma.organizer.findUnique({ where: { id: req.params.id } });
  if (!organizer) return res.status(404).json({ error: "Organizer not found" });

  const exhibitions = await prisma.exhibition.findMany({
    where: { organizerId: organizer.id },
    include: { _count: { select: { ticketBookings: true, stallBookings: true, stalls: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ exhibitions });
});

router.get("/organizers/:id/team", async (req, res) => {
  const organizer = await prisma.organizer.findUnique({ where: { id: req.params.id } });
  if (!organizer) return res.status(404).json({ error: "Organizer not found" });

  const members = await prisma.organizerMembership.findMany({
    where: { organizerId: organizer.id },
    include: { user: { select: { id: true, fullName: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  res.json({ members });
});

router.get("/organizers/:id/usage", async (req, res) => {
  const organizer = await prisma.organizer.findUnique({ where: { id: req.params.id } });
  if (!organizer) return res.status(404).json({ error: "Organizer not found" });

  const exhibitionScope = { organizerId: organizer.id };
  const [exhibitionsCount, activeExhibitionsCount, teamMemberCount, ticketBookingsCount, stallBookingsCount, revenueAgg] =
    await Promise.all([
      prisma.exhibition.count({ where: exhibitionScope }),
      prisma.exhibition.count({ where: { ...exhibitionScope, status: "live" } }),
      prisma.organizerMembership.count({ where: { organizerId: organizer.id, status: "active" } }),
      prisma.ticketBooking.count({ where: { exhibition: exhibitionScope, paymentStatus: "paid" } }),
      prisma.stallBooking.count({ where: { exhibition: exhibitionScope, paymentStatus: "paid" } }),
      prisma.ticketBooking.aggregate({ where: { exhibition: exhibitionScope, paymentStatus: "paid" }, _sum: { amountPaid: true } }),
    ]);

  res.json({
    exhibitionsCount,
    activeExhibitionsCount,
    teamMemberCount,
    ticketBookingsCount,
    stallBookingsCount,
    ticketRevenue: Number(revenueAgg._sum.amountPaid ?? 0),
  });
});

// -------- Subscription (Phase 20B) --------
//
// Platform-admin view/management of one organizer's subscription. Reads
// real Plan/Subscription data — this used to unconditionally return
// {hasSubscriptionSystem: false} before Phase 20B; that stub is gone now
// that the lifecycle is real, but plan-limit ENFORCEMENT remains exactly
// as deferred as it always was (Phase 20C) — this route only reports and
// transitions subscription state, it never gates any other route's
// behavior.

router.get("/organizers/:id/subscription", async (req, res) => {
  const organizer = await prisma.organizer.findUnique({ where: { id: req.params.id } });
  if (!organizer) return res.status(404).json({ error: "Organizer not found" });

  const subscription = await prisma.subscription.findFirst({
    where: { organizerId: organizer.id },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });

  // Phase 20C: usage vs. limits, so a platform admin can see exactly why
  // an organizer is (or isn't) blocked, without a separate billing console.
  const entitlement = subscription ? await getOrganizerEntitlement(organizer.id) : null;

  res.json({ subscription, usage: entitlement?.usage ?? null, trialConsumed: entitlement?.trialConsumed ?? null });
});

router.get("/plans", async (_req, res) => {
  const plans = await prisma.plan.findMany({ where: { active: true }, orderBy: { price: "asc" } });
  res.json({ plans });
});

// -------- Cross-organizer subscriptions list (Phase: platform Subscriptions page) --------
//
// Every organizer gets exactly one Starter trial Subscription at bootstrap
// (see subscriptionService.ts), so "one row per organizer, latest
// subscription" is the correct cross-tenant view — this is the same
// Subscription/Plan data the per-organizer subscription routes above
// already expose, just aggregated across every organizer instead of one.
// Mutating a subscription still goes through the existing per-organizer
// activate/cancel/expire/change-plan routes above — this endpoint is
// read-only.

const subscriptionsQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(["trialing", "active", "cancelled", "expired", "inactive"]).optional(),
  expiringSoon: z.enum(["true"]).optional(),
});

router.get("/subscriptions", async (req, res) => {
  const parsed = subscriptionsQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const organizers = await prisma.organizer.findMany({
    where: parsed.data.search ? { name: { contains: parsed.data.search, mode: "insensitive" } } : undefined,
    select: {
      id: true,
      name: true,
      suspended: true,
      subscriptions: { orderBy: { createdAt: "desc" }, take: 1, include: { plan: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Summary reflects every organizer matching the search (not narrowed
  // further by the status quick-filter below), so the KPI cards stay a
  // stable "whole picture" the status filter then slices into.
  const now = new Date();
  const soonHorizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  let active = 0;
  let trialing = 0;
  let expiringSoon = 0;
  let expired = 0;
  let cancelled = 0;
  let noPlan = 0;
  let mrr = 0;
  for (const o of organizers) {
    const sub = o.subscriptions[0];
    if (!sub) {
      noPlan++;
      continue;
    }
    if (sub.status === "active") active++;
    else if (sub.status === "trialing") trialing++;
    else if (sub.status === "expired") expired++;
    else if (sub.status === "cancelled") cancelled++;

    if (sub.status === "active" || sub.status === "trialing") {
      const endDate = sub.status === "trialing" ? sub.trialEndsAt : sub.currentPeriodEnd;
      if (endDate && endDate >= now && endDate <= soonHorizon) expiringSoon++;

      // MRR: only billingInterval "monthly" and "yearly" (normalized to a
      // monthly figure) are recurring by definition — "one_time" and
      // "custom" plans are deliberately excluded, not counted as zero-value
      // recurring revenue. Most seeded plans currently have price 0.00
      // (Phase 19A/20A: no commercial price has been finalized yet — see
      // Plan's own schema comment) so this can legitimately read near zero.
      const price = Number(sub.plan.price);
      if (sub.plan.billingInterval === "monthly") mrr += price;
      else if (sub.plan.billingInterval === "yearly") mrr += price / 12;
    }
  }

  function isExpiringSoon(sub: (typeof organizers)[number]["subscriptions"][number] | undefined): boolean {
    if (!sub || (sub.status !== "active" && sub.status !== "trialing")) return false;
    const endDate = sub.status === "trialing" ? sub.trialEndsAt : sub.currentPeriodEnd;
    return !!endDate && endDate >= now && endDate <= soonHorizon;
  }

  const filtered = organizers
    .filter((o) => !parsed.data.status || (o.subscriptions[0]?.status ?? null) === parsed.data.status)
    .filter((o) => !parsed.data.expiringSoon || isExpiringSoon(o.subscriptions[0]));

  const rows = await Promise.all(
    filtered.map(async (o) => {
      const sub = o.subscriptions[0] ?? null;
      const usage = sub ? (await getOrganizerEntitlement(o.id)).usage : null;
      return {
        organizerId: o.id,
        organizerName: o.name,
        suspended: o.suspended,
        subscription: sub,
        usage,
      };
    })
  );

  res.json({
    summary: { active, trialing, expiringSoon, expired, cancelled, noPlan, mrr },
    subscriptions: rows,
  });
});

// Phase 20D: unified with entitlementService.ts's structured error shape
// ({error: {code, message, ...}}) rather than the flat {error: "string",
// code: "..."} shape this route used before — the two commercial error
// families (subscription lifecycle vs. entitlement) now look identical to
// any frontend consumer, and both are handled by the same apiClient.ts
// extraction logic (a plain string OR an object with its own .message).
function handleSubscriptionError(res: Response, err: unknown) {
  if (err instanceof SubscriptionError) {
    const status = err.code === "SUBSCRIPTION_NOT_FOUND" || err.code === "PLAN_NOT_FOUND" ? 404 : 400;
    return res.status(status).json({ error: { code: err.code, message: err.message } });
  }
  throw err;
}

const changePlanSchema = z.object({ planId: z.string() });

router.patch("/organizers/:id/subscription/plan", async (req, res) => {
  const organizer = await prisma.organizer.findUnique({ where: { id: req.params.id } });
  if (!organizer) return res.status(404).json({ error: "Organizer not found" });

  const subscription = await prisma.subscription.findFirst({ where: { organizerId: organizer.id }, orderBy: { createdAt: "desc" } });
  if (!subscription) return res.status(404).json({ error: "This organizer has no subscription yet" });

  const parsed = changePlanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const updated = await changePlan({ subscriptionId: subscription.id, newPlanId: parsed.data.planId, actorUserId: req.user!.id });
    res.json({ subscription: updated });
  } catch (err) {
    handleSubscriptionError(res, err);
  }
});

const activateSchema = z.object({ currentPeriodStart: dateString.optional(), currentPeriodEnd: dateString.optional() });

router.post("/organizers/:id/subscription/activate", async (req, res) => {
  const organizer = await prisma.organizer.findUnique({ where: { id: req.params.id } });
  if (!organizer) return res.status(404).json({ error: "Organizer not found" });

  const subscription = await prisma.subscription.findFirst({ where: { organizerId: organizer.id }, orderBy: { createdAt: "desc" } });
  if (!subscription) return res.status(404).json({ error: "This organizer has no subscription yet" });

  const parsed = activateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const updated = await activateSubscription({
      subscriptionId: subscription.id,
      actorUserId: req.user!.id,
      currentPeriodStart: parsed.data.currentPeriodStart ? new Date(parsed.data.currentPeriodStart) : undefined,
      currentPeriodEnd: parsed.data.currentPeriodEnd ? new Date(parsed.data.currentPeriodEnd) : undefined,
    });
    res.json({ subscription: updated });
  } catch (err) {
    handleSubscriptionError(res, err);
  }
});

router.post("/organizers/:id/subscription/cancel", async (req, res) => {
  const organizer = await prisma.organizer.findUnique({ where: { id: req.params.id } });
  if (!organizer) return res.status(404).json({ error: "Organizer not found" });

  const subscription = await prisma.subscription.findFirst({ where: { organizerId: organizer.id }, orderBy: { createdAt: "desc" } });
  if (!subscription) return res.status(404).json({ error: "This organizer has no subscription yet" });

  try {
    const updated = await cancelSubscription({ subscriptionId: subscription.id, actorUserId: req.user!.id });
    res.json({ subscription: updated });
  } catch (err) {
    handleSubscriptionError(res, err);
  }
});

router.post("/organizers/:id/subscription/expire", async (req, res) => {
  const organizer = await prisma.organizer.findUnique({ where: { id: req.params.id } });
  if (!organizer) return res.status(404).json({ error: "Organizer not found" });

  const subscription = await prisma.subscription.findFirst({ where: { organizerId: organizer.id }, orderBy: { createdAt: "desc" } });
  if (!subscription) return res.status(404).json({ error: "This organizer has no subscription yet" });

  try {
    const updated = await expireSubscription({ subscriptionId: subscription.id, actorUserId: req.user!.id });
    res.json({ subscription: updated });
  } catch (err) {
    handleSubscriptionError(res, err);
  }
});

router.get("/organizers/:id/exhibitors", async (req, res) => {
  const organizer = await prisma.organizer.findUnique({ where: { id: req.params.id } });
  if (!organizer) return res.status(404).json({ error: "Organizer not found" });

  const participations = await prisma.exhibitionExhibitor.findMany({
    where: { exhibition: { organizerId: organizer.id } },
    include: {
      business: { select: { id: true, companyName: true, kycStatus: true } },
      exhibition: { select: { id: true, name: true } },
      stalls: { select: { id: true, code: true, status: true, price: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ participations });
});

router.get("/organizers/:id/payments", async (req, res) => {
  const organizer = await prisma.organizer.findUnique({ where: { id: req.params.id } });
  if (!organizer) return res.status(404).json({ error: "Organizer not found" });

  const payments = await prisma.payment.findMany({
    where: {
      OR: [
        { ticketBooking: { exhibition: { organizerId: organizer.id } } },
        { stallBooking: { exhibition: { organizerId: organizer.id } } },
      ],
    },
    include: {
      ticketBooking: { select: { id: true, exhibition: { select: { name: true } } } },
      stallBooking: { select: { id: true, exhibition: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  res.json({ payments });
});

router.get("/organizers/:id/audit", async (req, res) => {
  const organizer = await prisma.organizer.findUnique({ where: { id: req.params.id } });
  if (!organizer) return res.status(404).json({ error: "Organizer not found" });

  const memberUserIds = (
    await prisma.organizerMembership.findMany({ where: { organizerId: organizer.id }, select: { userId: true } })
  )
    .map((m) => m.userId)
    .filter((id): id is string => !!id);

  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entityType: "Organizer", entityId: organizer.id },
        ...(memberUserIds.length ? [{ actorUserId: { in: memberUserIds } }] : []),
      ],
    },
    include: { actorUser: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json({ logs });
});

// -------- Cross-tenant read-only views + entity detail management --------

const exhibitionsListQuerySchema = z.object({
  search: z.string().optional(),
  organizerId: z.string().optional(),
  city: z.string().optional(),
  status: z.enum(["draft", "live", "paused", "completed"]).optional(),
});

interface ExhibitionListRow {
  id: string;
  name: string;
  city: string | null;
  venue: string | null;
  startDate: Date | null;
  endDate: Date | null;
  status: string;
  createdAt: Date;
  organizer_id: string;
  organizer_name: string;
  total_stalls: number;
  booked_stalls: number;
  exhibitors_count: number;
  visitors_count: number;
  tickets_sold: number;
  ticket_revenue: Prisma.Decimal | number | string;
  stall_revenue: Prisma.Decimal | number | string;
}

router.get("/exhibitions", async (req, res) => {
  const parsed = exhibitionsListQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { search, organizerId, city, status } = parsed.data;

  const rows = await prisma.$queryRaw<ExhibitionListRow[]>`
    WITH stall_stats AS (
      SELECT "exhibitionId" AS exhibition_id, COUNT(*)::int AS total_stalls,
        COUNT(*) FILTER (WHERE status IN ('reserved', 'sold'))::int AS booked_stalls
      FROM stalls GROUP BY "exhibitionId"
    ),
    exhibitor_counts AS (
      SELECT "exhibitionId" AS exhibition_id, COUNT(DISTINCT "exhibitorBusinessId")::int AS exhibitors
      FROM exhibition_exhibitors GROUP BY "exhibitionId"
    ),
    visitor_stats AS (
      SELECT "exhibitionId" AS exhibition_id,
        COUNT(*) FILTER (WHERE "paymentStatus" = 'paid')::int AS tickets_sold,
        COUNT(DISTINCT "buyerUserId") FILTER (WHERE "paymentStatus" = 'paid')::int AS visitors
      FROM ticket_bookings GROUP BY "exhibitionId"
    ),
    revenue AS (
      SELECT exhibition_id,
        COALESCE(SUM(amount) FILTER (WHERE kind = 'ticket'), 0) AS ticket_revenue,
        COALESCE(SUM(amount) FILTER (WHERE kind = 'stall'), 0) AS stall_revenue
      FROM (
        SELECT tb."exhibitionId" AS exhibition_id, p.amount, 'ticket' AS kind
        FROM payments p JOIN ticket_bookings tb ON tb."paymentId" = p.id WHERE p.status = 'paid'
        UNION ALL
        SELECT sb."exhibitionId" AS exhibition_id, p.amount, 'stall' AS kind
        FROM payments p JOIN stall_bookings sb ON sb."paymentId" = p.id WHERE p.status = 'paid'
      ) paid_rows GROUP BY exhibition_id
    )
    SELECT e.id, e.name, e.city, e.venue, e."startDate", e."endDate", e.status, e."createdAt",
      o.id AS organizer_id, o.name AS organizer_name,
      COALESCE(ss.total_stalls, 0) AS total_stalls, COALESCE(ss.booked_stalls, 0) AS booked_stalls,
      COALESCE(ec.exhibitors, 0) AS exhibitors_count,
      COALESCE(vs.visitors, 0) AS visitors_count, COALESCE(vs.tickets_sold, 0) AS tickets_sold,
      COALESCE(r.ticket_revenue, 0) AS ticket_revenue, COALESCE(r.stall_revenue, 0) AS stall_revenue
    FROM exhibitions e
    JOIN organizers o ON o.id = e."organizerId"
    LEFT JOIN stall_stats ss ON ss.exhibition_id = e.id
    LEFT JOIN exhibitor_counts ec ON ec.exhibition_id = e.id
    LEFT JOIN visitor_stats vs ON vs.exhibition_id = e.id
    LEFT JOIN revenue r ON r.exhibition_id = e.id
    WHERE (${search ?? null}::text IS NULL OR e.name ILIKE '%' || ${search ?? null}::text || '%')
      AND (${organizerId ?? null}::text IS NULL OR o.id = ${organizerId ?? null}::text)
      AND (${city ?? null}::text IS NULL OR e.city ILIKE '%' || ${city ?? null}::text || '%')
      AND (${status ?? null}::text IS NULL OR e.status::text = ${status ?? null}::text)
    ORDER BY e."createdAt" DESC
  `;

  const exhibitions = rows.map((r) => ({
    id: r.id,
    name: r.name,
    city: r.city,
    venue: r.venue,
    startDate: r.startDate,
    endDate: r.endDate,
    status: r.status,
    createdAt: r.createdAt,
    organizer: { id: r.organizer_id, name: r.organizer_name },
    totalStalls: r.total_stalls,
    bookedStalls: r.booked_stalls,
    availableStalls: r.total_stalls - r.booked_stalls,
    exhibitorsCount: r.exhibitors_count,
    visitorsCount: r.visitors_count,
    ticketsSold: r.tickets_sold,
    ticketRevenue: Number(r.ticket_revenue),
    stallRevenue: Number(r.stall_revenue),
  }));

  res.json({ exhibitions });
});

async function loadPlatformExhibition(id: string) {
  return prisma.exhibition.findUnique({ where: { id }, include: { organizer: { select: { id: true, name: true } } } });
}

router.get("/exhibitions/:id", async (req, res) => {
  const exhibition = await loadPlatformExhibition(req.params.id);
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });

  const [stallStats, exhibitorsCount, ticketAgg, revenueAgg] = await Promise.all([
    prisma.stall.groupBy({ by: ["status"], where: { exhibitionId: exhibition.id }, _count: { _all: true } }),
    prisma.exhibitionExhibitor.count({ where: { exhibitionId: exhibition.id } }),
    prisma.ticketBooking.aggregate({ where: { exhibitionId: exhibition.id, paymentStatus: "paid" }, _count: { _all: true } }),
    prisma.payment.aggregate({
      where: { OR: [{ ticketBooking: { exhibitionId: exhibition.id } }, { stallBooking: { exhibitionId: exhibition.id } }], status: "paid" },
      _sum: { amount: true },
    }),
  ]);
  const totalStalls = stallStats.reduce((s, r) => s + r._count._all, 0);
  const bookedStalls = stallStats.filter((r) => r.status === "reserved" || r.status === "sold").reduce((s, r) => s + r._count._all, 0);

  res.json({
    exhibition: {
      ...exhibition,
      totalStalls,
      bookedStalls,
      availableStalls: totalStalls - bookedStalls,
      exhibitorsCount,
      ticketsSold: ticketAgg._count._all,
      totalRevenue: Number(revenueAgg._sum.amount ?? 0),
    },
  });
});

router.get("/exhibitions/:id/stalls", async (req, res) => {
  const exhibition = await loadPlatformExhibition(req.params.id);
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });

  const stalls = await prisma.stall.findMany({
    where: { exhibitionId: exhibition.id },
    include: {
      exhibitionExhibitor: { include: { business: { select: { id: true, companyName: true } } } },
      bookings: { orderBy: { createdAt: "desc" }, take: 1, select: { paymentStatus: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  res.json({ stalls });
});

const adminStallActionSchema = z.object({
  action: z.enum(["assign", "release"]).optional(),
  exhibitionExhibitorId: z.string().optional(),
  code: z.string().nullable().optional(),
  stallType: z.enum(["premium", "standard", "basic"]).nullable().optional(),
  size: z.string().nullable().optional(),
  price: z.number().nonnegative().optional(),
});

// Manual admin override for support/correction purposes — NOT the paid
// booking flow (that's exhibitorParticipations.ts's reserve+pay path, which
// this never touches: it updates the Stall record only, never creates a
// StallBooking/Payment). Guarded updateMany (mirrors that same route's
// TOCTOU-safe pattern) so two concurrent admin assigns can't double-book.
router.patch("/exhibitions/:id/stalls/:stallId", async (req, res) => {
  const exhibition = await loadPlatformExhibition(req.params.id);
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });

  const parsed = adminStallActionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { action, exhibitionExhibitorId, ...fields } = parsed.data;

  const existing = await prisma.stall.findFirst({ where: { id: req.params.stallId, exhibitionId: exhibition.id } });
  if (!existing) return res.status(404).json({ error: "Stall not found" });

  if (action === "assign") {
    if (!exhibitionExhibitorId) return res.status(400).json({ error: "exhibitionExhibitorId is required to assign a stall" });
    const participation = await prisma.exhibitionExhibitor.findFirst({
      where: { id: exhibitionExhibitorId, exhibitionId: exhibition.id, status: { notIn: ["rejected", "cancelled"] } },
    });
    if (!participation) return res.status(400).json({ error: "That exhibitor participation isn't eligible for a stall assignment" });

    const claimed = await prisma.stall.updateMany({
      where: { id: existing.id, status: "available" },
      data: { status: "reserved", exhibitionExhibitorId: participation.id },
    });
    if (claimed.count === 0) return res.status(409).json({ error: "This stall is no longer available — someone else may have just claimed it" });

    await logAudit({
      actorUserId: req.user!.id,
      action: "platform.stall_assigned",
      entityType: "Stall",
      entityId: existing.id,
      metadata: { exhibitionId: exhibition.id, exhibitionExhibitorId: participation.id },
    });
  } else if (action === "release") {
    await prisma.stall.update({ where: { id: existing.id }, data: { status: "available", exhibitionExhibitorId: null } });
    await logAudit({
      actorUserId: req.user!.id,
      action: "platform.stall_released",
      entityType: "Stall",
      entityId: existing.id,
      metadata: { exhibitionId: exhibition.id, previousExhibitionExhibitorId: existing.exhibitionExhibitorId },
    });
  } else if (Object.keys(fields).length > 0) {
    await prisma.stall.update({ where: { id: existing.id }, data: fields });
    await logAudit({
      actorUserId: req.user!.id,
      action: "platform.stall_updated",
      entityType: "Stall",
      entityId: existing.id,
      metadata: { exhibitionId: exhibition.id, changes: fields },
    });
  }

  const stall = await prisma.stall.findUnique({
    where: { id: existing.id },
    include: { exhibitionExhibitor: { include: { business: { select: { id: true, companyName: true } } } } },
  });
  res.json({ stall });
});

router.get("/exhibitions/:id/tickets", async (req, res) => {
  const exhibition = await loadPlatformExhibition(req.params.id);
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });

  const ticketTypes = await prisma.ticketType.findMany({
    where: { exhibitionId: exhibition.id },
    include: {
      bookings: { select: { quantity: true, amountPaid: true, paymentStatus: true, checkIns: { select: { id: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  const tickets = ticketTypes.map((t) => {
    const paidBookings = t.bookings.filter((b) => b.paymentStatus === "paid");
    const sold = paidBookings.reduce((s, b) => s + b.quantity, 0);
    const revenue = paidBookings.reduce((s, b) => s + Number(b.amountPaid), 0);
    const checkedIn = paidBookings.reduce((s, b) => s + b.checkIns.length, 0);
    return {
      id: t.id,
      name: t.name,
      price: Number(t.price),
      quantity: t.quantity,
      visible: t.visible,
      sold,
      remaining: Math.max(0, t.quantity - sold),
      checkedIn,
      revenue,
    };
  });
  res.json({ tickets });
});

const adminTicketUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  price: z.number().nonnegative().optional(),
  quantity: z.number().int().nonnegative().optional(),
  visible: z.boolean().optional(),
});

router.patch("/exhibitions/:id/tickets/:ticketTypeId", async (req, res) => {
  const exhibition = await loadPlatformExhibition(req.params.id);
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });

  const parsed = adminTicketUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const existing = await prisma.ticketType.findFirst({ where: { id: req.params.ticketTypeId, exhibitionId: exhibition.id } });
  if (!existing) return res.status(404).json({ error: "Ticket type not found" });

  if (parsed.data.quantity !== undefined) {
    const soldCount = await prisma.ticketBooking.count({ where: { ticketTypeId: existing.id, paymentStatus: "paid" } });
    if (parsed.data.quantity < soldCount) {
      return res.status(400).json({ error: `Cannot set capacity below ${soldCount} — that many tickets are already sold.` });
    }
  }

  const ticket = await prisma.ticketType.update({ where: { id: existing.id }, data: parsed.data });
  await logAudit({
    actorUserId: req.user!.id,
    action: "platform.ticket_type_updated",
    entityType: "TicketType",
    entityId: ticket.id,
    metadata: { exhibitionId: exhibition.id, before: { name: existing.name, price: Number(existing.price), quantity: existing.quantity, visible: existing.visible }, after: parsed.data },
  });
  res.json({ ticket });
});

router.get("/exhibitions/:id/exhibitors", async (req, res) => {
  const exhibition = await loadPlatformExhibition(req.params.id);
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });

  const participations = await prisma.exhibitionExhibitor.findMany({
    where: { exhibitionId: exhibition.id },
    include: {
      business: { select: { id: true, companyName: true, kycStatus: true } },
      stalls: { select: { id: true, code: true, status: true, price: true } },
      stallBookings: { orderBy: { createdAt: "desc" }, take: 1, select: { paymentStatus: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ participations });
});

router.get("/exhibitions/:id/visitors", async (req, res) => {
  const exhibition = await loadPlatformExhibition(req.params.id);
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });

  const bookings = await prisma.ticketBooking.findMany({
    where: { exhibitionId: exhibition.id },
    include: {
      buyerUser: { select: { id: true, fullName: true, email: true } },
      ticketType: { select: { name: true } },
      checkIns: { orderBy: { scannedAt: "desc" }, take: 1, select: { scannedAt: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  res.json({ bookings });
});

router.get("/exhibitions/:id/payments", async (req, res) => {
  const exhibition = await loadPlatformExhibition(req.params.id);
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });

  const payments = await prisma.payment.findMany({
    where: { OR: [{ ticketBooking: { exhibitionId: exhibition.id } }, { stallBooking: { exhibitionId: exhibition.id } }] },
    include: {
      ticketBooking: { select: { id: true, buyerUser: { select: { fullName: true, email: true } } } },
      stallBooking: { select: { id: true, exhibitionExhibitor: { select: { business: { select: { companyName: true } } } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  res.json({ payments });
});

router.get("/exhibitions/:id/analytics", async (req, res) => {
  const exhibition = await loadPlatformExhibition(req.params.id);
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });

  const analytics = await getExhibitionAnalytics(exhibition.id, { includeRevenue: true, includeLeads: true });
  res.json(analytics);
});

// -------- Exhibitors --------

const exhibitorsListQuerySchema = z.object({
  search: z.string().optional(),
  kycStatus: z.enum(["pending", "verified"]).optional(),
  suspended: z.enum(["true", "false"]).optional(),
  category: z.string().optional(),
  exhibitionId: z.string().optional(),
});

interface ExhibitorListRow {
  id: string;
  companyName: string | null;
  businessType: string | null;
  kycStatus: string;
  suspended: boolean;
  createdAt: Date;
  owner_id: string;
  owner_name: string | null;
  owner_email: string;
  owner_phone: string | null;
  participations_count: number;
  stalls_booked: number;
  total_paid: Prisma.Decimal | number | string;
  outstanding_amount: Prisma.Decimal | number | string;
}

router.get("/exhibitors", async (req, res) => {
  const parsed = exhibitorsListQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { search, kycStatus, suspended, category, exhibitionId } = parsed.data;

  const rows = await prisma.$queryRaw<ExhibitorListRow[]>`
    WITH participation_counts AS (
      SELECT "exhibitorBusinessId" AS business_id, COUNT(*)::int AS participations
      FROM exhibition_exhibitors GROUP BY "exhibitorBusinessId"
    ),
    stall_counts AS (
      SELECT ee."exhibitorBusinessId" AS business_id, COUNT(s.id)::int AS stalls_booked
      FROM stalls s JOIN exhibition_exhibitors ee ON ee.id = s."exhibitionExhibitorId"
      GROUP BY ee."exhibitorBusinessId"
    ),
    outstanding AS (
      SELECT ee."exhibitorBusinessId" AS business_id, COALESCE(SUM(s.price), 0) AS outstanding
      FROM stalls s JOIN exhibition_exhibitors ee ON ee.id = s."exhibitionExhibitorId"
      WHERE s.status = 'reserved' GROUP BY ee."exhibitorBusinessId"
    ),
    paid AS (
      SELECT ee."exhibitorBusinessId" AS business_id, COALESCE(SUM(p.amount), 0) AS total_paid
      FROM payments p JOIN stall_bookings sb ON sb."paymentId" = p.id JOIN exhibition_exhibitors ee ON ee.id = sb."exhibitionExhibitorId"
      WHERE p.status = 'paid' GROUP BY ee."exhibitorBusinessId"
    )
    SELECT b.id, b."companyName", b."businessType", b."kycStatus", b.suspended, b."createdAt",
      u.id AS owner_id, u."fullName" AS owner_name, u.email AS owner_email, u.phone AS owner_phone,
      COALESCE(pc.participations, 0) AS participations_count,
      COALESCE(sc.stalls_booked, 0) AS stalls_booked,
      COALESCE(pd.total_paid, 0) AS total_paid,
      COALESCE(o.outstanding, 0) AS outstanding_amount
    FROM exhibitor_businesses b
    JOIN users u ON u.id = b."ownerId"
    LEFT JOIN participation_counts pc ON pc.business_id = b.id
    LEFT JOIN stall_counts sc ON sc.business_id = b.id
    LEFT JOIN paid pd ON pd.business_id = b.id
    LEFT JOIN outstanding o ON o.business_id = b.id
    WHERE (${search ?? null}::text IS NULL OR b."companyName" ILIKE '%' || ${search ?? null}::text || '%' OR u.email ILIKE '%' || ${search ?? null}::text || '%')
      AND (${kycStatus ?? null}::text IS NULL OR b."kycStatus"::text = ${kycStatus ?? null}::text)
      AND (${suspended ?? null}::text IS NULL OR b.suspended = (${suspended ?? null}::text = 'true'))
      AND (${category ?? null}::text IS NULL OR b."businessType" ILIKE '%' || ${category ?? null}::text || '%')
      AND (${exhibitionId ?? null}::text IS NULL OR EXISTS (
        SELECT 1 FROM exhibition_exhibitors ee2 WHERE ee2."exhibitorBusinessId" = b.id AND ee2."exhibitionId" = ${exhibitionId ?? null}::text
      ))
    ORDER BY b."createdAt" DESC
  `;

  const exhibitors = rows.map((r) => ({
    id: r.id,
    companyName: r.companyName,
    businessType: r.businessType,
    kycStatus: r.kycStatus,
    suspended: r.suspended,
    createdAt: r.createdAt,
    owner: { id: r.owner_id, fullName: r.owner_name, email: r.owner_email, phone: r.owner_phone },
    participationsCount: r.participations_count,
    stallsBooked: r.stalls_booked,
    totalPaid: Number(r.total_paid),
    outstandingAmount: Number(r.outstanding_amount),
  }));

  res.json({ exhibitors });
});

router.get("/exhibitors/:id", async (req, res) => {
  const exhibitor = await prisma.exhibitorBusiness.findUnique({
    where: { id: req.params.id },
    include: { owner: { select: { id: true, fullName: true, email: true, phone: true } }, _count: { select: { participations: true } } },
  });
  if (!exhibitor) return res.status(404).json({ error: "Exhibitor not found" });
  res.json({ exhibitor });
});

const exhibitorProfileSchema = z.object({
  companyName: z.string().min(1).optional(),
  businessType: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  gst: z.string().nullable().optional(),
  pan: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  taxCategory: z.string().nullable().optional(),
  invoicePreference: z.string().nullable().optional(),
});

router.patch("/exhibitors/:id", async (req, res) => {
  const parsed = exhibitorProfileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  if (Object.keys(parsed.data).length === 0) return res.status(400).json({ error: "No fields to update" });

  const existing = await prisma.exhibitorBusiness.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Exhibitor not found" });

  const exhibitor = await prisma.exhibitorBusiness.update({ where: { id: existing.id }, data: parsed.data });
  await logAudit({
    actorUserId: req.user!.id,
    action: "platform.exhibitor_updated",
    entityType: "ExhibitorBusiness",
    entityId: exhibitor.id,
    metadata: { before: exhibitorProfileSchema.parse(existing), after: parsed.data },
  });
  res.json({ exhibitor });
});

router.patch("/exhibitors/:id/kyc", async (req, res) => {
  const parsed = kycSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const existing = await prisma.exhibitorBusiness.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Exhibitor not found" });

  const exhibitor = await prisma.exhibitorBusiness.update({
    where: { id: existing.id },
    data: { kycStatus: parsed.data.verified ? "verified" : "pending" },
  });
  await logAudit({
    actorUserId: req.user!.id,
    action: parsed.data.verified ? "platform.exhibitor_kyc_verified" : "platform.exhibitor_kyc_reverted",
    entityType: "ExhibitorBusiness",
    entityId: exhibitor.id,
    metadata: { previousStatus: existing.kycStatus },
  });
  res.json({ exhibitor });
});

router.patch("/exhibitors/:id/suspend", async (req, res) => {
  const parsed = suspendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const existing = await prisma.exhibitorBusiness.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Exhibitor not found" });

  const exhibitor = await prisma.exhibitorBusiness.update({
    where: { id: existing.id },
    data: {
      suspended: parsed.data.suspended,
      suspendedReason: parsed.data.suspended ? (parsed.data.reason ?? null) : null,
      suspendedAt: parsed.data.suspended ? new Date() : null,
    },
  });
  await logAudit({
    actorUserId: req.user!.id,
    action: parsed.data.suspended ? "platform.exhibitor_suspended" : "platform.exhibitor_activated",
    entityType: "ExhibitorBusiness",
    entityId: exhibitor.id,
    metadata: { reason: parsed.data.reason },
  });
  res.json({ exhibitor });
});

router.get("/exhibitors/:id/exhibitions", async (req, res) => {
  const exhibitor = await prisma.exhibitorBusiness.findUnique({ where: { id: req.params.id } });
  if (!exhibitor) return res.status(404).json({ error: "Exhibitor not found" });

  const participations = await prisma.exhibitionExhibitor.findMany({
    where: { exhibitorBusinessId: exhibitor.id },
    include: {
      exhibition: { select: { id: true, name: true, city: true, startDate: true, endDate: true, status: true } },
      stalls: { select: { id: true, code: true, status: true, price: true } },
      stallBookings: { orderBy: { createdAt: "desc" }, take: 1, select: { paymentStatus: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ participations });
});

router.get("/exhibitors/:id/payments", async (req, res) => {
  const exhibitor = await prisma.exhibitorBusiness.findUnique({ where: { id: req.params.id } });
  if (!exhibitor) return res.status(404).json({ error: "Exhibitor not found" });

  const payments = await prisma.payment.findMany({
    where: { stallBooking: { exhibitionExhibitor: { exhibitorBusinessId: exhibitor.id } } },
    include: { stallBooking: { include: { exhibition: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ payments });
});

router.get("/exhibitors/:id/leads", async (req, res) => {
  const exhibitor = await prisma.exhibitorBusiness.findUnique({ where: { id: req.params.id } });
  if (!exhibitor) return res.status(404).json({ error: "Exhibitor not found" });

  const leads = await prisma.lead.findMany({
    where: { exhibitionExhibitor: { exhibitorBusinessId: exhibitor.id } },
    include: { exhibitionExhibitor: { select: { exhibition: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  res.json({ leads });
});

router.get("/exhibitors/:id/audit", async (req, res) => {
  const exhibitor = await prisma.exhibitorBusiness.findUnique({ where: { id: req.params.id } });
  if (!exhibitor) return res.status(404).json({ error: "Exhibitor not found" });

  const memberUserIds = (
    await prisma.exhibitorMembership.findMany({ where: { exhibitorBusinessId: exhibitor.id }, select: { userId: true } })
  )
    .map((m) => m.userId)
    .filter((id): id is string => !!id);

  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [{ entityType: "ExhibitorBusiness", entityId: exhibitor.id }, ...(memberUserIds.length ? [{ actorUserId: { in: memberUserIds } }] : [])],
    },
    include: { actorUser: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json({ logs });
});

// -------- Visitors --------

const visitorsListQuerySchema = z.object({
  search: z.string().optional(),
  suspended: z.enum(["true", "false"]).optional(),
});

interface VisitorListRow {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  suspended: boolean;
  createdAt: Date;
  tickets_count: number;
  exhibitions_count: number;
  last_purchase: Date | null;
  checkins_count: number;
  total_spent: Prisma.Decimal | number | string;
}

router.get("/visitors", async (req, res) => {
  const parsed = visitorsListQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { search, suspended } = parsed.data;

  const rows = await prisma.$queryRaw<VisitorListRow[]>`
    WITH ticket_stats AS (
      SELECT "buyerUserId" AS user_id, COUNT(*)::int AS tickets, COUNT(DISTINCT "exhibitionId")::int AS exhibitions, MAX("createdAt") AS last_purchase
      FROM ticket_bookings WHERE "buyerUserId" IS NOT NULL GROUP BY "buyerUserId"
    ),
    checkin_stats AS (
      SELECT tb."buyerUserId" AS user_id, COUNT(ci.id)::int AS checkins
      FROM check_ins ci JOIN ticket_bookings tb ON tb.id = ci."ticketBookingId"
      WHERE tb."buyerUserId" IS NOT NULL GROUP BY tb."buyerUserId"
    ),
    spend AS (
      SELECT tb."buyerUserId" AS user_id, COALESCE(SUM(p.amount), 0) AS total_spent
      FROM payments p JOIN ticket_bookings tb ON tb."paymentId" = p.id
      WHERE p.status = 'paid' AND tb."buyerUserId" IS NOT NULL GROUP BY tb."buyerUserId"
    )
    SELECT u.id, u."fullName", u.email, u.phone, u.suspended, u."createdAt",
      ts.tickets AS tickets_count, ts.exhibitions AS exhibitions_count, ts.last_purchase,
      COALESCE(cs.checkins, 0) AS checkins_count, COALESCE(sp.total_spent, 0) AS total_spent
    FROM users u
    JOIN ticket_stats ts ON ts.user_id = u.id
    LEFT JOIN checkin_stats cs ON cs.user_id = u.id
    LEFT JOIN spend sp ON sp.user_id = u.id
    WHERE (${search ?? null}::text IS NULL OR u.email ILIKE '%' || ${search ?? null}::text || '%' OR u."fullName" ILIKE '%' || ${search ?? null}::text || '%')
      AND (${suspended ?? null}::text IS NULL OR u.suspended = (${suspended ?? null}::text = 'true'))
    ORDER BY u."createdAt" DESC
    LIMIT 200
  `;

  const visitors = rows.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    email: r.email,
    phone: r.phone,
    suspended: r.suspended,
    createdAt: r.createdAt,
    ticketsCount: r.tickets_count,
    exhibitionsCount: r.exhibitions_count,
    lastPurchase: r.last_purchase,
    checkInsCount: r.checkins_count,
    totalSpent: Number(r.total_spent),
  }));
  res.json({ visitors });
});

router.get("/visitors/:id", async (req, res) => {
  const user = await prisma.user.findFirst({ where: { id: req.params.id, ticketBookings: { some: {} } } });
  if (!user) return res.status(404).json({ error: "Visitor not found" });

  const [ticketsCount, checkInsCount, spendAgg, exhibitionsCount] = await Promise.all([
    prisma.ticketBooking.count({ where: { buyerUserId: user.id } }),
    prisma.checkIn.count({ where: { ticketBooking: { buyerUserId: user.id } } }),
    prisma.payment.aggregate({ where: { ticketBooking: { buyerUserId: user.id }, status: "paid" }, _sum: { amount: true } }),
    prisma.ticketBooking.findMany({ where: { buyerUserId: user.id }, distinct: ["exhibitionId"], select: { exhibitionId: true } }),
  ]);

  res.json({
    visitor: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      suspended: user.suspended,
      suspendedReason: user.suspendedReason,
      suspendedAt: user.suspendedAt,
      createdAt: user.createdAt,
      ticketsCount,
      checkInsCount,
      totalSpent: Number(spendAgg._sum.amount ?? 0),
      exhibitionsCount: exhibitionsCount.length,
    },
  });
});

router.patch("/visitors/:id/suspend", async (req, res) => {
  const parsed = suspendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const existing = await prisma.user.findFirst({ where: { id: req.params.id, ticketBookings: { some: {} } } });
  if (!existing) return res.status(404).json({ error: "Visitor not found" });

  const user = await prisma.user.update({
    where: { id: existing.id },
    data: {
      suspended: parsed.data.suspended,
      suspendedReason: parsed.data.suspended ? (parsed.data.reason ?? null) : null,
      suspendedAt: parsed.data.suspended ? new Date() : null,
    },
  });
  await logAudit({
    actorUserId: req.user!.id,
    action: parsed.data.suspended ? "platform.visitor_suspended" : "platform.visitor_activated",
    entityType: "User",
    entityId: user.id,
    metadata: { reason: parsed.data.reason },
  });
  res.json({ visitor: { id: user.id, suspended: user.suspended, suspendedReason: user.suspendedReason, suspendedAt: user.suspendedAt } });
});

router.get("/visitors/:id/tickets", async (req, res) => {
  const user = await prisma.user.findFirst({ where: { id: req.params.id, ticketBookings: { some: {} } } });
  if (!user) return res.status(404).json({ error: "Visitor not found" });

  const bookings = await prisma.ticketBooking.findMany({
    where: { buyerUserId: user.id },
    include: { exhibition: { select: { id: true, name: true } }, ticketType: { select: { name: true } }, checkIns: { select: { id: true, scannedAt: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ bookings });
});

router.get("/visitors/:id/payments", async (req, res) => {
  const user = await prisma.user.findFirst({ where: { id: req.params.id, ticketBookings: { some: {} } } });
  if (!user) return res.status(404).json({ error: "Visitor not found" });

  const payments = await prisma.payment.findMany({
    where: { ticketBooking: { buyerUserId: user.id } },
    include: { ticketBooking: { include: { exhibition: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ payments });
});

router.get("/visitors/:id/checkins", async (req, res) => {
  const user = await prisma.user.findFirst({ where: { id: req.params.id, ticketBookings: { some: {} } } });
  if (!user) return res.status(404).json({ error: "Visitor not found" });

  const checkIns = await prisma.checkIn.findMany({
    where: { ticketBooking: { buyerUserId: user.id } },
    include: { ticketBooking: { include: { exhibition: { select: { name: true } } } } },
    orderBy: { scannedAt: "desc" },
  });
  res.json({ checkIns });
});

router.get("/visitors/:id/audit", async (req, res) => {
  const user = await prisma.user.findFirst({ where: { id: req.params.id, ticketBookings: { some: {} } } });
  if (!user) return res.status(404).json({ error: "Visitor not found" });

  const logs = await prisma.auditLog.findMany({
    where: { OR: [{ entityType: "User", entityId: user.id }, { actorUserId: user.id }] },
    include: { actorUser: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json({ logs });
});

const paymentStatusSchema = z.enum(["created", "pending", "paid", "failed", "cancelled", "refunded", "partially_refunded"]).optional();

router.get("/payments", async (req, res) => {
  const parsedStatus = paymentStatusSchema.safeParse(req.query.status);
  if (!parsedStatus.success) return res.status(400).json({ error: "Invalid status filter" });

  const payments = await prisma.payment.findMany({
    where: parsedStatus.data ? { status: parsedStatus.data } : undefined,
    include: {
      ticketBooking: { select: { id: true, exhibition: { select: { name: true } } } },
      stallBooking: { select: { id: true, exhibition: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json({ payments });
});

// -------- Audit logs --------

const auditQuerySchema = z.object({
  action: z.string().optional(),
  entityType: z.string().optional(),
  actorUserId: z.string().optional(),
  from: dateString.optional(),
  to: dateString.optional(),
});

router.get("/audit-logs", async (req, res) => {
  const parsed = auditQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { action, entityType, actorUserId, from, to } = parsed.data;

  const logs = await prisma.auditLog.findMany({
    where: {
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
      ...(actorUserId ? { actorUserId } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    },
    include: { actorUser: { select: { id: true, email: true, fullName: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  res.json({ logs });
});

// -------- Support tickets --------
//
// Admin-facing only: there is no organizer/exhibitor self-service "raise a
// ticket" UI in this codebase, so every ticket is logged by a platform
// admin on the requester's behalf. Real, persisted data — SupportTicket /
// SupportTicketMessage are new Prisma models (see schema.prisma), not a
// stub. Internal notes (isInternalNote) are never appropriate to show a
// requester; since there is no requester-facing view yet this doesn't
// currently filter anything, but every response here is written as if a
// less-trusted caller could one day read it.

const SUPPORT_STATUSES = ["open", "in_progress", "waiting_customer", "resolved", "closed"] as const;
const SUPPORT_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const SUPPORT_CATEGORIES = ["account", "exhibition", "exhibitor", "visitor", "payment", "subscription", "technical", "other"] as const;

function lastActivityAt(ticket: { updatedAt: Date; messages: { createdAt: Date }[] }): Date {
  const latestMessage = ticket.messages.length > 0 ? ticket.messages[ticket.messages.length - 1].createdAt : null;
  return latestMessage && latestMessage > ticket.updatedAt ? latestMessage : ticket.updatedAt;
}

const supportListQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(SUPPORT_STATUSES).optional(),
  priority: z.enum(SUPPORT_PRIORITIES).optional(),
  category: z.enum(SUPPORT_CATEGORIES).optional(),
  assignedToUserId: z.string().optional(),
  unassigned: z.enum(["true"]).optional(),
});

router.get("/support", async (req, res) => {
  const parsed = supportListQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { search, status, priority, category, assignedToUserId, unassigned } = parsed.data;

  const tickets = await prisma.supportTicket.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(category ? { category } : {}),
      ...(unassigned ? { assignedToUserId: null } : assignedToUserId ? { assignedToUserId } : {}),
      ...(search
        ? {
            OR: [
              { subject: { contains: search, mode: "insensitive" } },
              { requesterName: { contains: search, mode: "insensitive" } },
              { requesterEmail: { contains: search, mode: "insensitive" } },
              { organizer: { name: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: {
      organizer: { select: { id: true, name: true } },
      assignedToUser: { select: { id: true, email: true, fullName: true } },
      messages: { orderBy: { createdAt: "asc" }, select: { createdAt: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  res.json({
    tickets: tickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      category: t.category,
      priority: t.priority,
      status: t.status,
      requesterName: t.requesterName,
      requesterEmail: t.requesterEmail,
      organizer: t.organizer,
      assignedToUser: t.assignedToUser,
      createdAt: t.createdAt,
      lastActivityAt: lastActivityAt(t),
      messageCount: t.messages.length,
    })),
  });
});

router.get("/support/:id", async (req, res) => {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: req.params.id },
    include: {
      organizer: { select: { id: true, name: true } },
      requesterUser: { select: { id: true, email: true, fullName: true } },
      assignedToUser: { select: { id: true, email: true, fullName: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { authorUser: { select: { id: true, email: true, fullName: true } } },
      },
    },
  });
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  res.json({ ticket });
});

const createTicketSchema = z.object({
  subject: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(SUPPORT_CATEGORIES).default("other"),
  priority: z.enum(SUPPORT_PRIORITIES).default("medium"),
  requesterName: z.string().optional(),
  requesterEmail: z.string().email().optional(),
  requesterUserId: z.string().optional(),
  organizerId: z.string().optional(),
});

router.post("/support", async (req, res) => {
  const parsed = createTicketSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const ticket = await prisma.supportTicket.create({
    data: {
      subject: parsed.data.subject,
      category: parsed.data.category,
      priority: parsed.data.priority,
      requesterName: parsed.data.requesterName,
      requesterEmail: parsed.data.requesterEmail,
      requesterUserId: parsed.data.requesterUserId,
      organizerId: parsed.data.organizerId,
      messages: { create: { authorUserId: req.user!.id, body: parsed.data.description, isInternalNote: false } },
    },
    include: { organizer: { select: { id: true, name: true } }, assignedToUser: true, messages: true },
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: "support.ticket_created",
    entityType: "SupportTicket",
    entityId: ticket.id,
    metadata: { subject: ticket.subject, category: ticket.category, priority: ticket.priority },
  });

  res.status(201).json({ ticket });
});

const updateTicketSchema = z.object({
  status: z.enum(SUPPORT_STATUSES).optional(),
  priority: z.enum(SUPPORT_PRIORITIES).optional(),
  assignedToUserId: z.string().nullable().optional(),
});

router.patch("/support/:id", async (req, res) => {
  const existing = await prisma.supportTicket.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Ticket not found" });

  const parsed = updateTicketSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  if (Object.keys(parsed.data).length === 0) return res.status(400).json({ error: "No changes provided" });

  const becomingResolved = parsed.data.status && ["resolved", "closed"].includes(parsed.data.status) && !["resolved", "closed"].includes(existing.status);
  const becomingReopened = parsed.data.status && !["resolved", "closed"].includes(parsed.data.status) && ["resolved", "closed"].includes(existing.status);

  const ticket = await prisma.supportTicket.update({
    where: { id: existing.id },
    data: {
      ...parsed.data,
      ...(becomingResolved ? { resolvedAt: new Date() } : {}),
      ...(becomingReopened ? { resolvedAt: null } : {}),
    },
    include: {
      organizer: { select: { id: true, name: true } },
      assignedToUser: { select: { id: true, email: true, fullName: true } },
    },
  });

  if (parsed.data.status && parsed.data.status !== existing.status) {
    await logAudit({
      actorUserId: req.user!.id,
      action: "support.ticket_status_changed",
      entityType: "SupportTicket",
      entityId: ticket.id,
      metadata: { previousStatus: existing.status, newStatus: ticket.status },
    });
  }
  if (parsed.data.assignedToUserId !== undefined && parsed.data.assignedToUserId !== existing.assignedToUserId) {
    await logAudit({
      actorUserId: req.user!.id,
      action: parsed.data.assignedToUserId ? "support.ticket_assigned" : "support.ticket_unassigned",
      entityType: "SupportTicket",
      entityId: ticket.id,
      metadata: { assignedToUserId: parsed.data.assignedToUserId },
    });
  }

  res.json({ ticket });
});

const addMessageSchema = z.object({ body: z.string().min(1), isInternalNote: z.boolean().default(false) });

router.post("/support/:id/messages", async (req, res) => {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: req.params.id } });
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });

  const parsed = addMessageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const message = await prisma.supportTicketMessage.create({
    data: {
      ticketId: ticket.id,
      authorUserId: req.user!.id,
      body: parsed.data.body,
      isInternalNote: parsed.data.isInternalNote,
    },
    include: { authorUser: { select: { id: true, email: true, fullName: true } } },
  });

  res.status(201).json({ message });
});

// -------- Platform settings --------
//
// A single persisted row (PlatformSettings, id="singleton"). Every field is
// real and saved — but, mirroring how Plan/Subscription were introduced,
// nothing outside this route currently reads or enforces most of these
// values (each field below says so explicitly). This is intentionally a
// small, honest set: only fields with no real backing anywhere in the
// codebase (payment/email provider credentials, 2FA, integrations) were
// left out rather than faked.

async function loadOrCreateSettings() {
  return prisma.platformSettings.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton" } });
}

router.get("/settings", async (_req, res) => {
  const settings = await loadOrCreateSettings();
  res.json({ settings });
});

const updateSettingsSchema = z.object({
  platformName: z.string().min(1).optional(),
  supportEmail: z.string().email().nullable().optional(),
  defaultCurrency: z.string().min(1).optional(),
  defaultTimezone: z.string().min(1).optional(),
  dateFormat: z.string().min(1).optional(),
  // Not yet enforced anywhere (no organizer-registration or
  // exhibition-creation route checks these flags) — persisted now so the
  // toggle is real and the enforcement can be added later without a
  // migration.
  allowOrganizerRegistration: z.boolean().optional(),
  allowExhibitionCreation: z.boolean().optional(),
  // Not yet enforced — no middleware currently checks this flag to block
  // traffic. Persisted and audited so a future maintenance-mode gate has
  // real data to read from.
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().nullable().optional(),
});

router.patch("/settings", async (req, res) => {
  const parsed = updateSettingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  if (Object.keys(parsed.data).length === 0) return res.status(400).json({ error: "No changes provided" });

  const existing = await loadOrCreateSettings();
  const settings = await prisma.platformSettings.update({
    where: { id: "singleton" },
    data: { ...parsed.data, updatedByUserId: req.user!.id },
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: "platform.settings_updated",
    entityType: "PlatformSettings",
    entityId: "singleton",
    metadata: { changed: Object.keys(parsed.data), previous: existing, next: settings },
  });

  res.json({ settings });
});

export default router;
