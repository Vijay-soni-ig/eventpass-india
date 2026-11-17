# Phase 3 — Guided Exhibitor Stall Booking

## Objective
Deliver a clear exhibitor journey from organizer-approved participation through stall selection, booking review, existing payment abstraction, and server-confirmed confirmation.

## Existing verified foundation on main
- Exhibitors discover eligible published exhibitions and submit applications.
- Organizers approve/reject applications through the existing participation workflow.
- Only approved participations can reserve a stall.
- Stall selection supports published multi-hall floor plans and an accessible list fallback.
- Reservation uses a database row lock and conditional update to prevent double booking.
- Reservations expire lazily after one hour when payment has not started; payment-pending reservations are not released by that expiry path.
- Payment initiation is retry-safe and uses the shared pricing engine.
- Payment success is only applied through server-verified provider callbacks/webhooks or the mock-provider verification path.
- Existing participation and payment history remain the source of truth.

## Confirmed gap addressed in Phase 3
The current UI jumps from selecting a stall to a reservation state and then directly opens payment. It does not give the exhibitor a dedicated booking review step showing the exact persisted payment amount/breakdown and the event's published refund policy and terms before opening checkout.

## Implementation
- Add a review step between payment-order preparation and opening the existing payment dialog.
- Display event, venue/city, reserved stall, stall type/size, server-persisted base amount, platform fee, configured tax, discount, and exact customer-payable Payment.amount.
- Explain organizer-paid platform fees accurately and keep informational gateway costs out of customer payable totals.
- Display event refund policy and terms. If terms exist, require explicit acceptance before continuing to checkout.
- Keep payment order creation, payment verification, reservation expiry, concurrency control, booking history, and server-side status transitions unchanged.
- Keep the existing mock/real provider selection; do not activate or add a live provider.

## Explicit exclusions
- No KYC gating policy; required-document rules and their relationship to stall booking remain a separate product decision.
- No new payment provider or live Razorpay activation.
- No new fee/tax rules, tax legal interpretation, discounts, coupons, add-ons, or pricing configuration.
- No visitor QR ticket behavior or exhibitor access QR.
- No schema migration or changes to booking/payment state machines.

## Acceptance criteria
- Application must be approved before stall selection.
- Stall reservation remains concurrency-safe and expiry-safe.
- Booking review uses the same persisted Payment record that the checkout will use; it must not calculate a client-side total.
- Terms acceptance is required only when event terms exist.
- User can defer review and resume the same pending payment from My Participations without creating duplicate attempts.
- Failed/abandoned payment never marks the participation confirmed.
- Successful payment only displays confirmation after server verification and participation query reconciliation.
- Browser E2E covers application → organizer approval → stall reservation → booking review → payment → confirmed status.
- Existing backend shards, migration-upgrade, frontend quality, Browser E2E and Dependency Audit remain green on the exact PR head.
