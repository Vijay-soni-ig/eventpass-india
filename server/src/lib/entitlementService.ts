import type { Response } from "express";
import { Prisma, type Plan, type Subscription } from "@prisma/client";
import { prisma } from "./prisma";
import { logAudit } from "./audit";

/**
 * Phase 20C — plan entitlement enforcement. Makes the Plan/Subscription
 * data Phase 20B introduced actually gate write operations, without any
 * billing collection, Razorpay, or GST work — those remain exactly as
 * deferred as docs/PHASE_20A/20B already established.
 *
 * Every assert* function here is meant to be called from INSIDE a
 * `prisma.$transaction()` block that has already locked the organizer row
 * via lockOrganizerForEntitlement() — that's what makes "count usage, then
 * write" race-safe under concurrency (see this file's own concurrency note
 * below, and docs/PHASE_20C_PLAN_ENFORCEMENT_REPORT.md Section 9).
 */

type PrismaClientOrTx = typeof prisma | Prisma.TransactionClient;

export class EntitlementError extends Error {
  constructor(
    public readonly details: {
      code: "PLAN_LIMIT_EXCEEDED" | "SUBSCRIPTION_NOT_ELIGIBLE";
      resource: "exhibition" | "exhibitor" | "visitor" | "stall" | "team_member";
      message: string;
      currentUsage?: number;
      limit?: number | null;
      plan: string;
      action: "upgrade" | "contact_admin";
    }
  ) {
    super(details.message);
    this.name = "EntitlementError";
  }
}

/**
 * Locks the Organizer row for the duration of the enclosing transaction so
 * a concurrent request against the SAME organizer blocks here until this
 * transaction commits or rolls back, then re-evaluates against the
 * now-current count — exactly the same "lock the parent row, recompute,
 * then act" pattern refundService.ts already uses for refund concurrency.
 * One lock target (the Organizer row) serves all five entitlement checks
 * uniformly, since every one of them is ultimately scoped to one organizer.
 *
 * Deliberately NEVER used around a network call (e.g. the payment
 * provider) — see routes/bookings.ts's ticket-booking flow, which reserves
 * the booking row inside this lock and only creates the payment/gateway
 * order afterward, outside it.
 */
export async function lockOrganizerForEntitlement(tx: Prisma.TransactionClient, organizerId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "organizers" WHERE "id" = ${organizerId} FOR UPDATE`;
}

async function loadEntitlementContext(client: PrismaClientOrTx, organizerId: string): Promise<{ subscription: Subscription; plan: Plan }> {
  const subscription = await client.subscription.findFirst({
    where: { organizerId },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
  if (!subscription) {
    // Should never happen for any organizer created after Phase 20B's
    // migration/organizer-bootstrap change — every organizer gets a
    // Subscription at creation time. Fails loudly rather than silently
    // treating a missing subscription as "unlimited".
    throw new Error(
      `Organizer "${organizerId}" has no Subscription row. This should never happen outside a broken migration/backfill — see docs/PHASE_20B_SUBSCRIPTION_LIFECYCLE_REPORT.md.`
    );
  }
  return { subscription, plan: subscription.plan };
}

/**
 * A cancelled or expired subscription has no active commercial
 * relationship at all — every entitlement-checked action is rejected
 * outright, regardless of the plan's own limits. `trialing`, `active`, and
 * the schema-default `inactive` (never actually written by any code path —
 * see subscriptionService.ts) all proceed to the resource-specific limit
 * check below.
 */
function assertSubscriptionEligible(subscription: Subscription, planName: string): void {
  if (subscription.status === "cancelled" || subscription.status === "expired") {
    throw new EntitlementError({
      code: "SUBSCRIPTION_NOT_ELIGIBLE",
      resource: "exhibition",
      message: `This organizer's subscription is ${subscription.status} and cannot perform this action. Contact an administrator to reactivate or start a new subscription.`,
      plan: planName,
      action: "contact_admin",
    });
  }
}

// ---------------------------------------------------------------------------
// Counting rules — each documented individually; see
// docs/PHASE_20C_PLAN_ENFORCEMENT_REPORT.md for the full reasoning behind
// each choice (existing analytics precedent where one exists, and why this
// phase's entitlement definition sometimes deliberately differs from it).
// ---------------------------------------------------------------------------

