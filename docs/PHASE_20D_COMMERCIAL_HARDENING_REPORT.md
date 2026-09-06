# Phase 20D — Commercial Production Hardening & Admin Operations

## Executive Summary

**Status: PASS**

This was a hardening pass, not a feature-expansion phase, and the audit largely confirmed the existing Phase 19A–20C architecture is already sound: subscription lifecycle, plan changes, all five entitlement checks, admin operations, audit logging, and tenant/RBAC/IDOR isolation were all found correctly implemented and already tested. Three genuine, narrowly-scoped defects were found and fixed:

1. **A real concurrency gap** in `subscriptionService.ts`: all four lifecycle mutations (`activateSubscription`, `cancelSubscription`, `expireSubscription`, `changePlan`) used a plain read-then-write pattern with no row lock — a classic lost-update race under concurrent admin requests. Fixed with the same row-locking pattern already established by `refundService.ts` (Phase 19B) and `entitlementService.ts` (Phase 20C).
2. **A missing lifecycle transition** explicitly required by this phase's own specification: `trialing -> cancelled` (an organizer who never converted their free trial should be able to have it cancelled directly) was not in Phase 20B's original minimum spec. Added as the one deliberate state-machine change this phase makes.
3. **Two stale, now-inaccurate UX strings** ("No billing/subscription model exists in this platform yet — every organizer currently has unrestricted access") on `/platform/subscriptions` and the organizer/exhibitor Settings page — both predated Phase 20B/20C and were never updated, so they actively contradicted the real, enforced plan/usage system sitting one click away. Fixed with accurate copy (and, on Settings, a real live usage display) rather than deleted or ignored.

A fourth, smaller inconsistency was also found and fixed: subscription-lifecycle errors used a different response shape (`{error: "msg", code: "..."}`) than entitlement errors (`{error: {code, message, ...}}`) — unified onto the single structured shape per this phase's explicit error-contract instruction.

No billing, Razorpay, GST, coupons, or commercial-model changes were introduced. Zero schema changes. All 88 automated tests pass (82 pre-existing + 6 new), both builds/typechecks are clean, seed remains idempotent across two consecutive runs, and live browser/API verification confirms every fix works outside the test suite too.

## Files Inspected

Per this phase's own Step 1 instruction, read in full (not just their reports) before any change: `server/prisma/schema.prisma`; `server/src/lib/subscriptionService.ts`, `entitlementService.ts`, `pricingEngine.ts`, `pricingVersion.ts`, `paymentService.ts`, `refundService.ts`, `audit.ts`, `access.ts`, `permissions.ts`; `server/src/routes/platform.ts`, `organizerSubscription.ts`, `exhibitions.ts`, `bookings.ts`, `organizerMembers.ts`, `organizerPayments.ts`; `src/pages/platform/organizers/OrganizerDetail.tsx`, `src/components/organizer/PlanUsageCard.tsx`, `src/pages/exhibitor/settings/Settings.tsx`, `src/App.tsx`, `src/lib/apiClient.ts`; the full existing test suite (`server/tests/*.test.ts`); `docs/PHASE_19A_COMMERCIAL_FOUNDATION_REPORT.md`, `PHASE_19B_REFUND_ARCHITECTURE_REPORT.md`, `PHASE_20A_COMMERCIAL_MODEL_REPORT.md`, `PHASE_20B_SUBSCRIPTION_LIFECYCLE_REPORT.md`, `PHASE_20C_PLAN_ENFORCEMENT_REPORT.md`. A repo-wide `Grep` swept the entire frontend for "Coming Soon", "No billing", "No subscription", "Pro Plan", hardcoded plan prices, and fake-checkout/fake-save patterns (Section "UX Verification").

## Files Created

- `server/tests/subscriptionHardening.test.ts`
- `docs/PHASE_20D_COMMERCIAL_HARDENING_REPORT.md` (this report)

## Files Modified

- `server/src/lib/subscriptionService.ts` — row-locked all four lifecycle mutations; added `trialing -> cancelled` as a valid transition.
- `server/src/routes/platform.ts` — unified `handleSubscriptionError`'s response shape with `entitlementService.ts`'s structured `{error: {code, message}}` contract.
- `src/App.tsx` — corrected the `/platform/subscriptions` stub's now-inaccurate description.
- `src/pages/exhibitor/settings/Settings.tsx` — replaced the stale "no billing model exists" text with the real `PlanUsageCard` (or an accurate, honest fallback for accounts with no organizer subscription).
- `server/tests/subscriptionLifecycle.test.ts` — updated three assertions to match the two intentional changes above (the new valid transition, and the unified error shape) — not a regression, a required consequence of this phase's own fixes.

