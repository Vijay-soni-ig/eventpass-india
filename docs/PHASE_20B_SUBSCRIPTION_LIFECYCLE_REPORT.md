# Phase 20B — Subscription Lifecycle Implementation

Status: **PASS**
Date: 2026-09-04

## 1. Executive Summary

Phase 20B makes `Plan` and `Subscription` — schema-only since Phase 19A, confirmed dormant by Phase 20A's audit — operationally real, without building any billing collection, plan enforcement, or Razorpay integration. Every organizer, new or pre-existing, now has exactly one real `Subscription` row referencing a real `Plan`. The three commercial plans recommended by Phase 20A (Starter/Growth/Enterprise) exist as active database rows with their exact specified limits. A focused `subscriptionService.ts` makes lifecycle transitions (trialing→active→cancelled/expired) explicit and validated, reusing the existing audit-logging and service-layer patterns from `pricingVersion.ts`/`refundService.ts` rather than inventing new ones. Every new organizer — bootstrapped through the single existing `resolveOrganizerId()` call site — receives its Starter trial atomically, inside the same transaction and the same race-protection mechanism (`Organizer.bootstrappedByUserId` unique constraint) that already made organizer bootstrap itself concurrency-safe; no new schema constraint was needed to make subscription creation exactly-once under concurrency. The platform admin's Subscriptions view, which explicitly said *"No billing/subscription model exists in this platform yet"* since before Phase 19A even added the tables, now shows real, live data.

**No schema change was required.** Every field this phase needed (`Plan.price/eventLimit/visitorLimit/exhibitorLimit/stallLimit/teamMemberLimit/features/active`, `Subscription.status/currentPeriodStart/currentPeriodEnd/trialEndsAt`) already existed from Phase 19A. This phase is a single additive data migration plus application code — confirmed via `git diff`/mtime inspection that `server/prisma/schema.prisma` was not touched.

**Plan enforcement, subscription billing collection, Razorpay, coupons, and GST remain exactly as deferred as Phase 20A recommended.** Nothing in this phase blocks any exhibition/exhibitor/ticket/stall/team action based on plan limits — those limits are data, read but never checked against usage, per the phase's own explicit Step 19 instruction.

## 2. Existing Architecture Reused

Inspected before writing anything (per this phase's own First Step instruction), and reused rather than duplicated:

- **`lib/pricingVersion.ts`'s service-layer pattern**: explicit named functions (`getActivePricingVersion`, `createPricingVersion`, `retirePricingVersion`, `assertPricingVersionMutable`) instead of routes touching Prisma models directly, and a fail-loud "this should never happen outside a broken migration" error style. `subscriptionService.ts`'s `getStarterPlan()` copies this exact style verbatim.
- **`lib/refundService.ts`'s audit-logging discipline**: `logAudit()` is always called *after* a transaction commits, never from inside one (since `logAudit()` writes through the module-level `prisma` client, not a transaction's `tx`). `createTrialSubscription()` was written to NOT call `logAudit()` itself for exactly this reason; the caller (`organizer.ts`) logs it after the transaction resolves.
- **`lib/access.ts`'s `organizerIdsWithPermission()`**: the organizer-scoped `GET /api/organizer/subscription` route resolves the caller's organizer(s) through this exact existing helper — never from a client-supplied id — reusing the `payment:view` permission rather than inventing a new one.
- **`lib/organizer.ts`'s `resolveOrganizerId()` race protection**: `Organizer.bootstrappedByUserId`'s unique constraint plus the existing P2002-catch-and-resolve-to-winner pattern. This phase extends the same transaction rather than adding a second, independent concurrency mechanism.
- **`routes/platform.ts`'s existing conventions**: `requirePlatformAdmin`-gated, queries Prisma directly (never through `organizerIdsWithPermission`, since a platform admin has no memberships of their own — exactly as the file's own header comment already explains), and the existing `logAudit()` call pattern from `PATCH /organizers/:id/suspend` was mirrored for the new subscription actions.
- **`components/organizer/payments/RefundDialog.tsx` / `pages/organizer/payments/Payments.tsx` (Phase 19B)'s frontend conventions**: shadcn `Select`/`StatCard`/`StatusBadge`/`sonner` toast, `ApiError` handling — reused verbatim for the new `SubscriptionTab` in `OrganizerDetail.tsx`.