// Exhibitor: a business occupies a "slot" against the plan's exhibitor
// limit from the moment its application is APPROVED (not merely "applied",
// which hasn't been accepted onto the show floor yet) until it is
// cancelled/rejected. This is intentionally broader than
// analyticsService.ts's own "confirmedExhibitors" metric (which counts only
// "confirmed" — i.e. approved AND paid for a stall), because the
// entitlement question is "how many businesses is this organizer currently
// managing on their show floor", not "how many have fully completed
// checkout" — an approved-but-not-yet-paid exhibitor is still consuming
// real organizer attention/capacity. Enforced at the ONE place a row
// transitions into this set: exhibitions.ts's application-review PATCH.
const CONSUMING_EXHIBITOR_STATUSES = ["approved", "stall_pending", "stall_reserved", "payment_pending", "confirmed"] as const;

// Visitor: a ticket booking consumes a "registration slot" unless it never
// completed (payment "failed") or was fully refunded (which, per Phase
// 19B, also revokes check-in eligibility — the same "no longer a valid
// attendee" semantics this entitlement count mirrors). A booking that's
// merely "created" (payment not yet completed) still counts, deliberately
// — this is a registration-capacity limit, not a "cash collected" metric,
// and letting an unpaid-but-pending registration slip through uncounted
// would make the limit trivially bypassable by abandoning checkout.
// Exported (Phase 21C) so routes/bookings.ts's per-ticket-type remaining-
// stock check (a different capacity concept — inventory, not the
// organizer-wide visitor limit above) uses the exact same "what counts as
// consumed" status list rather than a second, potentially-drifting copy.
export const NON_CONSUMING_TICKET_STATUSES = ["failed", "refunded"] as const;

// Active exhibition: everything except "completed" counts — draft/live/
// paused all represent an exhibition the organizer is still actively
// running or preparing, occupying one of the plan's exhibition slots.
// Only marking an exhibition "completed" frees the slot for a new one.
const NON_ACTIVE_EXHIBITION_STATUSES = ["completed"] as const;

/**
 * Exhibition creation — two write paths call this: POST /api/exhibitions
 * and POST /api/exhibitions/:id/duplicate (both create exactly one new
 * Exhibition row).
 *
 * Two distinct rules, not one:
 *   1. Starter + trialing (the free-first-exhibition trial, Phase 20A/20B):
 *      a ONE-TIME LIFETIME check — has this organizer EVER created any
 *      exhibition, in any status, including "completed"? If so, the trial
 *      is consumed, permanently — completing or even hypothetically
 *      deleting that first exhibition does NOT restore it (see this
 *      file's own module doc and docs/PHASE_20C's Section 6 for why).
 *   2. Every other combination (Starter+active, Growth, Enterprise, or
 *      any plan while not trialing): the ONGOING capacity check — count
 *      of NON-completed exhibitions against plan.eventLimit. This is what
 *      lets an ACTIVE Starter subscription create exhibition #2 once #1 is
 *      marked completed — administratively presumed paid for via the same
 *      admin-driven activate/plan-change path Phase 20B already built, not
 *      by this phase collecting ₹14,999 (which it never does).
 */
export async function assertCanCreateExhibition(tx: Prisma.TransactionClient, organizerId: string): Promise<{ wasTrialFirstExhibition: boolean }> {
  const { subscription, plan } = await loadEntitlementContext(tx, organizerId);
  assertSubscriptionEligible(subscription, plan.name);

  if (plan.code === "starter" && subscription.status === "trialing") {
    const everCreated = await tx.exhibition.count({ where: { organizerId } });
    if (everCreated >= 1) {
      throw new EntitlementError({
        code: "PLAN_LIMIT_EXCEEDED",
        resource: "exhibition",
        message: `Your Starter plan's free first exhibition has already been used. Upgrade your plan or contact an admin to create another exhibition.`,
        currentUsage: everCreated,
        limit: 1,
        plan: plan.name,
        action: "upgrade",
      });
    }
    return { wasTrialFirstExhibition: true };
  }

  if (plan.eventLimit === null) return { wasTrialFirstExhibition: false }; // Enterprise / unlimited

  const activeCount = await tx.exhibition.count({ where: { organizerId, status: { notIn: [...NON_ACTIVE_EXHIBITION_STATUSES] } } });
  if (activeCount >= plan.eventLimit) {
    throw new EntitlementError({
      code: "PLAN_LIMIT_EXCEEDED",
      resource: "exhibition",
      message: `Your ${plan.name} plan allows ${plan.eventLimit} active exhibition${plan.eventLimit === 1 ? "" : "s"}.`,
      currentUsage: activeCount,
      limit: plan.eventLimit,
      plan: plan.name,
      action: "upgrade",
    });
  }
  return { wasTrialFirstExhibition: false };
}