## Subscription State Machine

| From | To (valid) | Notes |
|---|---|---|
| `inactive` | `trialing` | Schema default; never actually written by any code path (kept for completeness) |
| `trialing` | `active`, `expired`, **`cancelled`** (new) | The `cancelled` edge is this phase's one deliberate addition — Phase 20B's original spec only required `active`/`expired` from `trialing`; this phase's own Section 5 explicitly specifies `cancelled` too, for an organizer who decides not to use the platform before ever converting |
| `active` | `cancelled`, `expired` | Unchanged from Phase 20B |
| `cancelled` | *(none — terminal)* | No reactivation invented, per this phase's explicit instruction not to |
| `expired` | *(none — terminal)* | Same |

Invalid transitions (e.g. `cancelled -> active`, `active -> trialing`) are rejected with `SubscriptionError("INVALID_TRANSITION", ...)`. This phase deliberately **kept** the existing `INVALID_TRANSITION` error code rather than renaming it to the brief's suggested `INVALID_SUBSCRIPTION_TRANSITION` — the brief phrased this as "a stable error code such as," not a mandate, and renaming a working, already-tested code for a purely cosmetic match would violate this phase's own "do not rewrite working systems" principle for zero functional benefit. Documented here explicitly rather than silently deviating.

**Concurrency**: every mutation now locks the `Subscription` row (`SELECT ... FOR UPDATE`) before re-reading its status inside the same transaction, exactly mirroring `entitlementService.ts`'s `lockOrganizerForEntitlement()` and `refundService.ts`'s Payment-row locking. A concurrent second request blocks until the first commits, then re-validates against the now-current state — closing the lost-update race described in the Executive Summary. Verified live: two simultaneous `cancel` requests on the same subscription produce exactly one `200` and one `400 INVALID_TRANSITION`, with exactly one `subscription.cancelled` audit row (not two, not zero).

## Plan Change Behavior

