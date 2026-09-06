import { Prisma, type Subscription, type Plan, type SubscriptionStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { logAudit } from "./audit";

/**
 * Phase 20B — subscription lifecycle. Mirrors the existing service-layer
 * pattern established by pricingVersion.ts/refundService.ts: routes never
 * touch Prisma's Subscription/Plan models directly, every state transition
 * goes through an explicit function here, and every transition is audited
 * via the existing logAudit()/AuditLog infrastructure (no second audit
 * system).
 *
 * IMPORTANT — what this file deliberately does NOT do:
 *   - No plan-limit enforcement. Every check here is about whether a
 *     LIFECYCLE transition is valid, never whether the organizer is
 *     "allowed" to create another exhibition/exhibitor/etc. That belongs
 *     to Phase 20C.
 *   - No payment collection. activateSubscription() is an administrative
 *     action (Razorpay is not configured — see docs/PHASE_19B and
 *     docs/PHASE_20A) and never charges anything.
 *   - No GST/tax calculation. Plan.price is a plain figure with no tax
 *     treatment attached — see docs/PHASE_20A_COMMERCIAL_MODEL_REPORT.md
 *     Section 15 for why that's a deliberately unresolved business/legal
 *     question, not an oversight.
 */

export class SubscriptionError extends Error {
  constructor(
    public readonly code: "INVALID_TRANSITION" | "PLAN_NOT_FOUND" | "PLAN_INACTIVE" | "SUBSCRIPTION_NOT_FOUND",
    message: string
  ) {
    super(message);
    this.name = "SubscriptionError";
  }
}

// The single source of truth for which lifecycle transitions are legal.
// Deliberately conservative: CANCELLED and EXPIRED are terminal (no
// outgoing edges at all) — reactivation, if the business ever wants it,
// must be a new, explicit, separately-designed operation (Phase 20B's own
// brief is explicit about this), never a side effect of allowing arbitrary
// status writes. "inactive" is the Subscription model's own schema
// default (@default(inactive)) and is never written by any function below
// — it exists only so a stray row created without an explicit status
// doesn't silently look "trialing" — but a transition out of it is
// included for completeness, since nothing here should assume it can
// never occur.
//
// Phase 20D addition: "trialing" -> "cancelled" (an organizer who never
// converted their free trial can have it cancelled directly — e.g. they
// decide not to use the platform at all) was not in Phase 20B's minimum
// spec and is added here per Phase 20D's explicit hardening instruction.
// This is the one deliberate lifecycle change this phase makes; every
// other edge is unchanged from Phase 20B.
const VALID_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  inactive: ["trialing"],
  trialing: ["active", "expired", "cancelled"],
  active: ["cancelled", "expired"],
  cancelled: [],
  expired: [],
};

export function assertValidTransition(from: SubscriptionStatus, to: SubscriptionStatus): void {
  if (!VALID_TRANSITIONS[from]?.includes(to)) {
    throw new SubscriptionError("INVALID_TRANSITION", `Cannot transition a subscription from "${from}" to "${to}"`);
  }
}

/**
 * Phase 20D — locks the Subscription row for the duration of the enclosing
 * transaction, exactly mirroring entitlementService.ts's
 * lockOrganizerForEntitlement() and refundService.ts's own Payment-row
 * locking from Phase 19B. Without this, two concurrent admin requests
 * (e.g. "cancel" and "expire" fired at the same subscription at the same
 * moment) could both read the same pre-transition status, both pass
 * assertValidTransition() against that stale read, and both write — a
 * classic lost-update race where the loser's transition silently
 * overwrites the winner's, while BOTH callers receive a success response
 * that no longer matches the final committed state. Locking the row first
 * means the second request blocks until the first commits, then
 * re-validates against the now-current status and correctly rejects if the
 * first transition already made its target transition invalid.
 */
