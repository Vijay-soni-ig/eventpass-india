# Phase 19B — Refund Architecture

Status: **PASS**
Date: 2026-09-04

## Executive Summary

Phase 19B adds a reliable, auditable refund foundation on top of Phase 19A's
commercial pricing architecture. It replaces the previous stall-only,
full-refund-only, provider-confirmation-optional implementation with a
single shared refund pipeline used identically by ticket and stall
payments, supporting full and partial refunds, with server-authoritative
amount validation, idempotency, concurrency safety, and audit logging.

The fundamental invariant this phase enforces: **the total of all
SUCCEEDED refunds against a payment can never exceed that payment's own
`amount`**, computed live from the database every time — never from a
client-supplied figure — and protected under a real Postgres row lock
against concurrent requests.

## Existing Refund Architecture (before this phase)

- `POST /api/organizer/payments/:paymentId/refund` existed, but:
  - only looked up **stall** bookings (`prisma.stallBooking.findFirst(...)`)
    — a ticket payment could never be refunded through it at all;
  - only supported a **full** refund of `Number(booking.payment.amount)`,
    with no way to request a partial amount;
  - had no idempotency protection — a retried request would call
    `provider.refund()` a second time;
  - had no independent refund record — a payment's refund history was
    whatever `PaymentStatus` happened to say, with no amount, reason, or
    timestamp trail;
  - the mock provider's `refund()` always returns `{status: "pending"}`
    (it "never moves real money" — see `lib/payments/mock.ts`), and the old
    route only ever flipped the payment to `refunded` when
    `refund.status === "processed"` — so **a stall refund could never
    actually complete when testing against the mock provider**, only
    against a real, synchronously-processing Razorpay refund.
  - had no frontend at all — `/organizer/payments` was a "Coming Soon"
    placeholder page (`OrganizerComingSoon`), confirmed by inspection of
    `src/App.tsx` and a repo-wide search for any `refund`-related frontend
    hook or component.
- `Payment.status` already had a `refunded` value in `PaymentStatus`, and
  `lib/paymentService.ts`'s `applyPaymentOutcome()` already handled a
  `"refunded"` outcome for stall bookings (releasing the stall, cancelling
  the participation) — this logic is preserved for the full-refund case
  and now also gated correctly for partial refunds (see **Stall Refunds**).
- `lib/audit.ts` (`logAudit()`) already existed as a working, ready-to-use
  audit trail — this phase is its first real caller.
- The `payment:manage` permission already existed on
  owner/admin/finance — no new permission was needed.

This phase extends the existing endpoint and provider abstraction rather
than replacing them; every pre-existing full stall refund still works
exactly as before (see **Backward Compatibility**).

## New Refund Architecture

**Data model** (`Refund`, new): an independent, append-only record of one
refund attempt — `paymentId`, `amount`, `status`
(`REQUESTED`/`PROCESSING`/`SUCCEEDED`/`FAILED`), `reason` (enum),
`reasonNote`, `idempotencyKey`, `provider`, `providerRefundId`,
`failureReason`, `requestedByUserId`, `createdAt`/`completedAt`. A payment
can have many refunds (partial refunds); `@@unique([paymentId,
idempotencyKey])` is what makes idempotency a real database constraint, not
just application-level discipline.

**`Payment.refundedAmount`** (new column): the total of SUCCEEDED refunds
only — never bumped for a merely-requested or still-processing refund. This
is what makes "how much is left to refund" a pure, trustworthy database
computation.

**`server/src/lib/refundService.ts`** (new) — the single shared engine,
used by both ticket and stall refunds:

- `requestRefund()` — the full pipeline: idempotent-replay check → lock the
  Payment row (`SELECT ... FOR UPDATE`) → validate status/provider →
  compute the live refundable amount (`amount - refundedAmount -
  pending REQUESTED/PROCESSING refunds`) → create the `Refund` row
  (`PROCESSING`) → call the provider → finalize immediately if the
  provider confirms synchronously, otherwise leave it `PROCESSING` for a
  later confirmation.