/** Called immediately before an exhibitor application transitions to "approved" (exhibitions.ts's review-application PATCH) — the one place a row enters the consuming-status set. */
export async function assertCanAddExhibitor(tx: Prisma.TransactionClient, organizerId: string): Promise<void> {
  const { subscription, plan } = await loadEntitlementContext(tx, organizerId);
  assertSubscriptionEligible(subscription, plan.name);
  if (plan.exhibitorLimit === null) return;

  const count = await tx.exhibitionExhibitor.count({
    where: { exhibition: { organizerId }, status: { in: [...CONSUMING_EXHIBITOR_STATUSES] } },
  });
  if (count >= plan.exhibitorLimit) {
    throw new EntitlementError({
      code: "PLAN_LIMIT_EXCEEDED",
      resource: "exhibitor",
      message: `Your ${plan.name} plan allows ${plan.exhibitorLimit} exhibitors.`,
      currentUsage: count,
      limit: plan.exhibitorLimit,
      plan: plan.name,
      action: "upgrade",
    });
  }
}

/**
 * Called from routes/bookings.ts immediately before reserving a new
 * TicketBooking row (inside the same locked transaction — see that
 * route's own comment for why payment/gateway creation happens afterward,
 * outside the lock). Scope: organizer-wide, across every exhibition the
 * organizer runs — see docs/PHASE_20C's Section 9 for why (Phase 20A's own
 * plan table presents this as a single flat number per plan, the same way
 * eventLimit inherently is, not "per exhibition").
 */
export async function assertCanRegisterVisitor(tx: Prisma.TransactionClient, organizerId: string): Promise<void> {
  const { subscription, plan } = await loadEntitlementContext(tx, organizerId);
  assertSubscriptionEligible(subscription, plan.name);
  if (plan.visitorLimit === null) return;

  const count = await tx.ticketBooking.count({
    where: { exhibition: { organizerId }, paymentStatus: { notIn: [...NON_CONSUMING_TICKET_STATUSES] } },
  });
  if (count >= plan.visitorLimit) {
    throw new EntitlementError({
      code: "PLAN_LIMIT_EXCEEDED",
      resource: "visitor",
      message: `Your ${plan.name} plan allows ${plan.visitorLimit.toLocaleString("en-IN")} visitor registrations.`,
      currentUsage: count,
      limit: plan.visitorLimit,
      plan: plan.name,
      action: "upgrade",
    });
  }
}

/**
 * Called before creating a new Stall row — three write paths reach this:
 * the nested `stalls` array in POST /api/exhibitions, the same nested
 * array in POST /api/exhibitions/:id/duplicate, and the standalone
 * POST /api/exhibitions/:id/stalls. `countToAdd` lets the two nested-array
 * call sites check the whole batch atomically instead of one at a time.
 * Scope: organizer-wide (same reasoning as visitor — see above).
 */
export async function assertCanCreateStall(tx: Prisma.TransactionClient, organizerId: string, countToAdd: number): Promise<void> {
  const { subscription, plan } = await loadEntitlementContext(tx, organizerId);
  assertSubscriptionEligible(subscription, plan.name);
  if (plan.stallLimit === null) return;
  if (countToAdd === 0) return;

  const count = await tx.stall.count({ where: { exhibition: { organizerId } } });
  if (count + countToAdd > plan.stallLimit) {
    throw new EntitlementError({
      code: "PLAN_LIMIT_EXCEEDED",
      resource: "stall",
      message: `Your ${plan.name} plan allows ${plan.stallLimit} stalls.`,
      currentUsage: count,
      limit: plan.stallLimit,
      plan: plan.name,
      action: "upgrade",
    });
  }
}

/**
 * Called before creating a new OrganizerMembership row (organizerMembers.ts's
 * invite endpoint — the only write path). Counts BOTH "active" and
 * "invited" rows: an invitation already commits a seat to a specific
 * person, matching how seat-based SaaS products conventionally treat
 * pending invites (Slack, GitHub, etc.) — an organizer shouldn't be able to
 * work around the limit by sending unlimited un-accepted invites. A
 * removed member has no row at all (organizerMembers.ts's DELETE actually
 * deletes the row), so no separate "removed" exclusion is needed.
 */
export async function assertCanInviteTeamMember(tx: Prisma.TransactionClient, organizerId: string): Promise<void> {
  const { subscription, plan } = await loadEntitlementContext(tx, organizerId);
  assertSubscriptionEligible(subscription, plan.name);
  if (plan.teamMemberLimit === null) return;

  const count = await tx.organizerMembership.count({ where: { organizerId } });
  if (count >= plan.teamMemberLimit) {
    throw new EntitlementError({
      code: "PLAN_LIMIT_EXCEEDED",
      resource: "team_member",
      message: `Your ${plan.name} plan allows ${plan.teamMemberLimit} team members.`,
      currentUsage: count,
      limit: plan.teamMemberLimit,
      plan: plan.name,
      action: "upgrade",
    });
  }
}

