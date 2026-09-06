import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getStarterPlan, createTrialSubscription } from "./subscriptionService";
import { logAudit } from "./audit";

/**
 * Resolves the Organizer tenant for a user, creating one (with an "owner"
 * OrganizerMembership) the first time that user creates an exhibition.
 * This keeps exhibition creation working under the V2 schema without yet
 * building the organizer invite/management UI (a later phase).
 *
 * Two concurrent first-time calls for the same brand-new user both pass the
 * membership lookup below (neither has created anything yet) and both
 * attempt to create — this is a TOCTOU window, live-reproduced against a
 * real database: both requests returned 201, each with its own distinct
 * organizerId for the same user. Organizer.bootstrappedByUserId is @unique
 * specifically to close it (see schema.prisma for why this is a narrow
 * bootstrap-idempotency guard, not a general "one organizer per user"
 * rule — OrganizerMembership itself stays completely unrestricted). The
 * loser's create throws P2002; catch it and resolve to the winner's
 * organizer rather than letting it propagate as an unhandled rejection.
 *
 * Phase 20B: every organizer this function actually CREATES (not one it
 * merely resolves to, whether via the existing-membership fast path above
 * or the P2002-loser path below) also gets a Starter trialing Subscription,
 * in the SAME database transaction as the Organizer row itself. This is
 * deliberate, not incidental: it's what makes "exactly one subscription
 * per organizer, even under concurrent bootstrap requests" true without a
 * new schema constraint — only the one winning transaction ever reaches
 * createTrialSubscription(); a losing concurrent request hits the P2002
 * catch below and returns the winner's organizerId without creating
 * anything. See subscriptionService.ts's own doc comment on
 * createTrialSubscription() and docs/PHASE_20B_SUBSCRIPTION_LIFECYCLE_REPORT.md
 * Section 13.
 */
export async function resolveOrganizerId(userId: string): Promise<string> {
  const existingMembership = await prisma.organizerMembership.findFirst({
    where: { userId, role: "owner", status: "active" },
    select: { organizerId: true },
  });
  if (existingMembership) return existingMembership.organizerId;

  const [user, business, starterPlan] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, email: true } }),
    prisma.exhibitorBusiness.findUnique({ where: { ownerId: userId }, select: { companyName: true } }),
    getStarterPlan(),
  ]);

  try {
    const { organizer, subscription } = await prisma.$transaction(async (tx) => {
      const organizer = await tx.organizer.create({
        data: {
          name: business?.companyName || user?.fullName || user?.email || "Organizer",
          bootstrappedByUserId: userId,
          memberships: {
            create: { userId, role: "owner", status: "active" },
          },
        },
      });
      const subscription = await createTrialSubscription(tx, organizer.id, starterPlan.id);
      return { organizer, subscription };
    });

    // Logged after the transaction has actually committed — see
    // createTrialSubscription()'s own doc comment for why logAudit() is
    // never called from inside a transaction in this codebase.
    await logAudit({
      actorUserId: userId,
      action: "subscription.trial_created",
      entityType: "Organizer",
      entityId: organizer.id,
      metadata: { subscriptionId: subscription.id, planId: starterPlan.id, status: "trialing" },
    });

    return organizer.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const winner = await prisma.organizer.findUniqueOrThrow({
        where: { bootstrappedByUserId: userId },
        select: { id: true },
      });
      return winner.id;
    }
    throw err;
  }
}