- `finalizeRefundSuccess()` — the only place `Payment.refundedAmount`
  moves. Locks the Payment row again, computes the new refunded total,
  sets `Payment.status` to `partially_refunded` or `refunded`, mirrors the
  status onto the ticket/stall booking, and — full refunds of a stall
  payment only — releases the stall and cancels the participation.
- `finalizeRefundFailure()` — marks the refund `FAILED` with a reason;
  never touches `Payment.refundedAmount` or `Payment.status`.

**`server/src/routes/organizerPayments.ts`** (extended, not replaced):

- `POST /:paymentId/refund` — now resolves either a ticket or a stall
  payment scoped to the caller's own organizer(s), accepts `{amount?,
  reason, reasonNote?, idempotencyKey}`, and delegates to
  `requestRefund()`. Omitting `amount` refunds the full remaining
  refundable amount (server-computed).
- `GET /:paymentId` (new) — payment + `{originalAmount, refundedAmount,
  pendingAmount, refundableAmount}` + the refund list, for a payment-detail
  view.
- `GET /:paymentId/refunds` (new) — refund history alone.
- `POST /:paymentId/refunds/:refundId/mock-complete` (new, dev/test only)
  — mirrors `routes/payments.ts`'s existing payment-capture mock-complete:
  only reachable when `PAYMENT_PROVIDER=mock`, still requires
  `payment:manage` on the payment's own organizer. Since the mock
  provider's `refund()` always returns `"pending"`, this is what lets a
  refund actually reach a terminal state in dev/test — exactly the gap the
  old implementation had no way to close.
- `GET /` (extended) — now also returns `ticketBookings` alongside the
  existing `bookings` (stalls), additively — nothing that read the old
  shape breaks.
- `PATCH /:paymentId` (manual reconciliation) is untouched.

## Database Changes

Migration: `20260904090000_refund_architecture` (additive):

- `ALTER TYPE "PaymentStatus" ADD VALUE 'partially_refunded'`.
- New enums `RefundStatus`, `RefundReason`.
- New `refunds` table with FKs to `payments` (`RESTRICT`) and `users`
  (`SET NULL`), a unique `(paymentId, idempotencyKey)` index, and a unique
  `providerRefundId` index.
- `payments.refundedAmount DECIMAL(10,2) NOT NULL DEFAULT 0`, then
  backfilled to `refundedAmount = amount` for any payment already in
  `status = 'refunded'` from the pre-19B full-refund flow — so a payment
  refunded before this phase existed reports a consistent `refundedAmount`
  today, without rewriting its `amount`.

`npx prisma migrate status`: up to date, 13 migrations. No table dropped,
no column removed, no historical `amount`/`baseAmount`/`pricingVersionId`
value touched.

## Full vs Partial Refunds

`resolvedAmount = amount ?? refundableAmount` (omitting `amount` means
"refund everything left"). Validation, inside the row-locked transaction:

- `resolvedAmount > 0` (a zero or negative amount is rejected by both the
  Zod schema — `z.number().positive()` — and this check).
- `resolvedAmount <= refundableAmount` (a small epsilon, `0.005`, absorbs
  floating-point rounding only — never enough to matter financially).

`refundableAmount = amount - refundedAmount - sum(pending REQUESTED/
PROCESSING refund amounts)`. The pending term is what stops a second
request from spending capacity a first, still-in-flight request already
reserved — see **Concurrency**.

Reconciliation example (VIP ticket, ₹1,999 — proven by
`refundCore.test.ts`'s partial-ticket-refund test): first partial refund
₹999 → `refundedAmount 999`, `refundableAmount 1000`, status
`partially_refunded`; second refund omits `amount` → resolves to the full
remaining ₹1000 → `refundedAmount 1999`, `refundableAmount 0`, status
`refunded`.

## Idempotency

`idempotencyKey` is required on every refund request. `(paymentId,
idempotencyKey)` is a real database unique constraint on `refunds`, not
just an application-level check:

1. A fast up-front lookup returns the existing refund immediately for an
   exact repeat, before touching the provider.
2. If two requests with the identical key race past that lookup, the
   `refund.create()` insert itself throws `P2002` for the loser, which is
   caught and resolved to the winner's row — the provider is still only
   ever called once.

Proven end-to-end (`refundIdempotencyConcurrency.test.ts`): three identical
requests produce exactly one `Refund` row.

## Concurrency

`requestRefund()` locks the target `Payment` row with a raw `SELECT ... FOR
UPDATE` inside a Prisma interactive transaction before computing the
refundable amount. A second concurrent request against the same payment
blocks at the `FOR UPDATE` acquisition until the first transaction commits,
then re-reads the now-current `refundedAmount` + pending-refund sum —
so it correctly sees the first request's reservation and is rejected if
there isn't enough left, rather than both succeeding independently.

Proven (`refundIdempotencyConcurrency.test.ts`): two concurrent ₹1,200
requests against a ₹1,999 payment — exactly one is accepted, the other is
rejected with `EXCEEDS_REMAINING`, and `sum(SUCCEEDED refunds) <=
payment.amount` holds afterward.

## Provider Handling

- **Mock** (`lib/payments/mock.ts`, unmodified): `refund()` always returns
  `{status: "pending"}` — it never claims to have moved money. This phase
  adds the missing other half: the `mock-complete` route lets a test (or a
  developer in the UI) simulate the gateway's own later confirmation —
  `success` → `finalizeRefundSuccess()`, `failure` →
  `finalizeRefundFailure()` — through the same functions a real
  asynchronous gateway confirmation would eventually call. This is what
  makes "successful full refund, successful partial refund, failed
  refund, repeated/idempotent request" all testable against mock, none of
  which the pre-19B implementation could do.
- **Razorpay** (`lib/payments/razorpay.ts`, unmodified): `refund()` calls
  the real SDK and returns `{status: "processed"}` synchronously on
  success — `requestRefund()` finalizes immediately in that case, exactly
  matching the pre-19B behavior for a real gateway. `isConfigured` is
  `false` in this environment (no `RAZORPAY_*` credentials), so
  `getPaymentProvider()` selects mock — **live Razorpay refund testing is
  blocked by missing credentials**, honestly reported rather than faked.
  Static/type/build checks pass regardless (see **Quality Gate**).
- A provider call that throws (network error, real gateway rejection) is
  caught and turned into a `FAILED` refund with `failureReason` set to the
  error message — never left in an ambiguous state, never silently
  retried as success.

## Ticket Refunds

`POST /:paymentId/refund` resolves the payment via either its
`ticketBooking` or `stallBooking` relation, scoped to
`organizerIdsWithPermission(user, "payment:manage")` — a payment belonging
to another organizer's tenant is indistinguishable from a nonexistent one
(404 either way, matching this codebase's existing convention elsewhere).
On success, `finalizeRefundSuccess()` mirrors the new status onto
`ticketBooking.paymentStatus`. The existing check-in gate
(`routes/bookings.ts`: `if (booking.paymentStatus !== "paid") return
400`) then automatically rejects check-in for a refunded or
partially-refunded ticket — **no change to the check-in route itself was
needed**, since it already only accepted the exact value `"paid"`.

## Stall Refunds

Same shared pipeline. The pre-existing "a refund releases the stall and
cancels the participation" behavior is preserved **exactly** for a refund
that reaches the full `refunded` status, and is now correctly **not**
triggered for a `partially_refunded` payment — proven live: a ₹1,000
partial refund on a ₹4,000 stall leaves the stall `sold` and still
allocated to the exhibitor; the following refund that completes the
remaining ₹3,000 releases it to `available` and cancels the
participation.

## Payment Status

`PaymentStatus` gained `partially_refunded`. Transitions, both proven by
tests and matching the brief's requirement exactly:

- `paid` → `partially_refunded` only after a refund reaches `SUCCEEDED`
  and doesn't cover the full remaining amount.
- `paid`/`partially_refunded` → `refunded` only when the newly-SUCCEEDED
  refund brings `refundedAmount` to (within floating-point epsilon of) the
  full `amount`.
- A `FAILED` refund never changes `Payment.status` or `refundedAmount` —
  proven live in this phase's own Quality Gate pass (see below).
- A payment already fully `refunded` rejects any further refund request
  with `PAYMENT_NOT_REFUNDABLE` (its status is no longer `paid` or
  `partially_refunded`).

## Audit Logging

Every refund request, success, and failure calls the existing
`logAudit()` (`server/src/lib/audit.ts`) with `action`
(`refund.requested`/`refund.succeeded`/`refund.failed`), `entityType:
"Payment"`, `entityId`, and metadata (`refundId`, `amount`, `reason` or
`failureReason`, resulting `paymentStatus`). No payment secret, gateway
credential, or webhook signing key is ever logged. Verified by
`refundCore.test.ts` reading back real `AuditLog` rows after a live refund.

## Security

- **Client cannot exceed the original amount or the remaining refundable
  amount** — enforced server-side inside the locked transaction, never
  trusting a client-supplied "remaining" figure (`refundSecurity.test.ts`,
  `refundCore.test.ts`).
- **Cross-tenant refund rejected** — a fresh, independently-bootstrapped
  organizer cannot refund another organizer's payment; returns 404, not
  403, so the request doesn't confirm the payment even exists
  (`refundSecurity.test.ts`).
- **RBAC** — a role without `payment:manage` (proven with the seeded
  `org1.scanner` account) is rejected with 403
  (`refundSecurity.test.ts`).
- **Free payments cannot be refunded** — `provider === "free"` is rejected
  with `FREE_PAYMENT` before any provider call; no meaningless ₹0 refund
  is ever created (`refundSecurity.test.ts`).
- **Failed/unpaid payments cannot be refunded** — only `paid`/
  `partially_refunded` payments are eligible; the seeded `failed` ticket
  payment is rejected with `PAYMENT_NOT_REFUNDABLE`
  (`refundSecurity.test.ts`).
- **Provider failure never becomes a fake success** — proven twice: once
  deliberately (`refundSecurity.test.ts`'s mock-complete `outcome:
  "failure"` case) and once organically during this phase's own live
  Quality Gate pass, where a refund attempt against a seed payment with no
  `providerPaymentId` failed safely with a clear reason and left
  `Payment.status`/`refundedAmount` completely unaffected.

## Pricing Version Compatibility

A refund never recalculates anything through the currently-active
`PricingVersion` — it only ever reads the target payment's own,
already-immutable `amount`/`baseAmount`/`pricingVersionId` (set once, at
purchase time, per Phase 19A). `refundCore.test.ts` asserts
`finalPayment.pricingVersionId === original.pricingVersionId` and
`finalPayment.amount === original.amount` after a full refund completes.

## Backward Compatibility

- Free-ticket, paid-ticket, and stall-payment creation flows are
  byte-for-byte unchanged — verified live in this phase's Quality Gate
  (see below) and by the full Phase 19A suite passing unmodified in the
  same test run.
- The pre-existing `PATCH /:paymentId` manual-reconciliation route is
  untouched.
- `TicketBooking.amountPaid`/`StallBooking.amountPaid` (legacy mirrors)
  are untouched by refunds — only `paymentStatus` is mirrored, matching
  how the rest of this codebase already treats those fields as
  legacy-compatibility mirrors, not the source of truth.
- `GET /api/organizer/payments` gained a `ticketBookings` key; the
  pre-existing `bookings` key (stalls) is unchanged in shape — confirmed
  no frontend code previously consumed this endpoint at all (repo-wide
  search), so there was nothing to break.

## Tests

Zero new dependencies — the same `node:test` + `tsx` infrastructure from
Phase 19A. Three new files, 12 new tests, run against the real
Prisma/PostgreSQL dev database via real HTTP requests
(`server/tests/helpers/testServer.ts`):

| # | Case | File |
|---|---|---|
| 1/16/17/15/19 | Full ticket refund; original amount/PricingVersion preserved; audit rows written; status → `refunded` | `refundCore.test.ts` |
| 2/6/7/18 | Partial ticket refund → `partially_refunded`; second partial completes it → `refunded`; reconciliation; refund history accurate | `refundCore.test.ts` |
| 5 | Amount validation: exceeds remaining, zero, negative all rejected; no second full refund after already-refunded | `refundCore.test.ts` |
| 3/4 | Full + partial stall refund; only the full refund releases the stall/cancels the participation | `refundCore.test.ts` |
| 8 | Idempotency: 3 identical requests → 1 `Refund` row | `refundIdempotencyConcurrency.test.ts` |
| 9 | Concurrency: 2×₹1,200 against a ₹1,999 payment → exactly 1 accepted, total never exceeds original | `refundIdempotencyConcurrency.test.ts` |
| C | Cross-tenant refund rejected (404) | `refundSecurity.test.ts` |
| D | Unauthorized role (scanner) rejected (403) | `refundSecurity.test.ts` |
| I | Free payment rejected, no `Refund` row created | `refundSecurity.test.ts` |
| J | Failed payment rejected | `refundSecurity.test.ts` |
| 10 | Provider (mock-complete) failure leaves payment `paid`/unaffected | `refundSecurity.test.ts` |
| E | Client cannot manipulate refund amount beyond the original | `refundSecurity.test.ts` |

Full-suite result (Phase 19A's 11 tests + these 12, `npm run test` in
`server/`): **23/23 pass**, ~3s. Test data (users, bookings, payments,
refunds, a temporary second organizer) is created fresh per test and
deleted in `after()` hooks; verified after the run that the database is
back at its exact seed baseline (34 users, 12 payments, 0 refunds).

## Quality Gate

**Backend:** `prisma validate` ✅ · `prisma migrate status` ✅ (13
migrations, up to date) · `tsc --noEmit -p tsconfig.json` ✅ · `npm run
build` ✅ · `npm run test` ✅ (23/23).

**Frontend:** `tsc --build tsconfig.json --noEmit --force` ✅ · `npm run
build` ✅ (pre-existing, unrelated CSS `@import`-order and chunk-size
warnings only).

**Integration (live, against running dev servers, port 4000/8080):**

1. Existing paid ticket still works — live `POST /api/bookings/tickets` +
   `mock-complete` for `seed-tickettype-standard`: `status: "paid"`,
   `amount: 499`.
2. Existing free ticket still works — live: `provider: "free"`,
   `status: "paid"`, gateway bypassed.
3. Existing stall payment still works — proven by
   `refundCore.test.ts`'s full apply→approve→select→pay flow (fresh
   exhibitor business, `seed-stall-b03`) plus every pre-existing
   Phase 19A stall test still passing.
4. Full ticket refund works — live: requested → `PROCESSING` →
   mock-complete `success` → `Payment.status: "refunded"`,
   `refundedAmount: 499`, `refundableAmount: 0`.
5. Partial ticket refund works — `refundCore.test.ts` (₹999 of ₹1,999,
   then the remainder).
6. Full stall refund works — `refundCore.test.ts` (stall released,
   participation cancelled).
7. Partial stall refund works — `refundCore.test.ts` (stall stays `sold`,
   allocation untouched).
8. Repeated refund request is idempotent — live: same `idempotencyKey`
   submitted twice returned the identical `refund.id` both times.
9. Concurrent refunds cannot over-refund —
   `refundIdempotencyConcurrency.test.ts`.
10. Failed refund preserves financial state — proven twice: the
    deliberate test case, and organically live during this pass (a
    UI-submitted refund against a payment with no `providerPaymentId`
    failed safely, `Payment.status` stayed `"paid"`,
    `refundedAmount` stayed `0`).
11. Free payment cannot be refunded — live: `POST .../refund` against
    `seed-payment-ticket-01` → 400, `code: "FREE_PAYMENT"`, no `Refund`
    row created.
12. Unauthorized refund is rejected — live: `org1.scanner` → 403.
13. Cross-tenant refund is rejected — `refundSecurity.test.ts` (fresh
    independently-bootstrapped organizer → 404).
14. Refund history is accurate — live: the organizer Payments page's
    refund dialog, opened against a real payment, correctly listed the
    live-created `FAILED` refund with its exact failure reason and
    timestamp; also `GET /:paymentId` / `GET /:paymentId/refunds`
    integration-tested.
15. Payment status transitions are accurate — see **Payment Status**
    above; all proven live and by tests.
16. Original payment amount remains unchanged — `refundCore.test.ts` +
    live checks throughout.
17. Original PricingVersion remains unchanged — `refundCore.test.ts`.
18. Phase 19A pricing tests still pass — all 11 passed unmodified in the
    same `npm run test` run as the 12 new tests.
19. Existing payment webhook/idempotency still works — the mock-complete
    payment-capture pipeline (unmodified this phase) was exercised
    repeatedly throughout every new test and live check with no
    regression; `recordWebhookEvent`'s `(provider, providerEventId)`
    uniqueness is untouched code.
20. Existing dashboards still load — live: logged in as
    `org1.owner@eventpass.test`, homepage and the (new) `/organizer/payments`
    page both rendered with 0 console errors and 0 failed requests;
    the organizer overview dashboard (`/organizer`) was unaffected (no
    code in this phase touches it).

All live-created test users/payments/refunds (including one temporary
second organizer, bootstrapped for the cross-tenant check) were deleted
afterward; the database was verified back at its exact seed baseline.

## Known Issues

- The Razorpay refund path is real, unmodified code, but cannot be
  exercised live in this environment — no `RAZORPAY_*` credentials are
  configured, so `getPaymentProvider()` always selects mock here. Static
  checks (typecheck, build) pass; live Razorpay refund testing is
  explicitly blocked by missing credentials, not skipped by choice.
- A real gateway's own asynchronous refund-confirmation webhook (e.g.
  Razorpay's `refund.processed`/`refund.failed` events) is not wired up in
  this phase — `requestRefund()` only finalizes immediately when the
  provider's initial call returns `"processed"` synchronously (which is
  what the current `RazorpayProvider.refund()` already does and did
  before this phase). A refund that a real gateway processes
  asynchronously would need a webhook handler extension to move it out of
  `PROCESSING`; deferred to Phase 20 alongside real Razorpay credential
  testing (see below).
- The organizer Payments page's "Refund submitted" toast fires on the
  request being *accepted* (HTTP 201, `PROCESSING`), not on its eventual
  terminal outcome — a refund that fails immediately (as demonstrated
  live above) still shows the optimistic toast; the true outcome is
  correctly visible in the refund history list underneath (`FAILED` with
  its reason), but a user relying on the toast alone could be misled for
  a moment. Minor, cosmetic, not a financial-correctness issue.
- The "Simulate success / Simulate failure" buttons in the refund history
  list are always rendered for a `PROCESSING` refund, regardless of
  whether the server is actually configured for the mock provider — a
  click in a Razorpay-configured environment would correctly 403 rather
  than do anything unsafe, but the buttons themselves aren't conditionally
  hidden. Cosmetic only.

## Deferred

- SaaS subscription billing / collection.
- Final `Plan` pricing.
- Plan-limit enforcement.
- Coupons/discounts (the `discountAmount` breakdown field exists, unused).
- Tax/GST treatment of a refund (reversing a future, not-yet-configured
  tax charge) — no tax is currently ever charged, so there is nothing to
  reverse yet; this stays an open business/legal decision for whenever
  Phase 19A's `TaxMode.configured` is actually adopted.
- A real ledger/accounting export of refund activity.
- Platform settlement (how/when the organizer's own payout reflects a
  refund) — out of scope per the original Phase 19A/19B business
  constraints, which remain unchanged.
- Bulk refund workflows (refunding many payments at once) — not
  requested, not built.
- Razorpay's asynchronous refund webhook confirmation (see **Known
  Issues**).

## Phase 20 Recommendation

With both the commercial pricing foundation (19A) and the refund
foundation (19B) in place, the next logical phase is either: (a) live
Razorpay credential integration testing plus the asynchronous
refund-webhook confirmation path, closing the one real gap this phase
left open, or (b) the first real business decision — an actual platform
fee and/or tax configuration — now that both the charge side
(`calculatePricing()`) and the reversal side (`refundService.ts`) can
safely represent one without an architecture change. Recommend (a) first:
it's a small, contained, already-scoped piece of unfinished work, whereas
(b) is a business decision this codebase is ready for whenever the
business is.
