# Phase 19A — Commercial Foundation

Status: **PASS**
Date: 2026-09-04

## Executive Summary

Phase 19A adds the minimum commercial data model and calculation architecture
ExhibitTix needs to eventually charge organizers a platform fee, without
committing to any final price, tax treatment, or billing mechanism today.

Concretely, this phase introduces:

- A `Plan` / `Subscription` data model that records *what plan an organizer is
  on*, but enforces nothing — every organizer keeps working exactly as before.
- A `PricingVersion` model that is the single source of truth for how a
  charge is computed (platform fee, tax, who pays the fee), and is
  immutable once any `Payment` references it.
- A single shared server-side pricing engine (`calculatePricing()`) that both
  the ticket-booking flow and the stall-payment flow call — proven by an
  integration test that both flows produce payments referencing the same
  `PricingVersion`.
- Payment amount breakdown fields (`baseAmount`, `platformFeeAmount`,
  `taxAmount`, `discountAmount`, `organizerAmount`, `platformRevenueAmount`)
  added to the existing `Payment` model, backfilled for all historical
  payments via an additive migration.
- A frontend that displays the server's computed pricing breakdown instead of
  fabricated "convenience fee" / "GST (18%)" numbers that had no relationship
  to what was actually charged.

Nothing about existing behavior changes: free tickets still bypass the
gateway, paid tickets and stalls still charge exactly their listed price
(platform fee is currently 0), and no organizer plan limit is enforced.

## Business Model Direction

