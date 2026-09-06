import { getActivePricingVersion } from "./pricingVersion";
import type { FeePayer } from "@prisma/client";

export interface PricingBreakdown {
  baseAmount: number;
  platformFeeAmount: number;
  /** Informational cost tracking only — never added to what the customer pays. */
  gatewayFeeAmount: number;
  taxAmount: number;
  discountAmount: number;
  /** The customer-payable total — what `Payment.amount` is set to. */
  totalAmount: number;
  /** What the organizer is owed for this transaction. */
  organizerAmount: number;
  /** ExhibitTix's own revenue from this transaction. */
  platformRevenueAmount: number;
  pricingVersionId: string;
  feePaidBy: FeePayer;
}

/**
 * Rounds to 2 decimal places (paise-level precision for INR), applied at
 * every intermediate step to avoid floating-point drift accumulating across
 * a multi-term calculation. This mirrors the rounding discipline the
 * pre-existing codebase already used for money (e.g. razorpay.ts's
 * `Math.round(amount * 100)` paise conversion) — plain JS `number` is the
 * established pattern throughout this project's money handling (every
 * route already does `Number(ticketType.price)` etc.), so the pricing
 * engine follows that same convention rather than introducing a different
 * arithmetic strategy (e.g. decimal.js) used nowhere else in the codebase.
 * Persisted storage remains Prisma's Decimal(10,2) either way.
 */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * THE single authoritative pricing calculation. Both ticket and stall
 * payment creation call this exact function — see routes/bookings.ts and
 * routes/exhibitorParticipations.ts, which both go through
 * lib/paymentService.ts's createOrderForPayment(), which calls this. There
 * is no other place in the codebase that computes a charged amount.
 *
 * `baseAmount` must already be a trusted, server-computed figure (e.g.
 * `ticketType.price * quantity` read fresh from the database) — this
 * function never accepts or trusts anything from a client request.
 */
export async function calculatePricing(baseAmount: number): Promise<PricingBreakdown> {
  const pricingVersion = await getActivePricingVersion();

  let platformFeeAmount = 0;
  const feePercent = pricingVersion.platformFeePercent ? Number(pricingVersion.platformFeePercent) : 0;
  const feeFixed = pricingVersion.platformFeeFixedAmount ? Number(pricingVersion.platformFeeFixedAmount) : 0;
  switch (pricingVersion.platformFeeType) {
    case "none":
      platformFeeAmount = 0;
      break;
    case "fixed":
      platformFeeAmount = feeFixed;
      break;
    case "percentage":
      platformFeeAmount = round2(baseAmount * (feePercent / 100));
      break;
    case "percentage_plus_fixed":
      platformFeeAmount = round2(baseAmount * (feePercent / 100)) + feeFixed;
      break;
  }
  platformFeeAmount = round2(platformFeeAmount);

  // Deliberately NOT "0% tax" — taxMode === "none" means tax has not been
  // configured at all (a genuine, unresolved business/legal question), so
  // no tax amount is computed, not even a zero one derived from a rate.
  // TicketType.taxPercent is intentionally never read here — see that
  // field's own schema comment.
  let taxAmount = 0;
  if (pricingVersion.taxMode === "configured") {
    const taxPercent = pricingVersion.taxPercent ? Number(pricingVersion.taxPercent) : 0;
    const taxableBase = pricingVersion.taxBasis === "base_plus_fee" ? baseAmount + platformFeeAmount : baseAmount;
    taxAmount = round2(taxableBase * (taxPercent / 100));
  }

  // No discount/coupon system exists yet (explicitly out of scope for this
  // phase) — always 0, kept as an explicit field so the formula and the
  // schema are ready for one without a future signature change here.
  const discountAmount = 0;

  // No gateway-fee-passthrough configuration exists yet — tracked as 0,
  // informational only; it is never added to what the customer pays.
  const gatewayFeeAmount = 0;

  const attendeePaysFee = pricingVersion.feePaidBy === "attendee" || pricingVersion.feePaidBy === "split";
  const organizerPaysFee = pricingVersion.feePaidBy === "organizer" || pricingVersion.feePaidBy === "split";
  // Note: "split" is accepted by the schema/enum as a future-proofing value,
  // but no split-ratio configuration exists yet, so it currently behaves
  // identically to charging the full fee to both named parties' potential
  // share is not double-counted — only the attendee-facing total and the
  // organizer-payable amount each independently account for the fee when
  // their respective flag is set. A real split ratio is future scope.

  const totalAmount = round2(baseAmount + (attendeePaysFee ? platformFeeAmount : 0) + taxAmount - discountAmount);
  const organizerAmount = round2(baseAmount - discountAmount - (organizerPaysFee ? platformFeeAmount : 0));
  const platformRevenueAmount = platformFeeAmount;

  return {
    baseAmount: round2(baseAmount),
    platformFeeAmount,
    gatewayFeeAmount,
    taxAmount,
    discountAmount,
    totalAmount,
    organizerAmount,
    platformRevenueAmount,
    pricingVersionId: pricingVersion.id,
    feePaidBy: pricingVersion.feePaidBy,
  };
}
