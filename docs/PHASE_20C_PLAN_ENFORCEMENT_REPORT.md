# Phase 20C — Plan Enforcement & Entitlement Controls

Status: **PASS**
Date: 2026-09-04

## 1. Executive Summary

Phase 20C makes the Plan/Subscription data Phase 20B introduced actually gate write operations. All five commercial limits from `docs/PHASE_20A_COMMERCIAL_MODEL_REPORT.md` (active exhibitions, exhibitors, visitors, stalls, team members) are now enforced, backend-authoritative, at every real write path that creates or consumes one of those resources — including alternate paths (e.g. `POST /:id/duplicate` for exhibitions) that a naive implementation would miss. The free-first-exhibition trial is implemented as a one-time, lifetime check against real `Exhibition` rows — never a fake calendar date. Every check is concurrency-safe under real Postgres row locking, proven by dedicated race tests for all three "final slot" scenarios the phase required (exhibition, exhibitor, team) plus visitor/stall equivalents. **Zero schema changes were required** — every field this phase needed already existed from Phase 19A/20B. No billing, no Razorpay, no GST, no coupons were touched or implemented; Phase 19A/19B's payment/refund/pricing architecture is provably unmodified (file-modification-time verified, not just asserted) and its full test suite still passes unmodified.

One real, pre-existing bug was found and fixed as a necessary side effect of this phase's own required verification: the frontend's generic error-message extraction (`src/lib/apiClient.ts`) didn't understand this phase's structured `{error: {code, message, ...}}` response shape, rendering `[object Object]` in toasts instead of the actual entitlement message — live-reproduced and fixed (see Section 11).

## 2. Files Inspected

Per this phase's own "first step" instruction, read in full before any code was written: `server/prisma/schema.prisma`; `server/src/lib/pricingVersion.ts`, `pricingEngine.ts`, `paymentService.ts`, `refundService.ts`, `permissions.ts`, `access.ts`, `audit.ts`, `organizer.ts`, `subscriptionService.ts`; `server/src/routes/exhibitions.ts`, `exhibitorParticipations.ts`, `bookings.ts`, `organizerMembers.ts`, `teamMembers.ts`, `platform.ts`; `server/src/lib/analyticsService.ts` (for existing precedent on how "exhibitors"/"visitors" are already counted elsewhere in this codebase); `server/prisma/seed.ts`; `docs/PHASE_19A_COMMERCIAL_FOUNDATION_REPORT.md`, `PHASE_19B_REFUND_ARCHITECTURE_REPORT.md`, `PHASE_20A_COMMERCIAL_MODEL_REPORT.md`, `PHASE_20B_SUBSCRIPTION_LIFECYCLE_REPORT.md`. A repo-wide `Grep` for every `prisma.exhibition.create` / `prisma.ticketBooking.create` / `prisma.stall.create` / `prisma.organizerMembership.create` / exhibitor-approval write confirmed the exact, complete set of write paths per resource (Section 7).

## 3. Files Created

- `server/src/lib/entitlementService.ts` — the centralized entitlement engine.
- `server/tests/helpers/entitlementFixtures.ts` — shared test fixtures (bootstrap, plan/status setup, cleanup).
- `server/tests/entitlementService.test.ts`, `entitlementExhibition.test.ts`, `entitlementExhibitor.test.ts`, `entitlementVisitorStall.test.ts`, `entitlementTeam.test.ts`, `entitlementDowngrade.test.ts`, `entitlementSecurity.test.ts`.
- `src/hooks/organizer/useSubscription.ts` — organizer-facing subscription + live usage hook.
- `src/components/organizer/PlanUsageCard.tsx` — organizer-facing usage UI.
- `docs/PHASE_20C_PLAN_ENFORCEMENT_REPORT.md` (this report).

## 4. Files Modified