Nothing was redesigned. `Plan`/`Subscription`'s existing doc comments in `schema.prisma` (`"Foundation only... nothing in the product reads or enforces this yet"`) needed no correction — this phase makes them read/written, per its own explicit scope; enforcement remains Phase 20C's job exactly as those comments already anticipated.

## 3. Plan Implementation

Three real, active `Plan` rows, inserted by migration `20260904100000_subscription_lifecycle` (data-only, no schema change):

| | Starter | Growth | Enterprise |
|---|---|---|---|
| id | `plan-starter` | `plan-growth` | `plan-enterprise` |
| price | 14999.00 | 24999.00 | 0.00 (placeholder — see below) |
| eventLimit | 1 | 5 | `NULL` (unlimited) |
| visitorLimit | 1000 | 10000 | `NULL` |
| exhibitorLimit | 25 | 150 | `NULL` |
| stallLimit | 25 | 150 | `NULL` |
| teamMemberLimit | 3 | 10 | `NULL` |

Exact figures match `docs/PHASE_20A_COMMERCIAL_MODEL_REPORT.md` Sections 7-8. Enterprise's `price` is `0.00` — this is **not** a free tier; it is the same "placeholder marker" convention the pre-existing `plan-custom-unconfigured` row already established (its own `price` is also `0.00`, also never meant as a real committed figure), documented explicitly in the `Plan.description` text and enforced conceptually, not silently, by the plan's `code`/`name`/`description` making the placeholder unmistakable. Enterprise's `NULL` limits use the schema's own pre-existing "nullable limit = unlimited" convention (`Plan`'s own doc comment in `schema.prisma`, unchanged) rather than an invented large integer.

**The pre-existing `plan-custom-unconfigured` row was left completely untouched** — not renamed, not repurposed, not deleted, not reused for any of the three new plans. Verified: `subscriptionPlans.test.ts` asserts it still exists, is still `active: false`, and that the set of *active* plans is exactly `{starter, growth, enterprise}`.

## 4. Plan Features Contract

`Plan.features` (pre-existing `Json?` column) now holds a documented, stable vocabulary — the exact categories the phase brief suggested, each a boolean:

```json
{
  "exhibition_management": true, "stall_management": true, "ticket_management": true,
  "exhibitor_management": true, "visitor_registration": true, "qr_checkin": true,
  "lead_management": true, "analytics": true, "documents": true, "team_management": true,
  "refunds": true, "payments": true,
  "supportLevel": "community" | "priority" | "dedicated"
}
```

All three plans have **identical** core feature flags (all `true`) — commercial differentiation is exclusively volume limits (Section 3) and `supportLevel`, per the phase's own instruction not to artificially gate existing functionality. `supportLevel` is informational metadata only; nothing reads or enforces it. `pricingModel: "custom"` is an additional marker present only on Enterprise's `features`, flagging its `price` field as non-literal. This contract lives as documented JSON data plus this report — no new TypeScript type was introduced for it, since nothing in the codebase reads `features` yet (consistent with "don't build enforcement now").

## 5. Subscription Lifecycle

`SubscriptionStatus` (pre-existing enum: `trialing`, `active`, `cancelled`, `expired`, `inactive`) is now operational. Valid transitions, enforced by `subscriptionService.ts`'s `assertValidTransition()`:

```
trialing -> active
trialing -> expired
active   -> cancelled
active   -> expired
inactive -> trialing   (schema default; no code path currently writes "inactive" or exercises this edge)
```

`cancelled` and `expired` are terminal — **no outgoing transition exists for either**, including `cancelled -> active`. This is deliberate and tested (`subscriptionLifecycle.test.ts`: five invalid-transition pairs, including the explicitly-called-out reactivation case, all rejected). If reactivation is ever needed, it must be a new, separately-designed operation — not a side effect of loosening this table.

- **`activateSubscription()`**: `trialing -> active`. Administrative only (no Razorpay, no payment collected). Sets `currentPeriodStart` (default: now) and optionally `currentPeriodEnd`.
- **`cancelSubscription()`**: `active -> cancelled`. **Immediate, not period-end** — chosen because most Starter/Growth per-event subscriptions never get a `currentPeriodEnd` set at all (per-event pricing has no natural recurring cycle to defer to), so a period-end policy would silently behave identically to immediate cancellation in the common case. A genuine period-end policy is a separate future decision, not a hidden default.
- **`expireSubscription()`**: `trialing|active -> expired`. Administrative for now — this is the exact hook point Phase 20C's enforcement layer will call automatically once it exists (e.g., detecting a lapsed trial or an unrenewed period); Phase 20B does not attempt to auto-detect either condition.
- **`changePlan()`**: explicit operation, never a raw `subscription.planId = x` write. Verifies the target plan exists and is `active` (rejects the inactive placeholder — tested), only permitted while the subscription is `trialing` or `active`, does not itself change status or enforce the new plan's limits.

## 6. Trial Implementation

**Free first exhibition, not a calendar-day trial** — implemented exactly as Phase 20A specified. `Subscription.trialEndsAt` is **deliberately left `NULL`** by `createTrialSubscription()`, with an explicit code comment explaining why: a date column cannot represent "this organizer's first exhibition has concluded," and writing a fake date to satisfy the column would be worse than leaving it null.

**Required follow-up schema decision, identified rather than guessed at**: the existing `trialEndsAt: DateTime?` field's *name* presumes a calendar-based trial model that this product's actual trial (event-completion-based) doesn't fit. Phase 20B does not rename or repurpose this field — it simply doesn't use it. When Phase 20C's enforcement layer needs to actually detect "this organizer is still trialing and has already used their one free exhibition," it will need either (a) a computed check against existing data (e.g., `Exhibition` count for the organizer while `Subscription.status = "trialing"`) rather than any date comparison, or (b) a schema addition (e.g., an explicit `trialExhibitionId` reference, or repurposing `trialEndsAt`'s semantics with a migration and a rename). This report deliberately does not choose between those now — it is exactly the kind of decision Phase 20C should make once enforcement is actually being designed, not before.