Per the phase brief, ExhibitTix's provisional direction is a **platform-fee
model** ("charge organizers for using the platform, not commission on ticket
or stall sales"), not a per-transaction commission model. This phase builds
the data model to support that direction (`Plan`, `Subscription`,
`PricingVersion.platformFeeType`/`feePaidBy`) but does **not** implement
billing, does not choose a final price, and does not enforce any plan limit.
The `Plan` model itself is generic enough that it does not foreclose a future
commission-based or hybrid model — `platformFeeType` supports `fixed`,
`percentage`, and `percentage_plus_fixed` alongside `none`.

## Database Changes

Migration: `20260904080000_commercial_foundation` (additive), followed by a
one-line data-correction migration `20260904080100_fix_pricing_version_timezone`
(see **Legacy Data** below for why).

New models:

- **`Plan`** — a named commercial plan (`code`, `name`, `price`,
  `billingInterval`, optional limits `eventLimit`/`visitorLimit`/
  `exhibitorLimit`/`stallLimit`/`teamMemberLimit`, `features` JSON). One
  inactive placeholder row (`plan-custom-unconfigured`, price ₹0.00) seeded —
  not a real offer, just satisfies the FK relation.
- **`Subscription`** — links an `Organizer` to a `Plan` over time
  (`status`, `currentPeriodStart/End`, `trialEndsAt`). No organizer has a
  subscription row yet; the relation exists but nothing reads or enforces it.
- **`PricingVersion`** — the versioned configuration for a charge:
  `platformFeeType`/`platformFeePercent`/`platformFeeFixedAmount`,
  `feePaidBy` (organizer/attendee/split), `taxMode` (`none`/`configured`),
  `taxPercent`, `taxBasis`, `currency`, `effectiveFrom`, `active`.

`Payment` gained: `baseAmount`, `platformFeeAmount`, `gatewayFeeAmount`,
`taxAmount`, `discountAmount`, `organizerAmount`, `platformRevenueAmount`,
`feePaidBy`, `pricingVersionId` (FK, `onDelete: Restrict`). The existing
`amount` column is **unchanged in meaning** — it continues to be the total
amount the customer paid (now equal to `baseAmount + platformFeeAmount +
taxAmount - discountAmount`, i.e. `customerPayable`).

`Organizer` gained a `subscriptions Subscription[]` relation (history, not a
single "current plan" field).

Migration status: `npx prisma migrate status` reports up to date, 12
migrations applied cleanly.

## Pricing Architecture

- **`server/src/lib/pricingVersion.ts`** — `getActivePricingVersion()` reads
  the one `active: true, effectiveFrom <= now` row; `createPricingVersion()`
  is the only way to introduce a new version; `retirePricingVersion()` is the
  only allowed mutation (flips `active`, never touches fee/tax fields);
  `assertPricingVersionMutable()` throws if any `Payment` already references
  the version.
- **`server/src/lib/pricingEngine.ts`** — `calculatePricing(baseAmount)` is
  the single authoritative calculation. It loads the active `PricingVersion`,
  computes `platformFeeAmount` from `platformFeeType`, computes `taxAmount`
  **only if** `taxMode === "configured"`, and returns a full breakdown
  (`baseAmount`, `platformFeeAmount`, `gatewayFeeAmount`, `taxAmount`,
  `discountAmount`, `totalAmount`, `organizerAmount`,
  `platformRevenueAmount`, `pricingVersionId`).
- **`server/src/lib/paymentService.ts`** (`createOrderForPayment`) is the only
  caller of `calculatePricing()` for paid orders; it creates the `Payment` row
  from the breakdown and sends the gateway order for `breakdown.totalAmount`
  — never a client-supplied amount.
- Both `server/src/routes/bookings.ts` (tickets) and
  `server/src/routes/exhibitorParticipations.ts` (stalls) call
  `createOrderForPayment({ baseAmount, ... })` — the same function, same
  engine, same `PricingVersion`. Free tickets call
  `calculatePricing(0)` directly and skip gateway order creation entirely
  (`provider: "free"`, `order: null`).
- **`GET /api/pricing/quote?baseAmount=X`** (`server/src/routes/pricing.ts`)
  — an informational-only endpoint the frontend uses to *display* a
  breakdown before booking. It is never trusted as the actual charge; the
  real charge is always recomputed server-side at booking time.

Frontend: `src/hooks/usePricingQuote.ts` calls the quote endpoint;
`src/pages/BookingFlow.tsx` renders `platformFeeAmount`/`taxAmount`/
`totalAmount` from that response (each line hidden when 0) instead of the
previous hardcoded "Convenience Fee" / "GST (18%)" placeholder math, which
had no relationship to any actual charge.

## Current Pricing State

- **Platform fee: 0** (`PricingVersion.platformFeeType = "none"`). This is a
  provisional starting value, not a permanent decision — `platformFeeType`
  supports fixed/percentage/percentage-plus-fixed for when a real fee is
  decided, and creating a new `PricingVersion` is how that change would ship
  (never mutating the existing one).
- **Tax: unconfigured**, not "0%". `PricingVersion.taxMode = "none"` — a
  distinct state from `taxMode = "configured", taxPercent = 0`. Do not read
  this as "tax is legally zero"; it means no tax decision has been made yet.
  `taxAmount` is 0 today only because tax is not yet configured, not because
  a 0% rate was chosen.
- **No final SaaS/platform price exists.** `Plan.price` for the one seeded
  placeholder plan is ₹0.00 and the plan is `active: false` — it exists only
  to satisfy the `Subscription.planId` FK shape, not as a real offer.
- `TicketType.taxPercent` (pre-existing field) is **not** read by
  `calculatePricing()`. It is documented in the schema as legacy/display-only
  and deliberately excluded from the pricing engine so that its presence
  cannot silently start charging tax.

## Legacy Data

All 12 pre-existing `Payment` rows were backfilled by the migration:
`baseAmount = amount`, `organizerAmount = amount`,
`pricingVersionId = 'pv-legacy-unversioned'` (an inactive, unselectable
`PricingVersion` that exists purely to give historical rows a valid FK
target). The original `amount` value was never rewritten — the new columns
were derived from it, not the reverse. Verified live: all 12 seed payments
tagged correctly (`legacyCompat.test.ts`, passing).

**Bug found and fixed during this phase:** the migration's `INSERT` for the
active launch `PricingVersion` used `CURRENT_TIMESTAMP`, which Postgres
evaluates in the session's configured timezone (IST on this local instance)
but which gets stored in a timezone-naive column that Prisma's client always
reads back as UTC. This made the launch version's `effectiveFrom` appear
~5.5 hours in the future, causing `getActivePricingVersion()` to find zero
rows. Fixed with a new, additive migration
(`20260904080100_fix_pricing_version_timezone`) setting an explicit literal
timestamp — the already-applied first migration was not edited, to preserve
Prisma's migration checksum tracking.

## Tests

Zero new dependencies: Node's built-in `node:test` runner + the project's
existing `tsx`. New `server/src/app.ts` (Express app config, extracted from
`index.ts`) lets tests boot the app on an ephemeral port
(`server/tests/helpers/testServer.ts`) without touching the real port 4000.

All 11 required cases pass (`npm run test` in `server/`, 11/11, ~1.6s):

| # | Case | File |
|---|---|---|
| 1 | Paid ticket ₹500, fee 0, tax unconfigured → total ₹500 | `pricingEngine.test.ts` |
| 2 | Free ticket ₹0 → ₹0 | `pricingEngine.test.ts` |
| 3 | Paid stall ₹10,000, fee 0, tax unconfigured → total ₹10,000 | `pricingEngine.test.ts` |
| 4 | Deterministic repeated calculation | `pricingEngine.test.ts` |
| 5 | Breakdown reconciles across `[0, 1, 499, 500, 1999, 10000, 84999.99]` | `pricingEngine.test.ts` |
| 6 | Payment references the active `PricingVersion` | `pricingVersionImmutability.test.ts` |
| 7 | A `PricingVersion` referenced by a payment is rejected by `assertPricingVersionMutable`; an unused one is allowed | `pricingVersionImmutability.test.ts` |
| 8 | Legacy payments keep their original amount, tagged to the legacy version | `legacyCompat.test.ts` |
| 9 | Client-supplied `amount: 1` (plus `price`/`unitPrice`/`totalAmount`) is ignored; ₹499 is actually charged, in both the API response and a fresh DB read | `security.test.ts` |
| 10 | A ticket payment and a stall payment reference the identical active `PricingVersion` | `sharedEngineIntegration.test.ts` |
| 11 | Free ticket: `organizerAmount`/`platformRevenueAmount` both 0 | `pricingEngine.test.ts` |

## Security

Test 9 (`security.test.ts`) proves end-to-end, via a real HTTP request against
a running instance of the app (not a schema inspection), that a client cannot
control what gets charged: a booking request for the ₹499
`seed-tickettype-standard` with `amount: 1, price: 1, unitPrice: 1,
totalAmount: 1` smuggled into the body still produces a `Payment.amount` of
499 — both in the API response and in a direct database read. The request
schema (`createTicketBookingSchema`) does not declare any of those fields, so
zod's default strip-unknown-keys behavior discards them before the route
handler ever sees them; the server always recomputes the charge from the
DB-stored ticket/stall price via `calculatePricing()`.

Live-repeated during the Quality Gate integration pass (see below): a fresh
mock-provider payment flow (signup → book → `mock-complete`) showed the same
₹499 breakdown at every step, and calling `mock-complete` twice produced an
identical `updatedAt` on the second call, confirming the existing webhook
idempotency path (unmodified this phase) still applies correctly with the
new breakdown fields present on `Payment`.

## Backward Compatibility

- `TicketBooking.amountPaid` / `paymentStatus` are untouched and continue to
  mirror the payment for legacy readers; `booking.amountPaid` is deliberately
  still set from the base ticket price, not `Payment.amount`, preserving its
  historical meaning.
- API responses still include `amount` and `paymentStatus` unchanged; the
  breakdown fields are additive.
- Free-ticket behavior is unchanged: gateway is bypassed
  (`provider: "free"`, `order: null`), verified live during this phase's
  integration pass.
- All 12 pre-existing `Payment` rows remain readable and numerically
  unchanged (`legacyCompat.test.ts`, plus a live `GET /api/payments/:id`
  check during the Quality Gate).

## Quality Gate Results

**Backend:** `prisma validate` ✅ · `prisma migrate status` ✅ (12 migrations,
up to date) · `tsc --noEmit -p tsconfig.json` ✅ · `npm run build` ✅ ·
`npm run test` ✅ (11/11).

**Frontend:** `tsc --build tsconfig.json --noEmit --force` ✅ · `npm run
build` ✅ (18.02s; only the pre-existing, unrelated CSS `@import`-order and
chunk-size warnings).

**Integration (live, against running dev servers):**

1. Homepage — loads clean, 0 console errors, 0 failed requests.
2. Exhibition browsing — `/exhibition/seed-exhibition-1` renders ticket
   types (`General Entry ₹0`, `Standard Pass ₹499`, `VIP Pass ₹1,999`) and
   the stall floor plan correctly.
3. Ticket booking — selected Standard Pass, reached the booking flow;
   quantity/date step shows `Standard Pass × 1 ₹499  Total ₹499` from the
   server quote, no fabricated fee lines.
4. Free ticket — live `POST /api/bookings/tickets` for
   `seed-tickettype-general`: `payment.provider: "free"`, `status: "paid"`,
   `order: null`, all breakdown fields 0.
5. Paid ticket — live `POST /api/bookings/tickets` for
   `seed-tickettype-standard`: `amount: 499`, `baseAmount: 499`,
   `organizerAmount: 499`, correct `pricingVersionId`.
6. Stall booking — proven by `sharedEngineIntegration.test.ts` (full
   apply → approve → select stall → pay flow for biz3).
7. Mock payment — live `POST /api/payments/:id/mock-complete` with
   `{outcome:"success"}`: `status` transitions `created` → `paid` through the
   real webhook-verification pipeline (`verifyWebhookSignature` →
   `recordWebhookEvent` → `applyPaymentOutcome`).
8. Existing payment idempotency — repeating the same `mock-complete` call
   produced an identical `updatedAt`, confirming no double-processing.
9. Organizer/exhibitor RBAC — `sharedEngineIntegration.test.ts` exercises
   organizer-only approval and exhibitor-only stall selection/payment
   endpoints, both succeeding only for the correct role; live organizer login
   showed only that organizer's own exhibition data on the dashboard.
10. Tenant isolation — unchanged code path this phase; the live organizer
    dashboard check above showed correctly scoped data (1 exhibition, this
    organizer's own numbers) with no cross-tenant leakage observed.
11. Existing dashboards still load — live: logged in as
    `org1.owner@eventpass.test`, `/organizer` renders real metrics (Total
    Revenue, Ticket Revenue, Stall Revenue, Attendance Rate) with 0 console
    errors, 0 failed requests.
12. No client-side authoritative pricing remains — `BookingFlow.tsx`'s
    previous hardcoded convenience-fee/GST math was removed; the UI now
    displays only `usePricingQuote()`'s server response, and the actual
    charge is independently recomputed server-side at booking time
    regardless of what the client displayed (proven by Test 9).
13. Pricing breakdown matches charged amount — proven by
    `security.test.ts` and `sharedEngineIntegration.test.ts`, plus the live
    mock-payment run above (breakdown fields consistent with `amount` at
    every step).
14. Legacy payment records remain readable —
    `legacyCompat.test.ts` plus a live `GET /api/payments/:id` against a
    pre-existing seed payment during this pass returned correctly.

All live-created test users/bookings/payments from the integration pass were
deleted afterward; the database was verified back at its seed baseline.

## Remaining Business Decisions (explicitly out of scope for 19A)

- Final platform fee amount/structure and who pays it (organizer vs
  attendee vs split).
- Final tax treatment (GST registration status, rate, inclusive/exclusive
  presentation) — currently unconfigured, not decided as 0%.
- Final SaaS/Plan pricing tiers and limits.
- Whether/how existing organizers get grandfathered into whatever plan
  structure is eventually chosen.

## Phase 19B Recommendation

Phase 19B should pick up, in this order: (1) ticket refund architecture
(explicitly deferred here), (2) a real subscription/billing collection flow
once a `Plan` price is actually decided, (3) plan-limit enforcement — only
after limits are chosen and existing organizers have an explicit migration
path, (4) coupon/discount support (the `discountAmount` field already exists
in the breakdown, unused). Avoid building all of these in one phase; each is
independently shippable on top of the foundation this phase laid.