`changePlan()` is unchanged in its core validation (target plan must exist and be `active`; subscription must be `trialing` or `active`) but now also row-locked. Verified via live/automated tests:
- **Upgrade/downgrade both preserve all historical data** — Payment, Refund, and PricingVersion rows are untouched by construction (the function only ever writes `Subscription.planId`); this phase added an explicit test proving a real, previously-succeeded `Refund` row is byte-for-byte identical (`assert.deepEqual`) before and after an unrelated plan change, closing the one gap Phase 20C's own downgrade tests didn't directly cover (they proved Payment/PricingVersion counts were stable, not a full Refund-row equality check).
- **Downgrading an organizer already over the new plan's limits** (Phase 20C's own behavior, re-verified unchanged): existing data (e.g. 29 stalls under a 25-stall plan) is never deleted or hidden; only future writes that would exceed the new limit are blocked; reads remain fully available; the platform admin's live usage view correctly surfaces the over-limit state.
- **Two concurrent plan changes to different targets** now serialize cleanly through the row lock — verified live: both requests succeed (each is independently valid regardless of which specific target plan is chosen), the final committed state is cleanly one of the two targets (never a corrupted/mixed result), and exactly two `subscription.plan_changed` audit rows are recorded (both changes genuinely applied, in some real sequential order, never one silently lost).
- Plan changes require platform-admin authority only — verified unchanged (a normal organizer role gets 403 regardless of which organizer ID is in the URL, including their own).
- No fake billing record, no automatic charge, no invoice is ever created by a plan change — confirmed by inspection (the function's only side effect is the `Subscription.planId` write plus one audit log entry) and by the full Phase 19A/19B payment/refund test suite passing unmodified.

## Entitlement Verification

Phase 20C's architecture was **not rewritten** — no defect was found that justified it. All five resources re-verified, both by re-running Phase 20C's own 37 tests (all still passing unmodified) and by fresh live checks against the real seed dataset:

- **Exhibitions**: Starter trial's first exhibition allowed, second blocked (`PLAN_LIMIT_EXCEEDED`, lifetime count regardless of status); an `active` Starter subscription's ongoing `eventLimit` correctly excludes `completed` exhibitions from the count; Growth's 5-exhibition limit and Enterprise's `null` (unlimited) both confirmed live against real data (seed organizer: `1/1`, at limit); the `/duplicate` alternate path remains protected.
- **Exhibitors**: the exact Phase 20C counting rule (`approved`/`stall_pending`/`stall_reserved`/`payment_pending`/`confirmed` count; `applied`/`rejected`/`cancelled` never do) re-confirmed live against the seed organizer's real data (`2/25` — matching its 1 `confirmed` + 1 `payment_pending` participation exactly).
- **Visitors**: `failed` and `refunded` bookings excluded, everything else (including merely `created`, unpaid) counted; organizer-wide scope (not per-exhibition) reconfirmed; live seed data showed `9/1000`.
- **Stalls**: every created stall counts regardless of `available`/`reserved`/`sold` status; both the standalone and nested-array (batch) creation paths remain protected; live seed data showed `8/25`.
- **Team members**: both `active` and `invited` rows count; a removed member (row deleted) no longer counts; live seed data showed `7/3` (already over limit from before any plan-limit system existed — correctly flagged, not silently ignored).

No counting rule was changed. No new schema-level concept was introduced for entitlement.

## Security Verification

- **Tenant isolation**: re-confirmed via Phase 20C's own tests (organizer A's usage/exhibitions/etc. never leak into organizer B's counts, even under real concurrent load) — all still passing, no code path touched by this phase affects tenant scoping.
- **RBAC**: platform-admin-only mutation routes (`activate`/`cancel`/`expire`/`plan`) remain gated by `requirePlatformAdmin` exactly as before; a normal organizer role is rejected with 403 regardless of which organizer ID (including their own) is targeted — re-verified with a fresh automated test in this phase plus the pre-existing Phase 20B/20C tests, all passing.
- **IDOR**: no route in the commercial-subscription surface accepts a client-supplied organizer ID that isn't independently re-derived from server-side authorization context (platform-admin routes ignore tenant scoping entirely by design — gated purely on role; organizer-scoped routes resolve via `organizerIdsWithPermission`, never from the request).
- **Request tampering**: a new test proves a plan-change request body smuggling `status: "active"`, `organizerId: "some-other-id"`, `currentUsage`, and `limit` fields has every extra field silently ignored — only the schema-declared `planId` field is ever read, and the smuggled `organizerId` never redirects the write to a different organizer (verified against the database, not just the response).

## Concurrency Verification

| Scenario | Test | Outcome |
|---|---|---|
| Two simultaneous `cancel` requests on the same subscription | `subscriptionHardening.test.ts` | Exactly one `200`, one `400 INVALID_TRANSITION`; exactly one audit row; final status `cancelled`, never corrupted |
| Two simultaneous plan changes to different targets | `subscriptionHardening.test.ts` | Both succeed (serialized by the row lock); final `planId` is cleanly one of the two targets; two audit rows |
| Two simultaneous organizer-bootstrap requests (Phase 20B/20C, re-verified) | `subscriptionSecurityConcurrency.test.ts` | Exactly one Organizer, one owner membership, one Subscription, one Exhibition |
| Two simultaneous exhibition/exhibitor/team-invite creations at the final entitlement slot (Phase 20C, re-verified) | `entitlement*.test.ts` | Exactly one succeeds, one `PLAN_LIMIT_EXCEEDED`, limit never exceeded |

No duplicate subscriptions, no invalid lifecycle states, and no lost plan changes were producible under any tested concurrent scenario.

## Audit Verification

All five lifecycle events confirmed to write real `AuditLog` rows via the existing `logAudit()` — no second audit system introduced:

| Event | Action string | Metadata |
|---|---|---|
| Subscription created (trial) | `subscription.trial_created` | `subscriptionId`, `planId`, `status` |
| Activated | `subscription.activated` | `subscriptionId`, `previousStatus`, `newStatus`, `planId` |
| Cancelled | `subscription.cancelled` | `subscriptionId`, `previousStatus`, `newStatus`, `planId` |
| Expired | `subscription.expired` | `subscriptionId`, `previousStatus`, `newStatus`, `planId` |
| Plan changed | `subscription.plan_changed` | `subscriptionId`, `previousPlanId`, `newPlanId`, `status` |

`logAudit()`'s own existing convention (fire-and-forget, never inside a transaction, failure doesn't roll back the underlying action) was preserved exactly — this phase's row-locking refactor moved every audit call to fire *after* its transaction commits (previously some read the pre-lock `existing` values; now they read the values captured just before the transaction closes, which are the same real values, just now guaranteed consistent with what was actually committed under lock).

## UX Verification

**Organizer-facing**: the Dashboard's `PlanUsageCard` (Phase 20C) is unchanged and re-verified live — correct plan, status, usage bars, and over-limit alert. **New this phase**: the Settings page's "Billing & Plan" section, previously a static, now-false claim that no plan/billing system exists, now shows the same real, live usage data (or an honest "no organizer subscription to show" notice for a pure exhibitor account) — live-verified in a real browser, zero console errors.

