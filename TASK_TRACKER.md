# ExhibitTix Task Tracker

**Updated:** 2026-11-22  
**Purpose:** Compact evidence-backed handoff for continuing work across chats.

## Latest verified repository state
- PR #928 (continuity documentation) merged to main: merge SHA `ea96572289bee42b8513e1928c946c516e98475d`.
- PR #927 (production-readiness/A9 evidence refresh) merged to main: merge SHA `43c29929379e3f7d106beffc04af4aead4ca75c2`.
- PR #921 (exhibitor CRM analytics reconciliation), #923 (standalone Event lead-capture boundary), and #924 (Exhibition analytics source reconciliation) are merged.
- Current main at the time of this handoff: `43c29929379e3f7d106beffc04af4aead4ca75c2`.
- PR #929 (A9 audit evidence refresh) is open, draft, and reports non-mergeable. It is not merged; it overlaps A9 documentation changes now on main and needs conflict-aware reconciliation before reuse.

## Continuity system
- `AI_WORKING_AGREEMENT.md`: investigate-first, root cause before fixing, exact-SHA verification, honest test reporting, and handoff requirements.
- `PROJECT_STATE.md`: concise project context and evidence limitations.
- This file (`TASK_TRACKER.md`): current handoff and next action.
- Documentation index links these continuity documents.

## A9 lifecycle audit
**Status: PARTIAL PASS — repository test coverage is strong; live release-candidate lifecycle is not verified.**

The audited base commit `3513a9b6dbfcac6b81613e5906f458cb37005a8d` had recorded CI and Browser E2E successes, but the GitHub workflow-runs lookup by commit returned no runs during this handoff; do not claim those checks were freshly reverified from that lookup. Existing audit evidence lists coverage for event publish, exhibitor/stall reservation, concurrency, ticket capacity/idempotency, QR/check-in, lead capture, and analytics reconciliation. Known gaps include standalone Event exhibitor participation, linked Exhibition checkout cutover, post-merge migration check being skipped, physical-camera verification, and deployed runtime/payment-provider verification.

## Go-live priorities
1. **P0 — Exhibitor Sales/Payments runtime failure:** Issue #925 is open. PR #922 diagnostics are merged. Required next step is to reproduce on the deployed environment, capture HTTP status, endpoint, server message, request ID, and timestamp, correlate with backend logs, then identify root cause and add focused regression tests. Runtime/deployment/log access was not available during this task; no root cause is claimed.
2. **P1 — A1 route-family security review:** Issue #926 remains open. Complete evidence ledger and focused tests for auth/session, payments/webhooks, uploads, ticket/orders/check-in, and remaining mutation surfaces. Keep deployment/penetration-test verification separate.
3. **P1 — Staging/production infrastructure:** Provision/verify staging, secrets, TLS/DNS, storage, migrations, monitoring/alerting, backup/restore, and rollback drills with actual environment evidence.
4. **P1 — Release-candidate verification:** Run cross-persona lifecycle on one deployed candidate; verify UI/API/DB and negative paths; complete responsive/accessibility/performance checks; then make an evidence-backed GO/NO-GO decision.

## This task's actions
- PR #928 checks: CI, Browser E2E, and Dependency Audit all completed successfully on exact head `9afe570139688db3b9d3a89d8ebe7e1dea1e603a`. Merged.
- PR #927 exact head `053e303842ac808150b35486f927980d88090fc5`: CI, Browser E2E, and Dependency Audit all completed successfully. Merged.
- PR #929 exact head `4e7cbf03a8d5c5827dbc55450dc3752e71781816`: CI, Browser E2E, and Dependency Audit all completed successfully, but PR metadata reported non-mergeable and draft. It remains open and must be reconciled against current main before merging.
- No application runtime, Codespace, physical device, staging, or production tests were performed in this task.

## Immediate next action
P0 issue #925: the deployed Sales/Payments runtime must be reproduced with diagnostic evidence. If environment/log access cannot be provided, continue repository-side investigation without guessing and clearly mark the live-runtime root cause as BLOCKED.

## Handoff fields for substantial work
- Objective/acceptance criteria
- Status: PASS / PARTIAL PASS / FAIL / BLOCKED / NOT TESTED
- Branch, PR, exact SHA
- Implemented vs verified
- Tests/checks actually run and results
- Gaps/risks
- Next single action