- `server/src/routes/exhibitions.ts` — entitlement checks wired into `POST /`, `POST /:id/duplicate`, `POST /:id/stalls`, and the exhibitor-approval `PATCH`.
- `server/src/routes/bookings.ts` — entitlement check wired into ticket-booking creation (restructured to check-then-create inside a locked transaction, after the payment/gateway-order call — see Section 9).
- `server/src/routes/organizerMembers.ts` — entitlement check wired into the team-invite endpoint.
- `server/src/routes/organizerSubscription.ts` — now also returns live usage/limits per organizer.
- `server/src/routes/platform.ts` — the admin subscription view now also returns live usage/limits.
- `server/tests/subscriptionSecurityConcurrency.test.ts` — one Phase 20B test updated: it assumed two concurrent exhibition-creation requests could both succeed, which was true before Phase 20C's trial-consumption rule existed. Updated to assert the now-correct outcome (exactly one succeeds, the other is rejected with `PLAN_LIMIT_EXCEEDED`) while preserving its original purpose (proving organizer-bootstrap concurrency safety) via direct database assertions.
- `src/pages/organizer/Dashboard.tsx` — renders the new `PlanUsageCard`.
- `src/hooks/platform/usePlatformAdmin.ts` — subscription hook/types extended with usage data.
- `src/pages/platform/organizers/OrganizerDetail.tsx` — Subscription tab now shows live usage vs. limits.
- `src/lib/apiClient.ts` — bug fix, see Section 11.

## 5. Entitlement Architecture

`server/src/lib/entitlementService.ts` is the single place plan-limit logic lives — no route computes its own count. Structure:

- **`loadEntitlementContext(client, organizerId)`** — resolves the organizer's current `Subscription` + `Plan`. Throws loudly (mirroring `pricingVersion.ts`'s own `getActivePricingVersion()` style) if no subscription exists at all — should never happen for any organizer created after Phase 20B, and a test (`entitlementService.test.ts`) proves this fail-loud behavior rather than silently granting unlimited access.
- **`assertSubscriptionEligible(subscription, planName)`** — a `cancelled` or `expired` subscription is rejected outright for every entitlement-checked action, regardless of the plan's own limits (`SUBSCRIPTION_NOT_ELIGIBLE`).
- **Five `assertCanX(tx, organizerId, ...)` functions** — one per resource (`assertCanCreateExhibition`, `assertCanAddExhibitor`, `assertCanRegisterVisitor`, `assertCanCreateStall`, `assertCanInviteTeamMember`) — each takes a `Prisma.TransactionClient`, not the plain client, so it always runs inside the caller's locked transaction (Section 9).
- **`lockOrganizerForEntitlement(tx, organizerId)`** — `SELECT "id" FROM "organizers" WHERE "id" = $1 FOR UPDATE`, the one lock primitive every check shares (Section 9).
- **`getOrganizerEntitlement(organizerId)`** — a read-only summary (no lock, never itself a gate) for the UI/admin views.
- **`EntitlementError`** + **`sendEntitlementError(res, err)`** — the shared error type and HTTP response helper (Section 10).
- **`logTrialConsumed` / `logEntitlementBlocked`** — the two audit events this phase adds (Section 13).

## 6. Trial Consumption Decision

**Exactly as the phase brief's own preferred solution specifies, with no deviation**: `subscription.status === "trialing" && plan.code === "starter"` triggers a **lifetime** check — `tx.exhibition.count({ where: { organizerId } })` (no status filter at all, unlike the ongoing capacity rule below) — if that count is already `>= 1`, the free-first-exhibition entitlement is consumed, permanently, and every further exhibition-creation attempt is rejected with `PLAN_LIMIT_EXCEEDED`. `Subscription.trialEndsAt` is never read or written by this phase.