async function lockSubscriptionForTransition(tx: Prisma.TransactionClient, subscriptionId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "subscriptions" WHERE "id" = ${subscriptionId} FOR UPDATE`;
}

/** Resolves the Starter plan by its stable id — the plan every new organizer's trial is created against. Fails loudly (mirrors getActivePricingVersion()) rather than silently degrading if the Phase 20B migration/seed hasn't run. */
export async function getStarterPlan(): Promise<Plan> {
  const plan = await prisma.plan.findUnique({ where: { id: "plan-starter" } });
  if (!plan) {
    throw new Error(
      'No "plan-starter" Plan row found. This should never happen outside a broken migration/seed — every environment must have the three Phase 20B commercial plans (see migration 20260904100000_subscription_lifecycle).'
    );
  }
  return plan;
}

/** The organizer's current subscription (there is always at most one non-terminal one by construction — see createTrialSubscription's own doc comment), or null if genuinely none exists yet (shouldn't happen for any organizer created after the Phase 20B migration, but existing/legacy data is handled defensively). */
export async function getOrganizerSubscription(
  organizerId: string
): Promise<(Subscription & { plan: Plan }) | null> {
  return prisma.subscription.findFirst({
    where: { organizerId },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Creates a Starter trialing Subscription for a brand-new organizer. This
 * is intentionally ONLY ever called from inside organizer.ts's
 * resolveOrganizerId(), inside the same database transaction as the
 * Organizer row's own creation — that's what makes "exactly one
 * subscription per organizer, even under concurrent bootstrap requests"
 * true without needing a dedicated DB uniqueness constraint on
 * Subscription.organizerId: the Organizer.bootstrappedByUserId unique
 * constraint (plus resolveOrganizerId's existing P2002-catch-and-resolve-
 * to-winner pattern) already guarantees only the ONE winning concurrent
 * request ever reaches this function for a given user's first organizer.
 * A losing concurrent request returns the winner's organizerId without
 * ever calling this at all. See docs/PHASE_20B_SUBSCRIPTION_LIFECYCLE_REPORT.md
 * Section 13 for why this was preferred over adding a schema constraint.
 *
 * Per docs/PHASE_20A §13 / Phase 20B's own instructions: this is a FREE
 * FIRST EXHIBITION trial, not a calendar-day trial. `trialEndsAt` is
 * deliberately left NULL — see this function's own note below and
 * docs/PHASE_20B_SUBSCRIPTION_LIFECYCLE_REPORT.md Section 5 for the full
 * explanation of why the existing date-based field cannot safely represent
 * an exhibition-completion trigger, and what the real follow-up decision
 * is.
 *
 * Deliberately does NOT call logAudit() itself — logAudit() writes through
 * the module-level `prisma` client, not the `tx` passed in here, so
 * calling it mid-transaction would record an audit entry for a Subscription
 * that could still be rolled back. Mirrors refundService.ts's own
 * established pattern: the caller logs the audit event AFTER the
 * transaction has actually committed (see organizer.ts's resolveOrganizerId).
 */
export async function createTrialSubscription(
  tx: Prisma.TransactionClient,
  organizerId: string,
  planId: string
): Promise<Subscription> {
  return tx.subscription.create({
    data: {
      organizerId,
      planId,
      status: "trialing",
      // Deliberately NOT set. See the module-level doc comment: a
      // calendar date cannot represent "this organizer's first exhibition
      // has concluded" — writing a fake date here to satisfy the column
      // would be worse than leaving it null, per Phase 20B's explicit
      // instruction not to misuse this field. The real trial-ending
      // trigger is event-driven (conversion to a paid plan, or Phase 20C
      // enforcement detecting a second exhibition attempt while still
      // trialing) and is handled by expireSubscription()/activateSubscription(),
      // not by a date comparison.
      trialEndsAt: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
    },
  });
}

/**
 * Trialing -> Active. Administrative only — Razorpay is not configured, so
 * this never collects payment; it exists so a platform admin (or, later, a
 * real checkout flow) can record that an organizer has converted. Accepts
 * an optional entitlement period; for per-event pricing this period
 * represents the ENTITLEMENT WINDOW the admin is granting (e.g. matching
 * the exhibition the organizer paid for), not an automated recurring
 * billing cycle — see docs/PHASE_20B_SUBSCRIPTION_LIFECYCLE_REPORT.md
 * Section 8 for the full distinction.
 */
export async function activateSubscription(params: {
  subscriptionId: string;
  actorUserId: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
}): Promise<Subscription & { plan: Plan }> {
  const { previousStatus, updated } = await prisma.$transaction(async (tx) => {
    await lockSubscriptionForTransition(tx, params.subscriptionId);
    const existing = await tx.subscription.findUnique({ where: { id: params.subscriptionId }, include: { plan: true } });
    if (!existing) throw new SubscriptionError("SUBSCRIPTION_NOT_FOUND", "Subscription not found");
    assertValidTransition(existing.status, "active");

    const updated = await tx.subscription.update({
      where: { id: existing.id },
      data: {
        status: "active",
        currentPeriodStart: params.currentPeriodStart ?? new Date(),
        currentPeriodEnd: params.currentPeriodEnd ?? null,
      },
      include: { plan: true },
    });
    return { previousStatus: existing.status, updated };
  });

  await logAudit({
    actorUserId: params.actorUserId,
    action: "subscription.activated",
    entityType: "Organizer",
    entityId: updated.organizerId,
    metadata: { subscriptionId: updated.id, previousStatus, newStatus: "active", planId: updated.planId },
  });

  return updated;
}

/**
 * Active -> Cancelled. Chosen behavior: IMMEDIATE, not period-end. There is
 * no automated billing to "let run out" (Phase 20B collects no payment at
 * all — see module doc comment), and per-event entitlements don't have a
 * meaningful "current period" to defer to in the common case (no
 * currentPeriodEnd was ever set for most Starter/Growth per-event
 * subscriptions) — so period-end cancellation would silently do nothing
 * different from immediate cancellation for the majority of subscriptions
 * this phase creates. If a genuine period-end cancellation policy is
 * needed later (e.g. once the Growth Annual package has real automated
 * billing), that is a new, explicit decision — not a hidden default this
 * function should guess at.
 */
export async function cancelSubscription(params: { subscriptionId: string; actorUserId: string }): Promise<Subscription & { plan: Plan }> {
  const { previousStatus, updated } = await prisma.$transaction(async (tx) => {
    await lockSubscriptionForTransition(tx, params.subscriptionId);
    const existing = await tx.subscription.findUnique({ where: { id: params.subscriptionId }, include: { plan: true } });
    if (!existing) throw new SubscriptionError("SUBSCRIPTION_NOT_FOUND", "Subscription not found");
    assertValidTransition(existing.status, "cancelled");

    const updated = await tx.subscription.update({
      where: { id: existing.id },
      data: { status: "cancelled" },
      include: { plan: true },
    });
    return { previousStatus: existing.status, updated };
  });

  await logAudit({
    actorUserId: params.actorUserId,
    action: "subscription.cancelled",
    entityType: "Organizer",
    entityId: updated.organizerId,
    metadata: { subscriptionId: updated.id, previousStatus, newStatus: "cancelled", planId: updated.planId },
  });

  return updated;
}

/**
 * Trialing|Active -> Expired. Administrative for now — the real trigger
 * (trial ended without conversion, or an unrenewed period lapsed) is not
 * automatically detected anywhere in Phase 20B; this is the operation
 * Phase 20C's enforcement layer will call once it exists. See
 * docs/PHASE_20B_SUBSCRIPTION_LIFECYCLE_REPORT.md Section 5/Section 20.
 */
export async function expireSubscription(params: { subscriptionId: string; actorUserId: string }): Promise<Subscription & { plan: Plan }> {
  const { previousStatus, updated } = await prisma.$transaction(async (tx) => {
    await lockSubscriptionForTransition(tx, params.subscriptionId);
    const existing = await tx.subscription.findUnique({ where: { id: params.subscriptionId }, include: { plan: true } });
    if (!existing) throw new SubscriptionError("SUBSCRIPTION_NOT_FOUND", "Subscription not found");
    assertValidTransition(existing.status, "expired");

    const updated = await tx.subscription.update({
      where: { id: existing.id },
      data: { status: "expired" },
      include: { plan: true },
    });
    return { previousStatus: existing.status, updated };
  });

  await logAudit({
    actorUserId: params.actorUserId,
    action: "subscription.expired",
    entityType: "Organizer",
    entityId: updated.organizerId,
    metadata: { subscriptionId: updated.id, previousStatus, newStatus: "expired", planId: updated.planId },
  });

  return updated;
}

/**
 * Explicit plan-change operation — never a raw `subscription.planId = x`
 * write from a route. Only valid while the subscription is in a
 * non-terminal state (trialing or active); does not itself change status
 * or enforce the new plan's limits (Phase 20C's job). Every historical
 * Payment/Refund/PricingVersion row is untouched by construction — this
 * function only ever writes Subscription.planId, nothing else.
 */
export async function changePlan(params: { subscriptionId: string; newPlanId: string; actorUserId: string }): Promise<Subscription & { plan: Plan }> {
  const { previousPlanId, updated } = await prisma.$transaction(async (tx) => {
    await lockSubscriptionForTransition(tx, params.subscriptionId);
    const existing = await tx.subscription.findUnique({ where: { id: params.subscriptionId }, include: { plan: true } });
    if (!existing) throw new SubscriptionError("SUBSCRIPTION_NOT_FOUND", "Subscription not found");
    if (existing.status !== "trialing" && existing.status !== "active") {
      throw new SubscriptionError("INVALID_TRANSITION", `Cannot change the plan of a "${existing.status}" subscription`);
    }

    const newPlan = await tx.plan.findUnique({ where: { id: params.newPlanId } });
    if (!newPlan) throw new SubscriptionError("PLAN_NOT_FOUND", "Target plan not found");
    if (!newPlan.active) throw new SubscriptionError("PLAN_INACTIVE", `Plan "${newPlan.code}" is not active and cannot be assigned`);

    const updated = await tx.subscription.update({
      where: { id: existing.id },
      data: { planId: newPlan.id },
      include: { plan: true },
    });
    return { previousPlanId: existing.planId, updated };
  });

  await logAudit({
    actorUserId: params.actorUserId,
    action: "subscription.plan_changed",
    entityType: "Organizer",
    entityId: updated.organizerId,
    metadata: { subscriptionId: updated.id, previousPlanId, newPlanId: updated.planId, status: updated.status },
  });

  return updated;
}
