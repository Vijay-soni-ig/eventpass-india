# ExhibitTix Task Tracker

**Updated:** 2026-11-22  
**Purpose:** Compact, evidence-backed handoff for continuing work.

## Latest verified repository state
- PR #928 (continuity documentation) merged.
- PR #927 (production-readiness/A9 evidence refresh) merged at `43c29929379e3f7d106beffc04af4aead4ca75c2`.
- PR #932 (handoff refresh) merged at `a755930de886cdf1eef84f6d8a478c78756996f5`; it changed `TASK_TRACKER.md` only.
- PRs #921 (exhibitor CRM analytics reconciliation), #923 (standalone Event lead-capture boundary), and #924 (Exhibition analytics source reconciliation) are merged.
- Current main: `a755930de886cdf1eef84f6d8a478c78756996f5`.
- PR #935 is the focused A9 regression: critical-path E2E now creates/publishes a fresh Exhibition and continues through exhibitor/stall/payment, visitor ticket/payment, QR/check-in, lead capture and analytics; it also checks the linked Event's public ticket endpoint. Code/test head `fe666cd695947888c23a30da5905a34557c88bf2` passed CI (backend shards 1–4, Quality, Migration upgrade), Browser E2E, and Dependency Audit. The PR remains open; documentation updates below will trigger new exact-head checks.
- PR #934's audit refresh is being superseded by #935, which now carries the audit update alongside the lifecycle test. PR #929 is closed as superseded.

## A9 lifecycle audit
**Status: PARTIAL PASS — repository test coverage is strong; standalone Event exhibitor participation and deployed release-candidate verification remain incomplete.**

### Target commit `3513a9b6dbfcac6b81613e5906f458cb37005a8d`
- [CI run 44988795628](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/44988795628): backend shards 1–4 and Quality passed; Migration upgrade path **skipped**.
- [Browser E2E run 44988795650](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/44988795650): `public-event` passed.
- The workflow-runs lookup by SHA returned no runs; evidence was verified directly from the existing run IDs/jobs.

### Current main evidence
- Prior main `eaf0ce0`: [CI run 45028054618](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45028054618) backend shards and Quality passed, migration skipped; [Browser E2E run 45028055582](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45028055582) passed.
- PR #932 exact head `c868f48bbbad04a83307c9f00b8c412e4a8fa970`: [CI run 45034552053](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45034552053) backend shards 1–4, Quality and Migration upgrade passed; [Browser E2E run 45034551990](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45034551990) and [Dependency Audit run 45034552052](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45034552052) passed. PR #932 merged at `a755930`; no separate post-merge workflow run was verified.

### Existing coverage and pending improvement
- Standalone Universal Event E2E: organizer creates/publishes, configures tickets, visitor reserves/orders, receives ticket/QR, organizer check-in and duplicate rejection, analytics assertions.
- Main still uses a seeded Exhibition in the critical path. PR #935 replaces that fixture dependency with a fresh live/public Exhibition creation and verifies the linked Event's public ticket endpoint before the same exhibitor/visitor lifecycle.
- Stall race: two exhibitors compete for one stall; winner/conflict and persisted state assertions.
- Ticket capacity/payment races: reservation capacity, idempotency, concurrent payment/issuance, expiry/compensation and lifecycle races.
- QR/check-in rejection matrix: wrong Event, disabled module, unpaid/refunded/cancelled, unpublished/archived, authorization and duplicate/concurrent scan.
- Lead capture: checked-in ticket, tenant/participation scope, duplicate/idempotency, data re-read and refund race.
- Analytics: #921 CRM reconciliation; #924 Exhibition source-row reconciliation; Universal Event source reconciliation.
- **PR #935** replaces the seeded Exhibition in the critical path with fresh organizer signup and live/public Exhibition creation, creates stall/ticket inventory, and continues the same lifecycle. This closes the creation-to-exhibitor integration test gap for the Exhibition-backed model if its exact-head checks pass. It does not implement standalone Event exhibitor participation.

### Remaining gaps
1. **Standalone Event exhibitor participation:** no independent Event-level exhibitor application/approval/participation and lead-capture model; issue #930.
2. **Linked Exhibition ticket checkout cutover:** linked Event ticket options are public, but purchase remains legacy Exhibition-backed; issue #931.
3. **Post-merge migration verification:** skipped on target and prior main `eaf0ce0`; exact-head migration checks passed on #921/#923/#924/#932.
4. **Physical scanner and live deployment:** real camera, staging/production lifecycle, live payment callbacks, backup/restore and rollback are not verified.

## Go-live priorities
1. **P0 #925 Sales/Payments runtime:** reproduce in deployed environment; capture endpoint, HTTP status, message, request ID, timestamp and server logs before root-cause changes. Runtime/log access is unavailable here.
2. **P1 #926 Security/tenant isolation:** finish route-family evidence and focused regressions; separate source-level findings from deployment/penetration testing.
3. **P1 Infrastructure:** staging, secrets, TLS/DNS, storage, monitoring, backup/restore, migrations and rollback.
4. **P1 Release-candidate:** execute one unified lifecycle on a deployed candidate and reconcile UI/API/database metrics before GO/NO-GO.

## This run
- Freshly verified target CI and Browser E2E; both required workflows are green.
- Identified the integrated Exhibition creation-to-exhibitor lifecycle test gap and created PR #935 with a focused E2E change.
- PR #935's prior code/test head `fe666cd695947888c23a30da5905a34557c88bf2` passed CI, Browser E2E, and Dependency Audit. Documentation corrections are now being added to the same branch, so the updated head must rerun checks. No local Codespace/browser or production verification was performed.
- PR #934 is superseded by #935; PR #929 is closed.

## Immediate next action
PR #935 remains the active focused regression. After documentation-only corrections, verify all required checks on the new exact head; merge only after they are green. Standalone Event exhibitor participation (#930) remains a separate feature requiring a reviewed schema/API/UI contract.

## Handoff fields
- Objective/acceptance criteria
- Status: PASS / PARTIAL PASS / FAIL / BLOCKED / NOT TESTED
- Branch, PR, exact SHA
- Implemented vs verified
- Tests/checks actually run and results
- Gaps/risks
- Next single action