## 7. Organizer Bootstrap Integration

`lib/organizer.ts`'s `resolveOrganizerId()` — the **single** call site that creates an `Organizer` row anywhere in this codebase (confirmed by inspection; reached identically whether the caller's `User.userType` is `"exhibitor"` or they already hold some non-owning organizer membership) — was extended, not duplicated:

```
existing organizer membership found?  -> return it (no subscription touched)
else, inside prisma.$transaction:
  organizer.create (unchanged, same bootstrappedByUserId unique guard)
  createTrialSubscription(tx, organizer.id, starterPlan.id)   -- NEW
commit
logAudit("subscription.trial_created")   -- AFTER commit, not inside the transaction
```

A losing concurrent request (the existing P2002 catch path) returns the winner's `organizerId` **without ever calling `createTrialSubscription()`** — it never reaches that code at all. This is what makes "exactly one organizer, exactly one subscription" true under concurrency without any new schema constraint (see Section 13).

## 8. Existing Organizer Backfill

Two mechanisms, deliberately overlapping so both a "this database already has real organizers" environment and a "fresh migrate-then-seed" environment are covered:

1. **Migration-time backfill** (`20260904100000_subscription_lifecycle`): for every `Organizer` row that exists *at the moment this migration runs* and has no `Subscription` yet, insert one with a deterministic id (`'sub-trial-' || organizer.id`), `status = 'trialing'`, plan = Starter. In this project's actual dev database (which already had `seed-organizer-1` from prior phases' work), this backfilled it live — verified: `subscriptionCompatibility.test.ts` confirms `seed-organizer-1` now has a Starter trialing subscription.
2. **`seed.ts`'s own explicit upsert**: since `seed-organizer-1` is created via a direct `prisma.organizer.upsert()` call (not through `resolveOrganizerId()`), it would never receive a subscription automatically even after this phase's organizer-bootstrap change. `seed.ts` now explicitly upserts a subscription for it, using the **same deterministic id** the migration backfill uses — so re-running the migration's backfill logic and re-running seed can never produce two rows for the same organizer; whichever runs first creates it, the other is a harmless idempotent update.

No historical `Payment`, `Refund`, `PricingVersion`, `Exhibition`, `Stall`, or visitor/exhibitor data was touched by either mechanism — both only ever `INSERT`/`upsert` into `subscriptions`.