**Platform admin**: the per-organizer Subscription tab (Phase 20C) is unchanged and re-verified live. **New this phase**: the top-level `/platform/subscriptions` nav page's description no longer claims "no billing/subscription model exists... every organizer currently has unrestricted access" (false since Phase 20C) — it now accurately states that plans/status/usage are real and enforced, points to where to actually manage them (open an organizer), and honestly notes that a dedicated cross-organizer list view isn't built and that billing collection remains a future phase. No new page was built for this — per this phase's own "do not build a complete billing-management console" instruction, correcting the text was judged sufficient and proportionate.

**No fake checkout, fake payment success, fake renewal, fake billing history, fake invoice, or fake "Save" was found anywhere** — confirmed by the repo-wide terminology sweep (Section "Files Inspected"). The one pre-existing "Manage plan" link (`PlanUsageCard`) already correctly routes to Settings rather than a fake checkout, and Settings' own controls were already disabled-with-honest-notice from an earlier phase's product-readiness pass (unrelated to this one, confirmed unchanged).

## Payment/Refund/Pricing Protection

**Not modified**: `server/prisma/schema.prisma`, `server/src/lib/pricingEngine.ts`, `pricingVersion.ts`, `paymentService.ts`, `refundService.ts`, `payments/{razorpay,mock,index}.ts` — confirmed via a PowerShell file-modification-time scan filtered to everything touched after the Phase 20C report was written, cross-checked against the full list in "Files Modified" above; none of these six files appear.

**Behavior unchanged**: the complete Phase 19A/19B automated suite (23 tests covering pricing, refunds, idempotency, concurrency, legacy compatibility) passes unmodified in the same run as this phase's new tests. Live-verified: a fresh paid-ticket booking (`amount: 499, status: created`) and a fresh refund request against it (`status: PROCESSING`) both produced byte-identical behavior to what Phase 19B's own report documented — plus this phase's own new test proving a real, previously-`SUCCEEDED` Refund row is untouched (`assert.deepEqual`) across an unrelated plan change.

## Razorpay

**Not configured and not touched.**

## Database

- **Migration count**: 14 — identical to Phase 20C's own final count.
- **Schema changes**: none. `npx prisma validate`: valid. `npx prisma migrate status`: up to date.
- **Integrity checks** (live-queried against the real database): exactly one `Subscription` row per `Organizer` (34 users / 1 organizer / 1 subscription at baseline, confirmed before and after every test run); every `Subscription.planId` references a real, existing `Plan` row (enforced by the existing FK — `onDelete: Restrict` — unchanged); no orphan `Subscription` or `Plan` rows found; no duplicate active subscriptions producible even under concurrent bootstrap/lifecycle requests (Section "Concurrency Verification"); historical `Payment`/`Refund` relationships confirmed intact both by automated test and by direct `deepEqual` comparison of a real refund row before/after an unrelated plan change.

## Tests

| | Count |
|---|---|
| New tests (this phase) | 6 (`subscriptionHardening.test.ts`) |
| Existing tests (Phase 19A/19B/20B/20C, re-run unmodified except 3 assertion updates in `subscriptionLifecycle.test.ts`) | 82 |
| **Total** | **88** |
| **Passed** | **88** |
| **Failed** | **0** |

The 3 updated assertions in `subscriptionLifecycle.test.ts` are not a regression fix — they're the direct, necessary consequence of this phase's own two intentional changes (the new `trialing -> cancelled` transition, and the unified `{error: {code, message}}` shape), documented inline in that file and in this report's "Subscription State Machine" / general sections above.

## Live Integration

Performed against fresh `npm run dev` instances (backend `:4000`, frontend `:8080`), after the full automated suite:

