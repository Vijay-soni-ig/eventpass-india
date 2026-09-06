import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { organizerIdsWithPermission } from "../lib/access";
import { getOrganizerEntitlement } from "../lib/entitlementService";

const router = Router();

router.use(requireAuth, requireOrganizerAccess);

/**
 * An organizer's own subscription — read-only, self-service view. Scoped
 * via organizerIdsWithPermission exactly like every other organizer-scoped
 * route (routes/organizerPayments.ts, routes/bookings.ts, etc.) — the
 * organizer id is NEVER taken from the request, only resolved from the
 * caller's own membership rows, so there is no IDOR surface here at all.
 *
 * Reuses "payment:view" rather than introducing a new permission: a
 * subscription's price/period is financial/commercial data of the same
 * character as a Payment, and "payment:view" already exists on exactly
 * the roles (owner/admin/finance) who should reasonably see it — see
 * docs/PHASE_20B_SUBSCRIPTION_LIFECYCLE_REPORT.md Section 9 for the full
 * reasoning.
 *
 * A caller can belong to more than one organizer (OrganizerMembership is
 * unrestricted), so this returns one entry per organizer in scope rather
 * than guessing which one "the" organizer is — matching the existing
 * list-style pattern other organizer-scoped routes already use.
 */
router.get("/", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "payment:view");
  if (organizerIds.length === 0) {
    return res.status(403).json({ error: "You do not have permission to view subscription/billing information" });
  }

  const [organizers, subscriptions] = await Promise.all([
    prisma.organizer.findMany({ where: { id: { in: organizerIds } }, select: { id: true, name: true } }),
    prisma.subscription.findMany({
      where: { organizerId: { in: organizerIds } },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Phase 20C: usage vs. limits, for the "24/25 exhibitors" style UI. This
  // is a read-only report (getOrganizerEntitlement never gates anything —
  // only the assert* functions used at actual write points do), computed
  // fresh per request, never cached.
  const usageByOrganizer = await Promise.all(organizers.map((o) => getOrganizerEntitlement(o.id)));

  const results = organizers.map((organizer, i) => ({
    organizer,
    // The most recent row is "current" — Subscription is a history model
    // (see schema.prisma's own doc comment), and every lifecycle
    // transition in this phase updates the existing row in place rather
    // than inserting a new one, so in practice there is exactly one row
    // per organizer today; this stays correct if that ever changes.
    subscription: subscriptions.find((s) => s.organizerId === organizer.id) ?? null,
    usage: usageByOrganizer[i].usage,
    trialConsumed: usageByOrganizer[i].trialConsumed,
  }));

  res.json({ subscriptions: results });
});

export default router;
