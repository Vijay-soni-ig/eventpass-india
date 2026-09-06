import { prisma } from "./prisma";
import type { PricingVersion } from "@prisma/client";

/**
 * Resolves the single PricingVersion new payments should be created against
 * right now. There is deliberately no in-memory caching here (unlike
 * getPaymentProvider()'s cache) — a future admin action changing which
 * version is active must take effect on the very next payment, not after a
 * process restart.
 */
export async function getActivePricingVersion(): Promise<PricingVersion> {
  const version = await prisma.pricingVersion.findFirst({
    where: { active: true, effectiveFrom: { lte: new Date() } },
    orderBy: { effectiveFrom: "desc" },
  });
  if (!version) {
    throw new Error(
      "No active PricingVersion is configured. This should never happen outside a broken migration/seed — every environment must have at least one active pricing version for new payments to reference."
    );
  }
  return version;
}

/**
 * Creates a new PricingVersion. This is the ONLY way pricing rules should
 * ever change — there is intentionally no updatePricingVersion() function
 * anywhere in this codebase. A future admin UI for pricing changes must call
 * this to create a new row (optionally deactivating the old one via a
 * separate, narrow "retire" call below), never mutate an existing row's
 * fee/tax fields.
 */
export async function createPricingVersion(data: {
  code: string;
  description?: string;
  platformFeeType?: "none" | "fixed" | "percentage" | "percentage_plus_fixed";
  platformFeePercent?: number;
  platformFeeFixedAmount?: number;
  feePaidBy?: "organizer" | "attendee" | "split";
  taxMode?: "none" | "configured";
  taxPercent?: number;
  taxBasis?: "base_amount" | "base_plus_fee";
  currency?: string;
  effectiveFrom?: Date;
  active?: boolean;
}): Promise<PricingVersion> {
  return prisma.pricingVersion.create({
    data: {
      code: data.code,
      description: data.description,
      platformFeeType: data.platformFeeType ?? "none",
      platformFeePercent: data.platformFeePercent,
      platformFeeFixedAmount: data.platformFeeFixedAmount,
      feePaidBy: data.feePaidBy ?? "organizer",
      taxMode: data.taxMode ?? "none",
      taxPercent: data.taxPercent,
      taxBasis: data.taxBasis,
      currency: data.currency ?? "INR",
      effectiveFrom: data.effectiveFrom ?? new Date(),
      active: data.active ?? true,
    },
  });
}

/**
 * Deactivates a PricingVersion so it's no longer selectable for NEW
 * payments — this does NOT change its financial meaning or any field a
 * Payment might already reference; it only flips whether
 * getActivePricingVersion() can return it going forward. Safe to call on a
 * version that has already been used by real payments.
 */
export async function retirePricingVersion(id: string): Promise<PricingVersion> {
  return prisma.pricingVersion.update({ where: { id }, data: { active: false } });
}

/**
 * The core immutability guarantee: throws if `id` has ever been referenced
 * by a Payment. There is no code path in this project that mutates a
 * PricingVersion's fee/tax fields at all (see createPricingVersion's doc
 * comment) — this function exists so that guarantee is enforced and
 * testable, not just a convention someone could accidentally violate later
 * by adding an update() function without checking this first.
 */
export async function assertPricingVersionMutable(id: string): Promise<void> {
  const inUse = await prisma.payment.count({ where: { pricingVersionId: id } });
  if (inUse > 0) {
    throw new Error(
      `PricingVersion "${id}" has already been referenced by ${inUse} payment(s) and cannot be mutated. Create a new PricingVersion instead.`
    );
  }
}