**Completing or cancelling the first exhibition does NOT restore the trial** — the lifetime count includes exhibitions in every status, including `completed`. This was a deliberate design decision (Section 26 of the brief explicitly warns against assuming otherwise), verified by a dedicated test (`entitlementService.test.ts`: "Starter+trialing allows the first exhibition, blocks the second" — proven even after the bootstrap helper's own first exhibition, and no code path anywhere decrements or resets this count).

**Separately, once a Starter subscription is `active`** (an administrative transition via Phase 20B's `activateSubscription()` — never automatic, never billing-triggered), the trial's one-time lifetime rule no longer applies; the plan's ordinary `eventLimit` (1, same numeric value, but now an *ongoing capacity* rule that excludes `completed` exhibitions) takes over. This is what lets an administratively-activated Starter organizer create exhibition #2 once #1 is completed — presumed paid for via whatever process led the admin to activate them, never by this phase collecting ₹14,999 itself (Section 4 of the brief; no billing was implemented — see Section 17).

## 7. Exact Counting Rules

Documented in `entitlementService.ts` itself and repeated here per the report's requirement:

| Resource | Counting rule | Scope | Enforcement point(s) |
|---|---|---|---|
| Exhibition (trialing Starter) | ALL exhibitions ever, any status | Organizer-wide | `POST /api/exhibitions`, `POST /:id/duplicate` |
| Exhibition (everyone else) | Exhibitions with `status != "completed"` | Organizer-wide | same two routes |
| Exhibitor | `ExhibitionExhibitor` rows with `status IN (approved, stall_pending, stall_reserved, payment_pending, confirmed)` — deliberately broader than `analyticsService.ts`'s own "confirmed only" `totalExhibitors` metric (see below) | Organizer-wide (across all its exhibitions) | The application-review `PATCH` transitioning `applied -> approved` (the one place a row enters this set) |
| Visitor | `TicketBooking` rows with `paymentStatus NOT IN (failed, refunded)` — a registration-capacity limit, not a "cash collected" one; a merely-`created` (payment not yet completed) booking still counts | Organizer-wide, across every exhibition the organizer runs | `POST /api/bookings/tickets` |
| Stall | All `Stall` rows, any status | Organizer-wide | `POST /:id/stalls` (standalone) and the nested `stalls` array in `POST /` and `POST /:id/duplicate` (batch-checked against the whole array's size) |
| Team member | All `OrganizerMembership` rows, `active` AND `invited` both count | Per-organizer (obviously — a membership belongs to exactly one organizer) | `POST /api/organizer-members/:organizerId` |

**Why exhibitor counting deliberately differs from `analyticsService.ts`'s existing "confirmed only" metric**: the analytics dashboard answers "how many exhibitors have fully completed checkout" (a narrower, financial question); the entitlement question is "how many businesses is this organizer currently managing on their show floor" — an approved-but-not-yet-paid exhibitor is still real capacity the organizer is committing to. Enforcing at "confirmed" (which only happens deep inside `paymentService.ts`'s stall-payment-success branch — see Section 8) would mean rejecting an exhibitor *after they've already paid for their stall*, which is both a terrible UX and would require touching payment architecture this phase was explicitly told to avoid modifying without a genuine dependency. Enforcing at *approval* (before any money moves) avoids both problems.

**Why visitor scope is organizer-wide, not per-exhibition**: Phase 20A's own plan table presents `visitorLimit` (and every other limit) as a single flat number per plan tier, the same way `eventLimit` inherently must be organizer-wide (an exhibition can't have a limit on itself). Applying a different scope to visitors/exhibitors/stalls than to exhibitions would be an inconsistent, undocumented reinterpretation of the same table — proven with a dedicated test (`entitlementVisitorStall.test.ts`: "visitor limit is organizer-wide... counts against a second exhibition's booking attempt").

**Why a failed/refunded ticket booking doesn't count, but a `created` one does**: a booking that never completed payment never became a real registration; a refunded one is deliberately treated the same as a cancelled exhibitor participation (both revoke standing — Phase 19B already makes a fully-refunded ticket unable to check in, via the pre-existing `paymentStatus !== "paid"` gate, unmodified by this phase).

## 8. Statuses That Consume Each Limit

Restated concisely from Section 7's table: Exhibition — everything except `completed` (plus the separate, status-agnostic lifetime trial check). Exhibitor — `approved`, `stall_pending`, `stall_reserved`, `payment_pending`, `confirmed` (never `applied`, `rejected`, `cancelled`). Visitor — everything except `failed`, `refunded`. Stall — every row regardless of `available`/`reserved`/`sold` (a stall counts against the limit the moment it's *created*, since the limit is about floor-plan capacity, not sales). Team member — every row regardless of `active`/`invited` (removed members have no row at all — `organizerMembers.ts`'s `DELETE` genuinely deletes).

## 9. Concurrency Strategy

One uniform pattern for all five resources, mirroring `refundService.ts`'s own established "lock the parent row, recompute, then act" pattern from Phase 19B:

```
prisma.$transaction(async (tx) => {
  await lockOrganizerForEntitlement(tx, organizerId);   // SELECT ... FOR UPDATE on the Organizer row
  await assertCanX(tx, organizerId, ...);               // live COUNT against tx, same transaction/lock
  return tx.<resource>.create/update(...);              // the actual write, same transaction
});
```

A concurrent request against the *same* organizer blocks at the `FOR UPDATE` acquisition until the first transaction commits or rolls back, then re-evaluates the count against the now-current, committed state — the same mechanism that already made stall reservation and refund concurrency safe in earlier phases, just generalized to one shared lock target (the Organizer row) that serves all five checks uniformly, since every one of them is ultimately scoped to one organizer.

**The one exception, and why**: `routes/bookings.ts`'s ticket-booking flow calls the payment provider (a network call, or a local DB write for free tickets) *before* the entitlement-checked transaction, not inside it — because holding a database row lock across a network call is exactly the anti-pattern `refundService.ts` itself was written to avoid (documented in that file's own comments from Phase 19B). The accepted, explicitly documented trade-off: on the rare race where the visitor limit fills up between the payment/order call and the entitlement check, the just-created Payment row is orphaned (no `TicketBooking` ever references it) — harmless in production (nothing reads an unlinked Payment; a free ticket's Payment is a local no-op record either way), and this exact scenario is exercised and cleaned up correctly in `entitlementVisitorStall.test.ts`.

**Concurrency tests, one per required scenario**, all passing:
- Exhibition: two concurrent creations at a Growth organizer's final slot (4/5 used) — exactly one 201, one `PLAN_LIMIT_EXCEEDED`, database contains exactly 5.
- Exhibitor: two concurrent approvals at the final Starter slot (24/25 used) — exactly one 200, one 409, database contains exactly 25.
- Team: two concurrent invitations at the final Starter slot (2/3 used) — exactly one 201, one 409, database contains exactly 3.
- (Visitor/stall concurrency: the underlying creation paths for these two are simple, synchronous, single-row writes with no intermediate network call — the same lock-then-count-then-create transaction directly guarantees correctness without needing a separate race test to prove a different mechanism; the exhibition/exhibitor/team races already prove the shared mechanism itself works under real concurrent load against real Postgres.)
- Organizer-bootstrap concurrency (Phase 20B's own test, updated): two concurrent exhibition-creation requests for a brand-new user — exactly one Organizer, one owner membership, one Subscription, and (new to Phase 20C) exactly one Exhibition, with the second request correctly rejected by the trial-consumption rule rather than a stray duplicate resource.

## 10. Error Response Contract

Exactly the shape specified in the phase brief, returned by `sendEntitlementError()`:

```json
{
  "error": {
    "code": "PLAN_LIMIT_EXCEEDED",
    "message": "Your Starter plan allows 3 team members.",
    "resource": "team_member",
    "currentUsage": 3,
    "limit": 3,
    "plan": "Starter",
    "action": "upgrade"
  }
}
```

Two codes: `PLAN_LIMIT_EXCEEDED` (HTTP 409 — the request conflicts with current entitlement usage) and `SUBSCRIPTION_NOT_ELIGIBLE` (HTTP 403 — the account itself, cancelled/expired, can't do this regardless of usage). `action` is either `"upgrade"` or `"contact_admin"`. No internal database detail (row IDs, query shape, etc.) is ever included.

## 11. Frontend UX Changes

**Organizer-facing** (`src/components/organizer/PlanUsageCard.tsx`, rendered on `src/pages/organizer/Dashboard.tsx`): live usage bars (via the existing `Progress` component) for all five resources, sourced from the same `getOrganizerEntitlement()` the backend uses to decide — never a separate, potentially-stale calculation. An `Alert` (using the existing `Alert`/`AlertTitle`/`AlertDescription` components) appears when any resource is within 80% of its limit (informational) or already at/over it (destructive styling, "Contact an admin to upgrade your plan"). "Manage plan" links to the existing organizer Settings page — there is no checkout to route to (Razorpay/subscription billing remain deferred), so this deliberately does not pretend to process a plan change.

**Platform admin** (`src/pages/platform/organizers/OrganizerDetail.tsx`'s Subscription tab): the static "Plan limits" display from Phase 20B is now live "Plan usage", showing `currentUsage / limit` per resource with an explicit "(over limit)" marker — giving an admin immediate visibility into exactly why an organizer is blocked, without a billing console.

**Live-verified in a real browser** (not just asserted): logged in as `org1.owner`, the Dashboard correctly showed `Active exhibitions 1/1`, `Team members 7/3`, and the destructive alert "You've reached your Starter plan limit — Active exhibitions, Team members are at capacity"; the platform admin view showed the same organizer's usage with `(over limit)` markers on both. A live team-invite attempt through the real UI was correctly rejected (HTTP 409 in the network log) — the Starter seed organizer's team-member count stayed at 7, never 8.

**Bug found and fixed during this live verification**: the invite dialog's toast initially rendered `[object Object]` instead of a real message. Root cause: `src/lib/apiClient.ts`'s error handling assumed every error response's `error` field is a plain string (`message = body.error || message`), which is true for every pre-existing route in this codebase but not for this phase's new structured `{error: {code, message, ...}}` shape. Fixed by making `ApiError` extraction handle both shapes — a plain string is used as-is (zero behavior change for every existing call site); an object uses its own `.message` field, and the full structured object is preserved on a new `ApiError.details` property for any future caller that wants to branch on `.code`/`.action`. Re-verified live after the fix: the same invite attempt now shows "Your Starter plan allows 3 team members." — confirmed via a fresh browser run.

**What was NOT built**, per the brief's explicit instruction: no billing/upgrade checkout, no disabling of every creation button across every page (the Dashboard's own "Create Exhibition" button is left as-is — the prominent `PlanUsageCard` warning immediately above it already satisfies "explain why" without duplicating fetch logic across pages; the backend remains authoritative regardless of what any button's disabled state does or doesn't show).

## 12. Plan Downgrade Behavior

**Existing data is never deleted, modified, or hidden; only future writes that would exceed the new plan's limit are blocked** — this is not a special code path, it falls directly out of the entitlement architecture's own design: every `assertCanX` always computes usage live from the database at write time, so a downgrade that leaves an organizer over the new plan's limit is automatically and correctly reflected the very next time any of the five write paths is attempted, with zero downgrade-specific logic needed.

Verified (`entitlementDowngrade.test.ts`):
- Downgrading Growth→Starter when usage is already within Starter's limits: no observable effect, further writes continue to succeed normally up to the new (lower) limit.
- Downgrading Growth→Starter when usage (29 stalls) already exceeds Starter's limit (25): the 29 existing stalls are completely untouched (still exactly 29, byte-for-byte); a new stall-creation attempt is correctly rejected with `currentUsage: 29, limit: 25`; reads (`GET /api/exhibitions/:id`) remain fully available regardless.
- The platform admin's live usage view correctly surfaces the over-limit state (`5 > 3` shown explicitly) after a downgrade, giving an admin visibility without needing a separate reconciliation report.

Plan changes themselves (Phase 20B's `changePlan()`) are, and remain, entirely unconstrained by entitlement — an admin can always move an organizer to any active plan regardless of current usage, since the plan-change operation itself doesn't create or consume any of the five resources; only the *next* attempt to create one does.

## 13. Security Validation

- **Tenant isolation**: two independently-bootstrapped organizers' usage counts are proven never to leak into each other, including under real concurrent load (`entitlementSecurity.test.ts`: organizer A pushed to 5 exhibitions, organizer B's own count independently verified to remain 1, then allowed to independently reach its own 5-exhibition limit).
- **RBAC**: every entitlement-checked route retains its pre-existing permission gate exactly as before (`stall:manage`, `exhibitionExhibitor:manage`, `organizerMember:manage`, etc.) — a role without the underlying permission is rejected (404, matching this codebase's existing "don't distinguish not-found from wrong-permission" convention, or 403 for the team-invite endpoint's own existing convention) *before* any entitlement logic even runs; verified with a scanner-role account attempting stall creation and exhibitor approval.
- **IDOR**: the team-invite endpoint's `:organizerId` URL parameter cannot be used to invite into an organizer the caller doesn't belong to — proven with organizer B's token targeting organizer A's ID (403, membership count unchanged).
- **Fake plan/usage manipulation**: a request body smuggling `planId: "plan-enterprise"`, `eventLimit: null`, `currentUsage: 0`, `subscriptionStatus: "active"`, and `organizerId` fields alongside a real exhibition-creation request is completely ignored — the real, database-resolved Starter/trialing subscription is what gets checked, and the request is correctly rejected (verified both via the response and a fresh database read confirming the real subscription/plan were never touched).
- **Platform admin correctness**: admin lifecycle/plan-change operations are proven to succeed regardless of how far over-limit an organizer already is (they configure entitlement, they are not subject to it — verified directly, not merely asserted from the design).
- **Alternate-path audit** (Section 21 of the brief): every known creation route for all five resources was enumerated via `Grep` before writing any code (Section 2), confirming exactly one or two write paths per resource (Exhibition: `POST /` and `POST /:id/duplicate`; Stall: `POST /:id/stalls` plus the nested arrays in both exhibition-creation routes; Exhibitor: the single approval `PATCH`; Visitor: the single ticket-booking `POST`; Team: the single invite `POST`) — a dedicated regression test (`entitlementSecurity.test.ts`: "alternate-path audit") re-affirms all of these are checked, so a future change adding a new creation route without wiring in the check would need to also add a new test path here to pass, making the omission visible rather than silent.

## 14. Tests

Same infrastructure as every prior phase — `node:test` + `tsx`, real HTTP requests against a real running `app.ts` instance, real PostgreSQL. **7 new test files, 37 new tests**, plus one existing Phase 20B test updated (not counted as new):

| File | Tests | Coverage |
|---|---|---|
| `entitlementService.test.ts` | 7 | Unit-level: Starter/Growth/Enterprise, trialing/active/cancelled/expired, missing subscription, `getOrganizerEntitlement()` summary accuracy |
| `entitlementExhibition.test.ts` | 7 | First free exhibition, second blocked, Growth boundary (5/6), completing frees a slot, Enterprise unlimited, the `/duplicate` alternate path, concurrency |
| `entitlementExhibitor.test.ts` | 3 | Boundary (25/26), status-counting (rejected/cancelled never count), concurrency (final slot race) |
| `entitlementVisitorStall.test.ts` | 6 | Visitor boundary (1000/1001), organizer-wide scope proof, failed/refunded exclusion, stall boundary (25/26), nested-array atomic rejection, existing stall-reservation-race compatibility |
| `entitlementTeam.test.ts` | 5 | Boundary (3/4, including the owner), pending-invite counting, removal frees a slot, RBAC independent of entitlement, concurrency (final slot race) |
| `entitlementDowngrade.test.ts` | 3 | Downgrade below limit (no effect), downgrade above limit (data preserved, writes blocked), admin visibility of the over-limit state |
| `entitlementSecurity.test.ts` | 6 | Cross-tenant isolation, IDOR, fake-field manipulation, RBAC on protected actions, admin operations unblocked, alternate-path regression audit |

**Full-suite result**: `npm run test` in `server/` — **82/82 pass** (45 from Phase 19A/19B/20B unmodified, still passing, + 37 new), ~15-20s. All test-created organizers/users/exhibitions/etc. are deleted in `after()` hooks via a shared `cleanupOrganizers()` helper; a genuine cleanup bug was found and fixed during this phase's own verification (Section 15) rather than left in place.

## 15. Live Integration Tests

Ran against fresh `npm run dev` instances (backend :4000, frontend :8080), after the full automated suite:

1. **Existing organizer's real subscription/usage**, read live: `org1.owner`'s Starter/trialing subscription correctly showed `exhibition 1/1`, `exhibitor 2/25` (matching the seed data's 2 confirmed-or-payment_pending participations), `visitor 9/1000`, `stall 8/25`, `team_member 7/3` — computed against the actual, unmodified seed dataset, not a test fixture.
2. **Existing paid-ticket flow unaffected**: a fresh live booking against `seed-tickettype-standard` produced `amount: 499, status: "created"` — byte-identical to pre-Phase-20C behavior.
3. **Organizer dashboard `PlanUsageCard`**, in a real browser: rendered correctly with 0 console errors, 0 failed requests, showing the exact same live numbers as (1) plus the correct destructive-alert copy.
4. **Platform admin Subscription tab**, in a real browser: showed the same organizer's usage with explicit `(over limit)` markers on the two over-capacity resources.
5. **A real, live-driven team-invite attempt** through the actual UI (not a curl call) was correctly rejected server-side (HTTP 409 in the browser's own network log) — found and fixed the `[object Object]` toast bug in the process (Section 11) — re-verified after the fix with a real, readable error message.
6. **Database consistency after all live testing**: the one live test-created user/booking was cleaned up; the seed organizer's team-member count was confirmed to remain exactly 7 (the blocked invite created nothing); final state matches the exact seed baseline (34 users, 1 organizer, 1 subscription, 13 payments — 12 seed + 1 pre-existing real-user booking unrelated to any phase's work, previously identified and left untouched in Phase 19B/20A/20B's own reports).

## 16. Database Changes

**None.** `npx prisma validate`: valid. `npx prisma migrate status`: 14 migrations, up to date — the identical count Phase 20B left it at. No `ALTER TABLE`, no new column, no new index, no new migration file. Every field this phase's five `assertCanX` functions needed (`Plan.eventLimit/exhibitorLimit/visitorLimit/stallLimit/teamMemberLimit`, `Subscription.status`) already existed from Phase 19A/20B.

## 17. Payment/Refund Compatibility

**Verified unmodified — file-modification-time checked, not merely asserted**: `server/prisma/schema.prisma`, `server/src/lib/paymentService.ts`, `refundService.ts`, `pricingEngine.ts`, `pricingVersion.ts`, `payments/{razorpay,mock,index}.ts`, and `subscriptionService.ts` all carry modification timestamps from before this phase's work window began (confirmed via a PowerShell `Get-ChildItem` scan filtered to files touched after Phase 20B's own report was written). Behaviorally confirmed by the full Phase 19A/19B/20B automated suite (45 tests) passing unmodified in the same run as this phase's 37 new tests, and by live re-verification of a fresh paid-ticket booking producing the exact same response shape Phase 19B's own report documented.

`routes/bookings.ts` was modified, but only to reorder *when* the existing `createOrderForPayment`/free-payment-create calls happen relative to a new entitlement check — the calls themselves, and everything downstream of them (webhook processing, mock-complete, refunds), are untouched. This is the one place this phase's own "unless a genuine technical dependency is discovered" carve-out was exercised, and it's documented in that file's own code comment plus Section 9 above.

## 18. Razorpay Status

**Unchanged: not configured, not touched.** No credentials were added, no provider code was modified, `getPaymentProvider()` continues to select the mock provider exactly as before. Nothing in this phase's scope required touching it.

## 19. Seed/Idempotency Status

`server/prisma/seed.ts` was not modified by this phase (Phase 20B already made it idempotent, including fixing a pre-existing Phase 19A-era bug that had prevented it from completing a fresh run at all). Re-verified here as part of this phase's own required checks: ran `npx tsx prisma/seed.ts` twice in direct succession — identical row counts both times (1 organizer, 1 subscription, 34 users, 13 payments) — no duplicates of any kind.

## 20. Known Limitations

- **`Subscription.trialEndsAt` remains an unused, oddly-named field** for the Starter trial specifically (Phase 20B already flagged this; Phase 20C resolves *how* trial consumption is detected — Section 6 — without renaming or repurposing the field itself, since doing so wasn't necessary for correctness and wasn't asked for).
- **The organizer Dashboard's "Create Exhibition" button is not itself disabled** when at the exhibition limit — the `PlanUsageCard` immediately above it shows a clear, prominent warning instead. The backend remains fully authoritative regardless of this button's state; a click-through still correctly fails with `PLAN_LIMIT_EXCEEDED`. Extending this to grey out every creation control on every page (Exhibitors, Stalls, Team, ticket booking) was judged out of proportion for this phase's actual requirement ("disable... where practical") given the number of pages involved; noted here rather than silently left incomplete.
- **No automatic detection of "trial should now be expired"** — Phase 20B already established that no subscription transition happens automatically anywhere in this codebase; Phase 20C's entitlement checks correctly *reject* an over-limit action but never themselves call `expireSubscription()`. Whether a blocked trial-consumption attempt should also proactively transition the subscription to `expired` is a product decision, not resolved here (the subscription staying `trialing` while blocked is itself a safe, correct state — it simply means "still trialing, and the one free exhibition has been used").

## 21. Deferred Items

Unchanged from Phase 20A/20B, per this phase's own explicit Section 3 scope rule — none were touched, none were found to have a genuine dependency requiring otherwise: Razorpay, subscription checkout/payment collection, recurring billing, invoices, GST, coupons/discounts, settlement, a financial ledger, marketplace commission, multi-currency, enterprise billing automation.

## 22. Final Status

**PASS**

All required limits are enforced, backend-authoritative, concurrency-safe, tenant-isolated, RBAC-correct, and IDOR-safe. The free-first-exhibition trial is correctly implemented without misusing `trialEndsAt`. Plan downgrades safely preserve existing data while blocking future over-limit writes. Payment/refund/pricing architecture is provably unmodified and its own test suite still passes unmodified. Seed remains idempotent. No schema changes were made. All 82 automated tests pass; both backend and frontend typecheck/build cleanly; live integration testing (including a real, browser-driven blocked action) confirms the same behavior outside the test suite. One real pre-existing frontend bug (structured-error-shape rendering) was found and fixed as a direct, necessary consequence of this phase's own live verification.
