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
- No new fee/tax rules, tax legal interpretation, discounts, coupons, or invoice/GST treatment.
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


## EXH-03A–03C — Optional booking add-ons

### EXH-03A — Organizer configuration
- Organizers with `stall:manage` can create, edit, activate/deactivate, archive and restore exhibition-scoped optional add-ons.
- Add-ons include name, description, INR price, per-booking quantity limit, availability window and sort order.
- Organizer CRUD remains scoped to the organizer's exhibition and audited.

### EXH-03B — Exhibitor selection and booking summary
- Approved exhibitors can view only active, unarchived add-ons within their availability window for their own participation.
- Exhibitors choose quantities before payment initiation. The client submits add-on IDs and quantities only.
- Booking review shows the reserved stall, selected add-on snapshots, booking subtotal and the existing shared pricing breakdown.
- Payment-pending retries resume the existing payment and its immutable selection; a retry cannot replace the original selection.

### EXH-03C — Server-authoritative pricing and snapshots
- The server re-reads every selected add-on, checks exhibition ownership, active/archive state, availability window and quantity limit, then computes the booking subtotal.
- The existing shared pricing engine applies the already-configured platform fee/tax policy to the combined stall + add-on base amount. This does not define GST classification, seller-of-record or invoice treatment.
- A booking stores immutable add-on name, description, unit price, quantity and line total snapshots. Later organizer edits do not rewrite prior bookings.
- Add-on rows are created in the same database transaction that claims the participation's payment-pending state and creates the StallBooking. The existing stall row lock, reservation expiry, retry behavior and verified payment settlement remain authoritative.
- A concurrent add-on edit between preflight and booking is rejected with a refresh/retry response; no stale amount is charged.

### Scope boundaries and remaining validation
- Add-ons have a per-booking quantity limit only; there is no global stock/inventory counter in this phase.
- Live Razorpay activation remains out of scope.
- Invoice generation remains blocked pending a documented seller-of-record, issuer, GST treatment, numbering and retention policy.
