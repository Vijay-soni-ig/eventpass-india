import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { enqueueNotificationIntent } from "./notificationOutboxService";

// Phase 30 (FP-05) — Reservation expiry.
//
// PRODUCT DECISION (explicit, not inferred): a stall reservation
// (ExhibitionExhibitor.status === "stall_reserved", Stall.status ===
// "reserved") expires 1 hour after it was claimed if the exhibitor never
// starts a payment attempt. There is no scheduled sweep job — this app has
// no cron/background-worker infrastructure anywhere, and adding one is a
// separate infrastructure decision, not a side effect of this feature.
// Expiry is instead evaluated lazily: every place that would otherwise show
// or act on a stall's reservation state first gives any stale reservation a
// chance to release, via the functions in this file.
//
// SAFETY — the payment-vs-expiry race:
// Once an exhibitor calls POST /:id/payment, ExhibitionExhibitor.status
// becomes "payment_pending" and is governed by ITS OWN staleness window
// (STALE_PAYMENT_ATTEMPT_MS in exhibitorParticipations.ts), never this one.
// `isEligibleForExpiry` below is the single shared definition of "eligible
// to expire" (status still "stall_reserved", never "payment_pending") so
// there is exactly one place this rule is expressed, not two copies that
// could drift.
//
// The actual concurrency hazard this must close: an exhibitor calls
// POST /:id/payment (which flips participation stall_reserved->
// payment_pending) at the same moment a completely unrelated read elsewhere
// triggers this file's expiry sweep for the same stall. If both sides acted
// on unlocked reads, the sweep could still release the stall (and revert the
// participation to "approved") a moment AFTER the payment transaction reads
// "still stall_reserved" but BEFORE it commits its own status flip — leaving
// an active payment attempt pointing at a stall that's just been handed to
// someone else. `lockStallForUpdate` takes a real Postgres row lock
// (`SELECT ... FOR UPDATE`) on the stall inside the caller's transaction
// before any decision is made; exhibitorParticipations.ts's payment route
// takes the exact same lock on the exact same row before its own status
// flip. Whichever transaction reaches the row first commits before the
// other's lock is granted, so the second transaction always observes the
// first's outcome and re-evaluates against real, current state — never a
// stale read. See server/tests/phase30_reservationExpiry.test.ts for the
// race test proving this holds.
export const RESERVATION_EXPIRY_MS = 60 * 60 * 1000; // 1 hour — see product decision above.

export interface LockedStallRow {
  id: string;
  exhibitionId: string;
  status: string;
  exhibitionExhibitorId: string | null;
  reservedAt: Date | null;
}

/** Takes a real row lock on the stall inside the caller's open transaction. */
export async function lockStallForUpdate(tx: Prisma.TransactionClient, stallId: string): Promise<LockedStallRow | null> {
  const rows = await tx.$queryRaw<LockedStallRow[]>`
    SELECT id, "exhibitionId", status, "exhibitionExhibitorId", "reservedAt"
    FROM "stalls" WHERE id = ${stallId} FOR UPDATE
  `;
  return rows[0] ?? null;
}

function isEligibleForExpiry(stall: LockedStallRow, participationStatus: string | undefined, now: number): boolean {
  return (
    stall.status === "reserved" &&
    !!stall.exhibitionExhibitorId &&
    !!stall.reservedAt &&
    participationStatus === "stall_reserved" &&
    now - stall.reservedAt.getTime() >= RESERVATION_EXPIRY_MS
  );
}

export interface ExpiryOutcome {
  expired: boolean;
  participationId?: string;
}

/**
 * Given an ALREADY row-locked stall (via lockStallForUpdate, in the same
 * open transaction), releases it if its reservation is expired and
 * eligible. Idempotent: calling this on a stall that isn't eligible (already
 * released, already sold, still within the window, or mid-payment) is a
 * no-op — safe to call speculatively before every reservation decision.
 */
export async function expireStallIfEligible(tx: Prisma.TransactionClient, stall: LockedStallRow): Promise<ExpiryOutcome> {
  if (stall.status !== "reserved" || !stall.exhibitionExhibitorId || !stall.reservedAt) {
    return { expired: false };
  }
  const participation = await tx.exhibitionExhibitor.findUnique({ where: { id: stall.exhibitionExhibitorId } });
  if (!participation || !isEligibleForExpiry(stall, participation.status, Date.now())) {
    return { expired: false };
  }

  await tx.stall.update({
    where: { id: stall.id },
    data: { status: "available", exhibitionExhibitorId: null, reservedAt: null },
  });
  // Conditional: if the participation has already moved on for some other
  // reason since the read above (e.g. cancelled) in a way this same
  // transaction's lock wouldn't itself prevent, don't clobber that outcome —
  // the stall release above is still correct and idempotent regardless.
  await tx.exhibitionExhibitor.updateMany({
    where: { id: participation.id, status: "stall_reserved" },
    data: { status: "approved" },
  });

  return { expired: true, participationId: participation.id };
}

async function recordExpiry(exhibitionId: string, stallId: string, participationId: string): Promise<void> {
  await logAudit({
    actorUserId: null,
    action: "stall.reservation_expired",
    entityType: "Stall",
    entityId: stallId,
    metadata: { exhibitionId, participationId, expiryMs: RESERVATION_EXPIRY_MS },
  });
  // Enqueues durably; actual delivery (email/push/in-app rendering) is the
  // notification foundation's dispatcher/worker, which is a separate,
  // not-yet-built piece (see docs/notification-foundation-implementation-plan.md)
  // — enqueuing here is the honest scope of "post-expiry notification" until
  // that dispatcher exists.
  await enqueueNotificationIntent({
    eventKey: `stall-reservation-expired:${stallId}:${participationId}`,
    idempotencyKey: `stall-reservation-expired:${stallId}:${participationId}`,
    eventType: "STALL_RESERVATION_EXPIRED",
    entityType: "ExhibitionExhibitor",
    entityId: participationId,
    payload: { exhibitionId, stallId },
  });
}

/**
 * Lazy read-side correction: releases any expired reservations for an
 * exhibition so a GET that lists/renders its stalls (public exhibition
 * detail, the floor-plan endpoints, the organizer's own exhibition view)
 * reflects real current state instead of a reservation that's already
 * timed out but hasn't been touched since. Safe to call on every such read
 * — each candidate is independently locked and re-checked, so a stall that
 * was already released (by this call or a concurrent one) or that started a
 * payment attempt in the meantime is simply skipped, not double-processed.
 */
export async function releaseExpiredReservations(exhibitionId: string): Promise<ExpiryOutcome[]> {
  const cutoff = new Date(Date.now() - RESERVATION_EXPIRY_MS);
  const candidates = await prisma.stall.findMany({
    where: { exhibitionId, status: "reserved", reservedAt: { lt: cutoff } },
    select: { id: true },
  });
  if (candidates.length === 0) return [];

  const outcomes: ExpiryOutcome[] = [];
  for (const candidate of candidates) {
    const outcome = await prisma.$transaction(async (tx) => {
      const locked = await lockStallForUpdate(tx, candidate.id);
      if (!locked) return { expired: false } as ExpiryOutcome;
      return expireStallIfEligible(tx, locked);
    });
    if (outcome.expired && outcome.participationId) {
      await recordExpiry(exhibitionId, candidate.id, outcome.participationId);
    }
    outcomes.push(outcome);
  }
  return outcomes;
}

export { recordExpiry as recordReservationExpiryAudit };
