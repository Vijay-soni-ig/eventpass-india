export type StallPaymentState = "created" | "pending" | "paid" | "failed" | "cancelled" | "refunded" | "partially_refunded";

export interface StallFinancialBooking {
  amountPaid: string | number | { toString(): string };
  paymentStatus: StallPaymentState;
  payment?: {
    amount: string | number | { toString(): string };
    status: StallPaymentState;
    refundedAmount?: string | number | { toString(): string } | null;
  } | null;
}

export interface ExhibitorStallFinancialSummary {
  currency: "INR";
  grossPaid: number;
  refundedAmount: number;
  netSpend: number;
  pendingAmount: number;
  paidBookingCount: number;
  pendingBookingCount: number;
  failedBookingCount: number;
  refundedBookingCount: number;
}

function amount(value: StallFinancialBooking["amountPaid"] | NonNullable<StallFinancialBooking["payment"]>["amount"] | NonNullable<StallFinancialBooking["payment"]>["refundedAmount"]): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Derive exhibitor spend from server-owned payment state, never from the
 * StallBooking.amountPaid reservation snapshot alone. That column is filled
 * when a payment attempt is created, before funds are collected.
 */
export function buildExhibitorStallFinancialSummary(
  bookings: StallFinancialBooking[],
): ExhibitorStallFinancialSummary {
  let grossPaid = 0;
  let refundedAmount = 0;
  let pendingAmount = 0;
  let paidBookingCount = 0;
  let pendingBookingCount = 0;
  let failedBookingCount = 0;
  let refundedBookingCount = 0;

  for (const booking of bookings) {
    const state = booking.payment?.status ?? booking.paymentStatus;
    const bookingAmount = amount(booking.payment?.amount ?? booking.amountPaid);

    if (state === "paid" || state === "partially_refunded" || state === "refunded") {
      grossPaid += bookingAmount;
      paidBookingCount += 1;
      const refunded = state === "refunded"
        ? bookingAmount
        : booking.payment ? amount(booking.payment.refundedAmount) : 0;
      refundedAmount += Math.min(refunded, bookingAmount);
      if (refunded > 0 || state === "refunded") refundedBookingCount += 1;
    } else if (state === "created" || state === "pending") {
      pendingAmount += bookingAmount;
      pendingBookingCount += 1;
    } else if (state === "failed" || state === "cancelled") {
      failedBookingCount += 1;
    }
  }

  return {
    currency: "INR",
    grossPaid: Number(grossPaid.toFixed(2)),
    refundedAmount: Number(refundedAmount.toFixed(2)),
    netSpend: Number(Math.max(0, grossPaid - refundedAmount).toFixed(2)),
    pendingAmount: Number(pendingAmount.toFixed(2)),
    paidBookingCount,
    pendingBookingCount,
    failedBookingCount,
    refundedBookingCount,
  };
}
