/**
 * Business rules for organizer-side stall management.
 *
 * A Stall is commercial inventory: bookings, payments and published floor
 * plans all point at it. StallBooking and FloorPlanObject both reference Stall
 * with onDelete: Cascade, so a careless delete would silently erase financial
 * booking records and change a public floor plan. These rules are kept pure
 * (no Prisma import) so they can be unit-tested and reused by the routes.
 */

export type StallStatusValue = "available" | "reserved" | "sold";

export interface StallFacts {
  status: StallStatusValue;
  /** Number of StallBooking rows of any payment status pointing at the stall. */
  bookingCount: number;
  /** True when the stall is currently assigned to an exhibitor participation. */
  hasExhibitor: boolean;
}

/** Fields that describe what is being sold. Locked once a stall is in play. */
export const COMMERCIAL_STALL_FIELDS = ["code", "stallType", "size", "price"] as const;

/** Trim a user-supplied stall code; blank becomes undefined (= no code). */
export function normalizeStallCode(code: string | undefined | null): string | undefined {
  const trimmed = (code ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Why a stall cannot be deleted, or null when deletion is safe. */
export function stallDeleteBlock(facts: StallFacts & { inPublishedFloorPlan: boolean }): string | null {
  if (facts.bookingCount > 0) {
    return "This stall has booking records and cannot be deleted. Booking history must be preserved.";
  }
  if (facts.status !== "available" || facts.hasExhibitor) {
    return "Only an available stall with no exhibitor assigned can be deleted.";
  }
  if (facts.inPublishedFloorPlan) {
    return "This stall is placed on a published floor plan. Remove it from the floor plan and republish before deleting it.";
  }
  return null;
}

/**
 * Why the given patch cannot be applied, or null when it is allowed.
 * Position/size geometry (posX, posY, width, height) is floor-plan layout and
 * is always editable; commercial fields are locked once the stall is not a
 * free, never-booked stall.
 */
export function stallEditBlock(facts: StallFacts, patchKeys: string[]): string | null {
  const touchesCommercial = patchKeys.some((k) => (COMMERCIAL_STALL_FIELDS as readonly string[]).includes(k));
  if (!touchesCommercial) return null;
  if (facts.bookingCount > 0 || facts.status !== "available" || facts.hasExhibitor) {
    return "Code, type, size and price can only be changed on an available stall that has never been booked.";
  }
  return null;
}

/** Case-insensitive duplicate check for a stall code within one exhibition. */
export function isDuplicateStallCode(existingCodes: Array<string | null>, candidate: string): boolean {
  const wanted = candidate.trim().toLowerCase();
  return existingCodes.some((c) => c !== null && c.trim().toLowerCase() === wanted);
}