## 9. Subscription Service

`server/src/lib/subscriptionService.ts` (new). Exports: `SubscriptionError`, `assertValidTransition`, `getStarterPlan`, `getOrganizerSubscription`, `createTrialSubscription`, `activateSubscription`, `cancelSubscription`, `expireSubscription`, `changePlan`. No route contains subscription business logic directly — every route in `organizerSubscription.ts` and the new parts of `platform.ts` calls into this file, mirroring `refundService.ts`'s and `pricingVersion.ts`'s existing shape exactly.

## 10. API Routes

**`GET /api/organizer/subscription`** (new file, `routes/organizerSubscription.ts`) — self-service, organizer-scoped. Returns one entry per organizer the caller has `payment:view` on: `{organizer: {id, name}, subscription: {..., plan: {...}} | null}`. The organizer id is never taken from the request — resolved only via `organizerIdsWithPermission()`, exactly like every other organizer-scoped route in this codebase.

**Platform admin** (`routes/platform.ts`, extended):
- `GET /organizers/:id/subscription` — now returns real `{subscription}` data (previously hard-coded `{hasSubscriptionSystem: false}`).
- `GET /plans` — lists active plans (for the admin UI's plan-change dropdown).
- `PATCH /organizers/:id/subscription/plan` — calls `changePlan()`.
- `POST /organizers/:id/subscription/activate` — calls `activateSubscription()`, accepts optional `currentPeriodStart`/`currentPeriodEnd`.
- `POST /organizers/:id/subscription/cancel` — calls `cancelSubscription()`.
- `POST /organizers/:id/subscription/expire` — calls `expireSubscription()`.

All five are gated by the router-level `requireAuth, requirePlatformAdmin` middleware already applied to every route in this file — no normal organizer role can reach them regardless of which organizer id is in the URL (tested: `subscriptionSecurityConcurrency.test.ts`).

## 11. Platform Admin Integration

The organizer detail page's Subscription tab (`src/pages/platform/organizers/OrganizerDetail.tsx`) no longer renders the *"No billing system configured"* stub. It now shows: plan name, status (via the existing `StatusBadge`), price (or "Custom" for Enterprise), trial indicator, all five plan limits (explicitly labeled "informational — not enforced yet"), current period start/end, created/updated timestamps, and Activate/Cancel/Expire/Change-Plan actions — each button's `disabled` state matching the exact transition table in Section 5 (e.g., "Activate" is only enabled while `status === "trialing"`). Verified live in a running browser (Section 15).

No billing-management console, payment-collection UI, or fake billing data was built — exactly as instructed.

## 12. Audit Logging

Every lifecycle event calls the existing `logAudit()`/`AuditLog` (no second audit system): `subscription.trial_created`, `subscription.activated`, `subscription.cancelled`, `subscription.expired`, `subscription.plan_changed`. Each entry's `metadata` includes the subscription id, previous/new status or plan id, and (for trial creation) the assigned plan. `entityType: "Organizer"` / `entityId: <organizerId>` — consistent with how `platform.ts`'s pre-existing `organizer_suspended` audit action is already scoped, so `GET /organizers/:id/audit` (unmodified) automatically surfaces subscription events too. Verified: `subscriptionLifecycle.test.ts` reads back real `AuditLog` rows after real lifecycle transitions and checks `previousPlanId`/`newPlanId` metadata.

## 13. Security

- **Tenant isolation**: `subscriptionSecurityConcurrency.test.ts` — organizer A's `GET /api/organizer/subscription` never includes organizer B's entry, live-verified with two independently-bootstrapped organizers.
- **RBAC / unauthorized role**: a normal organizer owner's token is rejected (403) against every platform-admin lifecycle route, including against their *own* organizer id — the gate is role-based (`requirePlatformAdmin`), not organizer-scoped, so there is no ID to guess around.
- **Authentication**: unauthenticated `GET /api/organizer/subscription` returns 401 (existing `requireAuth` middleware, unmodified).
- **IDOR**: the organizer-scoped route resolves its own scope via `organizerIdsWithPermission()`, never from a client-supplied organizer id — there is no parameter for a client to manipulate in the first place.
- **Platform admin positive case**: a real platform-admin token can read any organizer's subscription — verified, not just the negative cases.

## 14. Concurrency

`resolveOrganizerId()`'s pre-existing `Organizer.bootstrappedByUserId` unique constraint plus its P2002-catch-and-resolve-to-winner pattern was **not weakened** — it is exactly the same mechanism, now wrapped around one additional `tx.subscription.create()` call inside the same transaction. Live-tested: two genuinely concurrent `POST /api/exhibitions` calls (via `Promise.all`) for one brand-new user resolve to the identical `organizerId`, and the database afterward shows exactly one `Organizer` row (`bootstrappedByUserId` scoped), exactly one owner `OrganizerMembership`, and exactly one `Subscription` row, `status: "trialing"`, plan Starter. No new schema-level uniqueness constraint was added for this — the transaction boundary around the winning request already makes it airtight (Section 7's flow diagram), and this was a deliberate choice over adding a partial-unique index, documented in `subscriptionService.ts`'s own doc comment.