/**
 * Called by exhibitions.ts AFTER a successful, committed exhibition
 * creation whose entitlement check reported `wasTrialFirstExhibition`.
 * Logged once, at the moment the free trial is actually consumed — never
 * from inside the transaction itself (logAudit() writes through the
 * module-level `prisma` client, not a transaction's `tx` — see
 * subscriptionService.ts's identical reasoning for createTrialSubscription()).
 */
export async function logTrialConsumed(organizerId: string, actorUserId: string, exhibitionId: string): Promise<void> {
  await logAudit({
    actorUserId,
    action: "entitlement.trial_consumed",
    entityType: "Organizer",
    entityId: organizerId,
    metadata: { exhibitionId },
  });
}

/**
 * Called by every route's catch block when an EntitlementError is thrown —
 * i.e. an action was actually blocked. Not called for successful checks
 * (that would be exactly the "noisy audit record for every successful
 * count check" this phase's own instructions say to avoid) — only for the
 * comparatively rare case where a real commercial limit stopped something.
 */
export async function logEntitlementBlocked(organizerId: string, actorUserId: string, err: EntitlementError): Promise<void> {
  await logAudit({
    actorUserId,
    action: "entitlement.blocked",
    entityType: "Organizer",
    entityId: organizerId,
    metadata: { ...err.details },
  });
}

/**
 * Shared HTTP response for an EntitlementError, reused across every route
 * that calls an assert* function above — the exact response shape from
 * docs/PHASE_20C_PLAN_ENFORCEMENT_REPORT.md's error-contract section.
 * SUBSCRIPTION_NOT_ELIGIBLE -> 403 (the account itself can't do this,
 * regardless of usage); PLAN_LIMIT_EXCEEDED -> 409 (the request conflicts
 * with current entitlement usage, not a pure authorization failure).
 */
export function sendEntitlementError(res: Response, err: EntitlementError): Response {
  const status = err.details.code === "SUBSCRIPTION_NOT_ELIGIBLE" ? 403 : 409;
  return res.status(status).json({ error: err.details });
}

// ---------------------------------------------------------------------------
// Read-only usage summary — for the organizer-facing usage UI and the
// platform admin view. No lock, no transaction: this is a report, not a
// gate, and is never itself used to decide whether a write is allowed
// (every assert* function above always re-derives its own count).
// ---------------------------------------------------------------------------

export interface EntitlementUsage {
  resource: "exhibition" | "exhibitor" | "visitor" | "stall" | "team_member";
  currentUsage: number;
  limit: number | null;
}

export interface OrganizerEntitlementSummary {
  subscription: Subscription;
  plan: Plan;
  trialConsumed: boolean;
  usage: EntitlementUsage[];
}

export async function getOrganizerEntitlement(organizerId: string): Promise<OrganizerEntitlementSummary> {
  const { subscription, plan } = await loadEntitlementContext(prisma, organizerId);

  const [exhibitionCount, everCreatedCount, exhibitorCount, visitorCount, stallCount, teamMemberCount] = await Promise.all([
    prisma.exhibition.count({ where: { organizerId, status: { notIn: [...NON_ACTIVE_EXHIBITION_STATUSES] } } }),
    prisma.exhibition.count({ where: { organizerId } }),
    prisma.exhibitionExhibitor.count({ where: { exhibition: { organizerId }, status: { in: [...CONSUMING_EXHIBITOR_STATUSES] } } }),
    prisma.ticketBooking.count({ where: { exhibition: { organizerId }, paymentStatus: { notIn: [...NON_CONSUMING_TICKET_STATUSES] } } }),
    prisma.stall.count({ where: { exhibition: { organizerId } } }),
    prisma.organizerMembership.count({ where: { organizerId } }),
  ]);

  const trialConsumed = plan.code === "starter" && subscription.status === "trialing" && everCreatedCount >= 1;

  return {
    subscription,
    plan,
    trialConsumed,
    usage: [
      { resource: "exhibition", currentUsage: exhibitionCount, limit: plan.eventLimit },
      { resource: "exhibitor", currentUsage: exhibitorCount, limit: plan.exhibitorLimit },
      { resource: "visitor", currentUsage: visitorCount, limit: plan.visitorLimit },
      { resource: "stall", currentUsage: stallCount, limit: plan.stallLimit },
      { resource: "team_member", currentUsage: teamMemberCount, limit: plan.teamMemberLimit },
    ],
  };
}