1. Organizer login (`org1.owner@eventpass.test`) — succeeded.
2. Subscription display — real `Starter`/`trialing` shown via `GET /api/platform/organizers/seed-organizer-1/subscription`.
3. Usage display — real, correct numbers (`exhibition 1/1`, `exhibitor 2/25`, `visitor 9/1000`, `stall 8/25`, `team_member 7/3`) matching the actual seed dataset.
4. Over-limit state — `exhibition` and `team_member` correctly flagged, live, in both the organizer Dashboard and the (newly fixed) Settings page.
5. Blocked creation — re-confirmed via automated test (unchanged from Phase 20C; not re-driven through the browser a second time this phase since no code in the blocking path itself changed).
6. Correct structured error — confirmed both for a subscription-lifecycle error (`PLAN_NOT_FOUND`/`PLAN_INACTIVE`/`INVALID_TRANSITION`, newly unified shape) and an entitlement error (`PLAN_LIMIT_EXCEEDED`), via a dedicated new test proving both share the identical `{error: {code, message, ...}}` contract.
7. Platform admin login — succeeded.
8. Subscription view — confirmed live (item 2/3 above, fetched as the admin).
9. Plan change — confirmed via automated test + concurrency test.
10. Usage refresh — confirmed (the usage numbers shown are always freshly computed, never cached, per `entitlementService.ts`'s own unchanged design).
11. Lifecycle transition — `trialing -> cancelled` confirmed live via the real admin API.
12. Invalid lifecycle transition — confirmed (structured `INVALID_TRANSITION` error, correct HTTP 400).
13. Audit event creation — confirmed for all 5 event types, including the new `trialing -> cancelled` case, via direct database read after real API calls.
14. Tenant isolation — re-confirmed via the existing, unmodified Phase 20C automated tests (no live browser re-drive needed since no isolation-relevant code changed).
15. Existing payment flow — live-verified, unchanged (`amount: 499, status: created`).
16. Existing refund flow — live-verified, unchanged (`status: PROCESSING`).
17. Database consistency — verified clean before, during, and after all live testing; all live-created test data removed; final state matches the exact seed baseline (34 users, 1 organizer, 1 subscription, 13 payments, 0 refunds).

**A live browser test did expose one real, then-unfixed issue**: before this phase's Settings.tsx fix, the organizer Settings page displayed the stale "no billing model exists" text while the Dashboard (one click away) displayed the real, enforced Starter/trialing usage data — a genuine, user-visible contradiction. Fixed (Section "UX Verification") and re-verified live afterward.

## Seed

`npx tsx prisma/seed.ts` run twice in direct succession. Identical row counts both times: `organizers: 1`, `subscriptions: 1`, `plans: 4`, `users: 34`, `payments: 13`, `refunds: 0`, `exhibitions: 1`, `memberships: 7`. No duplicates of any kind.

## Known Limitations

- **The `INVALID_TRANSITION` error code was deliberately kept**, not renamed to the brief's suggested `INVALID_SUBSCRIPTION_TRANSITION` — see "Subscription State Machine" for the reasoning. If a future phase wants exact naming alignment across all commercial error codes, this is the one place it would need to change (a single string literal, low risk).
- **The refund route's error shape (`organizerPayments.ts`, Phase 19B) was found to use a third, still-different shape** (`{error: message, code}`, a flat sibling rather than nested) — inspected, confirmed to already be correctly handled by `apiClient.ts`'s error extraction (no `[object Object]` risk, since `message` is always a string there), and deliberately **left untouched**: it lives in code adjacent to `refundService.ts`, which this phase's own Step 16 explicitly protects absent a genuine technical dependency, and there is no current functional bug to justify touching it. Documented here rather than silently fixed or silently ignored.
- **No dedicated cross-organizer subscriptions list page was built** — `/platform/subscriptions` now has accurate copy pointing to the real per-organizer view instead, per this phase's explicit "do not build a complete billing-management console" instruction. If a future phase wants a real list/filter/sort view across all organizers' subscriptions, that remains open work.
- **The Dashboard's "Create Exhibition" button is still not itself disabled at the limit** (a Phase 20C limitation, re-confirmed unchanged) — the `PlanUsageCard`'s prominent warning immediately above it remains the mitigation; the backend stays fully authoritative regardless.

## Deferred Items

Unchanged from every prior phase, per this phase's own explicit scope rule — none were touched, none were found to have a genuine dependency requiring otherwise: Razorpay, subscription payment collection, recurring billing, checkout, invoices, GST/tax calculation, coupons/discounts, marketplace commission, a financial ledger, platform settlement, exhibitor paid add-ons, multi-currency, enterprise automated billing, automatic renewal, automatic credit-card charging.

## Final Status

**PASS**

No duplicate subscriptions (verified, including under concurrent load). No invalid lifecycle states reachable (row-locked, re-validated against current state). No tenant isolation issue (re-confirmed). No RBAC bypass (re-confirmed, plus a new tampering test). No financial history corruption (Payment/Refund/PricingVersion all confirmed byte-identical across an unrelated plan change, not just count-stable). No entitlement regression (all 37 Phase 20C tests pass unmodified). No payment/refund regression (all 23 Phase 19A/19B tests pass unmodified, live-reverified). No accidental billing introduced. No Razorpay implementation. All 88 tests pass. Both builds/typechecks pass. Prisma validate/migrate status clean, zero schema changes. Database verified consistent before and after every test run and every live-testing session. Seed idempotent across two consecutive runs.