## 15. Automated Tests

Same infrastructure as Phase 19A/19B: `node:test` + `tsx`, real HTTP requests against a real running instance of `app.ts`, real Postgres. **22 new tests**, four new files:

| File | Coverage |
|---|---|
| `subscriptionPlans.test.ts` (3 tests) | Required plans exist with exact limits; placeholder plan not a real offer; feature-contract parity across all three plans |
| `subscriptionLifecycle.test.ts` (9 tests) | Trial creation on bootstrap; exactly-one-subscription; organizer-scoped GET; valid transitions (unit); invalid transitions incl. cancelled→active (unit); full admin activate→cancel→reject-reactivation with audit trail; admin expire; plan change preserves audit/never touches Payment/PricingVersion; inactive-plan assignment rejected |
| `subscriptionSecurityConcurrency.test.ts` (6 tests) | Tenant isolation; unauthenticated rejection; non-admin rejected from lifecycle routes; IDOR (non-admin can't touch even their own organizer via the admin route); platform-admin positive case; concurrent bootstrap produces exactly one organizer/membership/subscription |
| `subscriptionCompatibility.test.ts` (4 tests) | Pre-existing seed organizer backfilled correctly; existing payments unchanged; existing refund state unchanged; existing PricingVersions unchanged |

**Full-suite result**: `npm run test` in `server/` — **45/45 pass** (23 from Phase 19A/19B, unmodified, still passing + 22 new), ~4 seconds. All test-created users/organizers/subscriptions/memberships/exhibitions are deleted in `after()` hooks; verified after the run the database returned to its exact prior state (1 organizer, 1 subscription, 34 users — the 34th being a genuine pre-existing real-user test booking unrelated to any phase's automated work, confirmed by inspection and left untouched).

## 16. Live Integration Tests

Ran against fresh `npm run dev` instances (backend :4000, frontend :8080):

1-2. Fresh organizer bootstrap via real signup + `POST /api/exhibitions` → Starter trialing subscription confirmed via direct query and via the new `GET /api/organizer/subscription` route.
3. Exactly one subscription confirmed (count query).
4-5. Subscription + plan read back correctly, including full limit set, via the live API.
6. Platform admin's Subscription tab, opened in a real browser (Playwright via the project's browser-automation skill), rendered live data: `Plan: Starter`, `Status: trialing`, `Price ₹14,999`, `Trial: Free first exhibition`, all five limits, Activate/Cancel/Expire buttons — zero console errors, zero failed requests.
7-8. Clicked "Activate" live in the browser → page updated to `Status: active`, `Current period start` populated — confirmed via the rendered DOM text.
9-10. (Cancel/expire covered by automated tests directly against the API — Section 15 — rather than re-driven through the browser a second time, since the UI-to-API wiring was already proven live by the Activate click.)
11. Invalid transition (re-activating an already-cancelled subscription) tested via the real API — 400, `INVALID_TRANSITION` — in `subscriptionLifecycle.test.ts`.
12-13. Cross-tenant and unauthorized-role access tested via the real API in `subscriptionSecurityConcurrency.test.ts`.
14. Concurrent organizer bootstrap tested via two genuinely concurrent `fetch()` calls in the same test file.
15. Existing exhibition workflows: live-verified a fresh paid-ticket booking end to end (signup → book → mock-complete) — unaffected.
16. Existing payment workflow: same live check — `status: "paid"`, `amount: 499`, unchanged shape.
17. Existing refund workflow: live-initiated a real refund against that payment via `POST /api/organizer/payments/:id/refund` — `status: "PROCESSING"`, identical to pre-Phase-20B behavior.
18. `PricingVersion` rows unchanged — confirmed by `subscriptionCompatibility.test.ts` and live query (still exactly `legacy-unversioned` (inactive) + `launch-2026` (active)).
19. Existing payment amounts unchanged — confirmed by `subscriptionCompatibility.test.ts` reading `baseAmount === amount` on every legacy payment.
20. Database consistency verified after all live testing: reverted the one destructive live action (the Activate click) back to `trialing`/`null` periods to match the seed baseline exactly, deleted the stray audit row it produced, and deleted all curl-created test users/bookings/payments/refunds. Final state confirmed: 1 organizer, 1 subscription (`trialing`), 34 users, 13 payments (12 seed + 1 pre-existing real-user booking unrelated to this or any prior phase's work), 0 refunds, 4 plans.

## 17. Database Changes

**Migration**: `20260904100000_subscription_lifecycle` — purely a data migration (3 `INSERT`s for the real plans, 1 backfill `INSERT ... SELECT ... WHERE NOT EXISTS` for existing organizers). **No `ALTER TABLE`, no new column, no new enum, no new index.** `npx prisma migrate status`: up to date, 14 migrations. `npx prisma validate`: valid.

**Why no schema change was needed** (per this phase's own "prefer no schema changes, explain if one is genuinely necessary" instruction): every column this phase's lifecycle requires — `Plan`'s price/limits/features/active, `Subscription`'s status/currentPeriodStart/currentPeriodEnd/trialEndsAt — was already added by Phase 19A specifically in anticipation of this phase. The one place a schema addition was *considered* (a database-level partial-unique index enforcing "at most one non-terminal subscription per organizer") was deliberately not added — see Section 14 for why the existing transactional bootstrap guarantee already makes it unnecessary for every call site this phase actually has.

## 18. Seed Changes

`server/prisma/seed.ts`:
- **New**: one `subscription.upsert()` for `seed-organizer-1`, keyed on the same deterministic id the migration backfill uses (`sub-trial-seed-organizer-1`) — explicit Starter-trialing state, per this phase's own Step 23 instruction ("If the development seed organizer receives Starter trial status, make that explicit").
- **Bug fix, required to verify seed idempotency at all**: `seed.ts`'s three `payment.upsert()` calls (`seed-payment-biz1-stall`, `seed-payment-biz2-stall`, and the ticket-payment loop) were missing `baseAmount`/`organizerAmount`/`pricingVersionId` — required, non-nullable fields added to `Payment` back in Phase 19A. This meant **`seed.ts` has been unable to run to completion since Phase 19A** (it crashed on the very first `create` branch it could reach on a fresh run) — never caught before because no phase had actually re-run it end-to-end since. Fixed by adding the same three legacy-compatible values Phase 19A's own migration backfill already uses (`baseAmount = amount`, `organizerAmount = amount`, `pricingVersionId = "pv-legacy-unversioned"`), plus `refundedAmount = amount` for the one seeded already-refunded ticket, matching Phase 19B's own backfill semantics. This is a pre-existing regression from a prior phase, not something Phase 20B's own changes introduced — fixed here because Phase 20B's own Step 23 explicitly requires verifying seed idempotency, which was otherwise impossible to honestly confirm.

**Idempotency verified**: ran `npx tsx prisma/seed.ts` twice in direct succession. Row counts identical both times (1 organizer, 1 subscription, 4 plans, 34 users, 12 seed-fixed payments) — no duplicates of any kind.

## 19. Payment/Refund Compatibility

**Verified unmodified** (confirmed via file-modification-time inspection, not merely asserted): `server/src/lib/paymentService.ts`, `server/src/lib/refundService.ts`, `server/src/lib/pricingEngine.ts`, `server/src/lib/pricingVersion.ts`, `server/src/lib/payments/{razorpay,mock,index}.ts` all carry modification timestamps from Phase 19A/19B, none from this phase's work window. Behaviorally confirmed both by the full Phase 19A/19B automated suite (23 tests) passing unmodified, and by live re-verification: a fresh paid-ticket booking, its mock-provider capture, and a real refund against it, all produced byte-identical response shapes and status transitions to what Phase 19B's own report documented.

## 20. Explicitly Deferred Items

Per Step 20/16 — none built, none partially built, no dependency found requiring otherwise:
- Razorpay / any live payment gateway integration.
- Subscription checkout or any payment collection for a plan.
- Recurring/automated billing.
- Coupons, discounts.
- Invoices, GST calculation.
- Payment retries, subscription payment webhooks.
- Plan-limit **enforcement** anywhere (Section 21).

## 21. Phase 20C Requirements

Concrete, informed by what this phase actually built:

1. **Entitlement checks** at the exact write points identified in `docs/PHASE_20A_COMMERCIAL_MODEL_REPORT.md` Section 18: exhibition creation (`POST /api/exhibitions`), exhibitor-application approval (`PATCH .../exhibitors/:id`), ticket booking (`POST /api/bookings/tickets`), stall creation, team-member invite. Each check reads the organizer's current `Subscription.plan` limits (already real data as of this phase) and the organizer's current usage count, live, at write time — never cached, never client-reported, using the same real-time/race-safe pattern already established for stall reservation (Phase 2-era) and refund concurrency (Phase 19B).
2. **Resolve the trial-completion question flagged in Section 6**: decide how "the free first exhibition has been used" is actually detected — a computed check (organizer has ≥1 `Exhibition` while still `trialing`) versus a schema change to `Subscription`. This report deliberately leaves that decision to Phase 20C rather than guessing now.
3. **Wire `expireSubscription()`/a limit-breach response into the actual enforcement flow** — e.g., a Starter-trialing organizer attempting to create a second exhibition should get a clear, actionable error (and, per Section 6, potentially trigger the trial→expired transition), not a generic 403.
4. **Frontend UX warnings** at the same points, as a courtesy only — the backend check from item 1 remains authoritative regardless of what the frontend shows or omits.
5. Everything already explicitly out of scope for 20B remains out of scope for 20C too, per Phase 20A's own Section 19 (billing, Razorpay, coupons, ledger, settlement, multi-currency, enterprise billing automation) unless Phase 20C's own audit finds a genuine dependency.

## 22. Remaining Risks

- **`trialEndsAt` semantic mismatch** (Section 6): the field exists, is intentionally never set, and its very name will confuse a future reader who doesn't already know why. Mitigated by the doc comment in `subscriptionService.ts` and this report, but a real risk until Phase 20C makes an explicit decision.
- **Multiple organizer memberships → multiple subscriptions surfaced together**: `GET /api/organizer/subscription` returns one entry per organizer in scope; a user belonging to several organizers sees a list, not a single "the" subscription. This is correct given `OrganizerMembership`'s existing unrestricted multi-org design, but is a slightly more complex response shape than a naive single-object API — documented in the route's own comment, not hidden.
- **The seed.ts bug fix (Section 18)** was necessary to complete this phase's own required verification (seed idempotency) but touches code outside this phase's narrowly-scoped new files. It is a minimal, additive fix (three missing required fields, using already-established legacy-compat values) with no behavioral change to anything except making a previously-crashing script run — flagged explicitly here rather than silently folded in.
- **No automatic trial or period expiration**: nothing in this phase or the codebase currently transitions a subscription on its own — every transition is admin-triggered. This is intentional (Phase 20C's job) but means a trial today never "runs out" on its own, which is fine given plan enforcement doesn't exist yet either, but is worth stating plainly rather than leaving implicit.

## 23. Final Status

**PASS**

## Created

- `server/prisma/migrations/20260904100000_subscription_lifecycle/migration.sql`
- `server/src/lib/subscriptionService.ts`
- `server/src/routes/organizerSubscription.ts`
- `server/tests/subscriptionPlans.test.ts`
- `server/tests/subscriptionLifecycle.test.ts`
- `server/tests/subscriptionSecurityConcurrency.test.ts`
- `server/tests/subscriptionCompatibility.test.ts`
- `docs/PHASE_20B_SUBSCRIPTION_LIFECYCLE_REPORT.md`

## Modified

- `server/src/lib/organizer.ts` — `resolveOrganizerId()` now creates a Starter trial subscription inside the same transaction as organizer creation, and audit-logs it after commit.
- `server/src/app.ts` — mounted the new `organizerSubscriptionRouter` at `/api/organizer/subscription`.
- `server/src/routes/platform.ts` — replaced the hard-coded `{hasSubscriptionSystem: false}` stub with real data; added `GET /plans` and the four admin lifecycle routes.
- `server/prisma/seed.ts` — added the explicit Starter-trial subscription upsert for the seed organizer; fixed three pre-existing (Phase 19A-era) missing-required-field bugs in `Payment` upserts that were silently preventing the script from ever completing a fresh run.
- `src/hooks/platform/usePlatformAdmin.ts` — replaced the stub subscription hook's return type; added `usePlatformPlans`, `useActivateSubscription`, `useCancelSubscription`, `useExpireSubscription`, `useChangeSubscriptionPlan`.
- `src/pages/platform/organizers/OrganizerDetail.tsx` — replaced the "No billing system configured" stub with a real `SubscriptionTab` component.

## Not Modified (verified via file-modification-time inspection and `git diff`, not merely asserted)

- `server/src/lib/paymentService.ts` — untouched.
- `server/src/lib/refundService.ts` — untouched.
- `server/src/lib/pricingEngine.ts` — untouched.
- `server/src/lib/pricingVersion.ts` — untouched.
- `server/src/lib/payments/{razorpay,mock,index}.ts` — untouched; Razorpay remains unconfigured, no credentials added, no new provider code.
- `server/prisma/schema.prisma` — untouched; zero schema changes, confirmed both by the migration containing only `INSERT` statements and by the file's own modification timestamp predating this phase's work window.
- Existing refund architecture (idempotency, concurrency, full/partial refund logic) — untouched; the full Phase 19B automated suite (12 tests) passed unmodified in the same run as this phase's new tests.

## Final Validation

- ✅ Plan records operational (3 real active plans + the untouched placeholder).
- ✅ Subscription lifecycle operational (trialing→active→cancelled/expired, validated transitions, tested).
- ✅ Starter trial operational (created automatically, `trialEndsAt` correctly left unset rather than faked).
- ✅ Organizer bootstrap creates subscription (verified live and via automated test, both the "normal" and exhibitor-typed paths — which are, in fact, the single same code path).
- ✅ Duplicate subscriptions prevented (transactional, tied to the pre-existing organizer-bootstrap race guard).
- ✅ Concurrent creation tested (two genuinely concurrent bootstrap requests → exactly one organizer, one membership, one subscription).
- ✅ Platform admin subscription view operational (real data, live-verified in a browser).
- ✅ Audit logging operational (5 new audit actions, all tested).
- ✅ Tenant isolation verified.
- ✅ RBAC verified.
- ✅ Existing payment behavior preserved (live-verified + full Phase 19A suite passing).
- ✅ Existing refund behavior preserved (live-verified + full Phase 19B suite passing).
- ✅ Historical financial data preserved (no `Payment`/`Refund`/`PricingVersion` row altered by this phase's own code).
- ✅ Razorpay not configured (untouched).
- ✅ Subscription billing not implemented.
- ✅ Plan enforcement not implemented.
- ✅ GST not invented/hard-coded.
- ✅ No unnecessary schema changes (zero schema changes at all).
- ✅ Automated tests pass (45/45).
- ✅ Builds/typechecks pass (backend + frontend, both Quality Gate commands).

## Summary

Implemented the real subscription lifecycle on top of Phase 19A's dormant `Plan`/`Subscription` foundation: three real commercial plans, a validated trialing→active→cancelled/expired lifecycle, automatic Starter-trial assignment on organizer bootstrap (race-safe, zero new schema), a real platform-admin subscription view replacing the old honest-stub, and full audit logging — all without touching payments, refunds, pricing, or Razorpay, and without enforcing a single plan limit anywhere. What remains for Phase 20C: deciding how "trial used" is actually detected (Section 6/21), and wiring real limit checks into the exhibition/exhibitor/ticket/stall/team-invite write paths, backend-authoritative, exactly as this phase's own design already anticipates.
