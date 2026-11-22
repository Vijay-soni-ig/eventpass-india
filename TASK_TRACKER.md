# ExhibitTix Task Tracker

**Updated:** 2026-11-22  
**Purpose:** Compact, evidence-backed handoff for continuing work.

## Latest verified repository state
- PR #928 (continuity documentation) merged.
- PR #927 (production-readiness/A9 evidence refresh) merged at `43c29929379e3f7d106beffc04af4aead4ca75c2`.
- PR #932 (handoff refresh) merged at `a755930de886cdf1eef84f6d8a478c78756996f5`; it changed `TASK_TRACKER.md` only.
- PRs #921 (exhibitor CRM analytics reconciliation), #923 (standalone Event lead-capture boundary), and #924 (Exhibition analytics source reconciliation) are merged.
- Current main: `a755930de886cdf1eef84f6d8a478c78756996f5`.
- PR #934 is the current A9 evidence reconciliation, based on latest main. It updates the lifecycle audit and this tracker with fresh target/current-main evidence and clarifies that the standalone Universal Event and Exhibition-backed exhibitor E2E scenarios are separate. Documentation-only. The latest branch checks are pending at the last check; refer to PR #934 for the current head and run links.
- PR #929 was stale and non-mergeable against its earlier base `eaf0ce0`; it is closed as superseded by PR #934.

## A9 lifecycle audit
**Status: PARTIAL PASS — automated coverage is strong, but a unified Event-to-exhibitor lifecycle and deployed release-candidate verification are not complete.**

### Target commit `3513a9b6dbfcac6b81613e5906f458cb37005a8d` — fresh job inspection
- [CI run 44988795628](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/44988795628): backend shards 1–4 and Quality passed. Migration upgrade path was **skipped**.
- [Browser E2E run 44988795650](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/44988795650): `public-event` passed.
- The workflow-runs lookup by SHA returned no runs; these results were verified directly from the existing run IDs/jobs, not inferred from the empty lookup.

### Current main evidence
- Prior code main `eaf0ce0`: [CI run 45028054618](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45028054618) backend shards and Quality passed, migration skipped; [Browser E2E run 45028055582](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45028055582) passed.
- PR #932 exact head `c868f48bbbad04a83307c9f00b8c412e4a8fa970`: [CI run 45034552053](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45034552053) backend shards 1–4, Quality, and Migration upgrade path passed; [Browser E2E run 45034551990](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45034551990) passed; [Dependency Audit run 45034552052](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45034552052) passed. PR #932 merged to main at `a755930`. No separate post-merge workflow status for `a755930` was verified in this run.

### A9 coverage verified from source/tests
- **Standalone Universal Event:** a separate E2E creates and publishes an Event, creates ticket type, visitor reserves/orders, receives ticket/QR, organizer checks in, duplicate check-in is rejected, and analytics are asserted.
- **Exhibition-backed exhibitor lifecycle:** a seeded Exhibition scenario covers visitor ticket booking, organizer QR lookup/check-in, confirmed exhibitor lead capture, and organizer/exhibitor analytics deltas. It is not the same Event-creation scenario.
- **Stall concurrency:** `phase26_8StallConcurrency.test.ts` tests two exhibitors competing for a stall and checks winner/conflict plus persisted state.
- **Ticket capacity/payment concurrency:** `p0TicketReservationConcurrency.test.ts` and `eventTicketReservationLifecycleConcurrency.test.ts` cover capacity, idempotency, payment/issuance races, expiry/compensation, and lifecycle race cases.
- **QR/check-in:** rejection matrix covers wrong Event, disabled module, unpaid/refunded/cancelled, unpublished/archived, unauthorized and duplicate/concurrent scans.
- **Lead capture:** tests cover checked-in-ticket validity, tenant/participation boundaries, duplicate/idempotent behavior, data re-read and refund race.
- **Analytics:** PR #921 reconciles exhibitor CRM metrics to lead/interaction/follow-up records; PR #924 reconciles Exhibition analytics to source rows; Universal Event analytics reconciliation is also present.

### Remaining gaps
1. **No unified end-to-end Event creation → exhibitor application/approval/stall participation → visitor purchase/check-in → lead → analytics flow.** The standalone Event-level exhibitor participation model is not implemented; current lead capture is Exhibition participation-backed. Issue [#930](https://github.com/Vijay-soni-ig/eventpass-india/issues/930) tracks the feature.
2. **Linked Exhibition ticket checkout cutover remains incomplete.** New linked-Exhibition ticket purchases remain on the legacy Exhibition-backed path; compatibility/cutover is tracked in [#931](https://github.com/Vijay-soni-ig/eventpass-india/issues/931).
3. **Migration upgrade on post-merge push:** skipped for the target commit and prior main `eaf0ce0`; exact PR-head migration checks passed on #921, #923, #924, and #932.
4. **Real-device camera, deployed staging/production lifecycle, and live payment-provider callbacks:** not verified.

## Go-live priorities
1. **P0 — Sales/Payments runtime issue #925:** reproduce in the deployed Owner/Admin/Staff environment; capture endpoint, HTTP status, error message, request ID, timestamp, and correlated server log before making a root-cause change. Runtime/log access remains unavailable here.
2. **P1 — Security/tenant isolation issue #926:** finish route-family evidence and focused regression testing; separate source-level findings from deployed/penetration testing.
3. **P1 — Staging/production infrastructure:** verify secrets, TLS/DNS, storage, monitoring/alerts, health checks, backup/restore, migrations and rollback with actual environment evidence.
4. **P1 — Release-candidate regression:** execute the unified cross-persona workflow on one deployed candidate and reconcile UI/API/database metrics before a GO/NO-GO decision.

## This run
- Freshly inspected target commit CI jobs and Browser E2E; both required workflows are green.
- Inspected current source/tests and confirmed the lifecycle scenarios are split across standalone Universal Event and Exhibition-backed flows.
- Created and updated PR #934 to reconcile the audit and tracker with current main/evidence. Exact-head CI is pending. No local test execution or live Codespace/browser/production verification was performed.
- PR #929 was closed as superseded; its exact-head checks were green, but it was not merged.

## Immediate next action
Continue monitoring PR #934 exact-head CI. Do not merge until all required checks pass. Feature implementation for standalone Event exhibitor participation (#930) should start from a reviewed schema/API/UI contract rather than an ad hoc code change.

## Handoff fields
- Objective/acceptance criteria
- Status: PASS / PARTIAL PASS / FAIL / BLOCKED / NOT TESTED
- Branch, PR, exact SHA
- Implemented vs verified
- Tests/checks actually run and results
- Gaps/risks
- Next single action
