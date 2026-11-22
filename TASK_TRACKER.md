# ExhibitTix Task Tracker

**Updated:** 2026-11-22 22:00 IST  
**Purpose:** Compact, evidence-backed handoff for continuing work.

## Latest repository state
- PR #935 **merged** at `5f154604a83a5bcde48fe1ed028737858524dc34`.
- PR #935 expanded the critical-path E2E to create/publish a fresh Exhibition and exercise the linked Event ticket endpoint, exhibitor/stall/payment, visitor ticket/payment, QR/check-in, lead capture, and analytics.
- PR #935 exact-head CI, Browser E2E, and Dependency Audit were green before merge. A separate post-merge workflow run for the merge SHA was **not verified**.
- PR #933 is stale/diverged from current main by one commit and is draft/non-mergeable. Its documentation changes are being reconciled onto a fresh branch; do not merge #933 directly.
- PR #929 is closed as superseded. PR #934 was superseded by #935.

## Lifecycle audit
**Status: PARTIAL PASS.** Repository test coverage is stronger after #935, but production/deployed lifecycle remains unverified.

Remaining lifecycle gaps:
1. Standalone Universal Event exhibitor participation and lead capture — issue #930.
2. Exhibition-linked ticket checkout migration from legacy Exhibition flow to Universal Event lifecycle — issue #931.
3. Physical scanner, live payment callbacks, staging/production lifecycle, backup/restore, and rollback are not verified.

## Go-live priorities
1. **P0 #925 Sales/Payments runtime:** Reproduce in deployed environment. Capture endpoint, HTTP status, server message, request ID, timestamp, and correlated logs before any root-cause fix. Runtime/log access is currently unavailable; do not guess.
2. **P1 #926 Security/tenant isolation:** Finish route-family evidence ledger and focused regression tests. Source review alone is not a VERIFIED result.
3. **P1 Infrastructure:** Verify staging, secrets, TLS/DNS, storage, monitoring/alert delivery, backup/restore, migration, and rollback with real environment evidence.
4. **P1 Release candidate:** Run unified cross-persona lifecycle against a deployed candidate; reconcile UI/API/DB; complete mobile, accessibility, performance and negative-path QA; then GO/NO-GO.
5. **A9 gaps #930/#931:** Scope and implement after P0/P1 blockers or when launch scope explicitly prioritizes them.

## A1 security audit (#926)
- Initial selected source review covered app/auth/rate-limit, selected auth/session, payments/webhooks, documents, bookings and events sections.
- Initial observations: login enumeration resistance; duplicate-signup response may expose account existence; payment ownership/state checks; webhook signature/idempotency/refund checks; documents permission checks and private downloads; Event organizer scoping.
- These are **source observations only**. Selected sections, not full route coverage; no security tests run at checkpoint; no confirmed exploit; no route family VERIFIED; no PR created.
- Continue reviewing remaining handler sections and tests, especially reservations/check-in and organizer/exhibitor mutations. Convert confirmed gaps into focused tests/fixes; report evidence and limitations.

## P0 runtime blocker (#925)
- PR #922 diagnostics are merged (request ID, HTTP status, server message).
- Required: live reproduction plus endpoint/status/message/request ID/timestamp and server log correlation. No runtime root cause is established.

## Launch evidence rules
- Repository CI green is not a deployment verification.
- Mock payment is not live-provider verification.
- Skipped migration check is NOT PASS.
- Do not close readiness issues without reproducible evidence.
- Production readiness remains **NO-GO** while critical runtime and infrastructure gates are blocked.

## Immediate next action
Continue the A1 (#926) source audit and build a handler-level evidence matrix, then add focused authorization/tenant regression tests for confirmed gaps. Exact-head CI/E2E/dependency checks are required for any resulting PR. In parallel, #925 remains blocked pending owner/runtime log evidence.

## Handoff format
Objective/acceptance criteria • status (PASS/PARTIAL PASS/FAIL/BLOCKED/NOT TESTED) • branch/PR/SHA • implemented vs verified • tests actually run • risks/gaps • next single action.


## Latest verified update — 2026-11-22 23:43 IST
- Main SHA: `2ba3cd0c427ea63a615ca1050dd17f4ac9aecde0` (PR #937 merge; PR #938 base matches). Main post-merge CI/status lookup returned empty; not verified.
- PR #938 is OPEN/DRAFT/UNMERGED at head `3e587290171894010d84032f03f9bde35d62cc67`, source file only. CI, Browser E2E, and Dependency Audit exact-head workflows are SUCCESS.
- Confirmed code defect on main: QR payload validator ignores incoming token and recomputes expected HMAC from ticket code/id. PR #938 changes check to hash supplied raw token and compare to stored hash.
- Test gap: PR #938 adds no focused QR-token test. Existing check-in matrix does not include altered/arbitrary token rejection. No exploit executed. Security workstream is **FAIL** until fix/test/merge verified; overall production **NO-GO**.
- Updated readiness classification: Sales/Payments **BLOCKED** (6–14h); Security **FAIL** (5–9h); lifecycle **PARTIAL PASS** (4–8h); infrastructure **BLOCKED** (4–10h); UX/accessibility/performance **PARTIAL PASS** (3–6h); final release **BLOCKED** (3–5h). Total 25–52h (~4–9 focused working days).
- Highest priority actionable repository task: add focused QR token valid/tampered/empty/malformed tests to #938 and verify exact-head checks. P0 #925 still needs runtime/log access for diagnosis.
- Evidence: [PR #938](https://github.com/Vijay-soni-ig/eventpass-india/pull/938), [CI](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45052836293), [Browser E2E](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45052836267), [Dependency Audit](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45052836703).
- No application code changed in this readiness update; no PR was merged.

## Latest verified update — 2026-11-23 (PR #938/#939 merged; #940 test follow-up)
- PR #938 QR token validation fix merged at `6e6ef035565128aeaf874c596d8b5a59132877cd`. Exact-head CI, Browser E2E, Dependency Audit all passed before merge. Dedicated token-tampering regression tests were not included in #938.
- PR #939 readiness snapshot merged at `1a3dca777f54bc8c7c63c5c079be0d9ef78a3de1`. Its snapshot is historical and requires this reconciliation because it was written before #938/#939 merge results.
- PR #940 focused regression tests are MERGED at `975b1ef4ded2afa6086a12b23aeed102d865b03f`. Exact-head CI, Browser E2E and Dependency Audit passed. Altered/empty tokens rejected; ticket stays ACTIVE and no check-in record is created.
- Source review confirmed attendee-limit semantics mismatch: UI says maximum per attendee, reservation endpoint aggregates by purchaser `userId`. Treat as P2 business-rule decision; do not change until policy is confirmed.
- Launch remains NO-GO. P0 #925 runtime failure needs live endpoint/status/message/requestId/timestamp plus correlated logs; no root cause established. A1 route audit remains incomplete. Staging/monitoring/storage/backups/restore/rollback remain blocked without target environment access.
- Automation status is not verified as changed; do not assume the QR watch was repurposed to monitor #940.


## Latest verified update — 2026-11-23 00:41 IST (PR #940 merged; QR defect regression covered)
- Current `main` SHA: `975b1ef4ded2afa6086a12b23aeed102d865b03f`, merge commit for PR #940. Compared with `1a3dca777f54bc8c7c63c5c079be0d9ef78a3de1`, main is ahead by exactly one commit (#940).
- PR #938 QR token validation fix is merged at `6e6ef035565128aeaf874c596d8b5a59132877cd`. Main source now hashes the supplied QR token and compares it with the stored hash using length guard + `timingSafeEqual`; source was fetched from main and inspected.
- PR #940 regression test is merged on main. It rejects altered and empty QR token segments (404), asserts ticket remains ACTIVE, and asserts no check-in row is created. Existing matrix still covers valid QR, duplicate and concurrent scans, wrong Event, module disabled, unpaid/refund-pending, cancelled/refunded, unpublished/archived, and unauthorized scanner.
- Exact-head checks for PR #940 head `51b0a08d5a36642d6de85919d222570b0ccfde58`: CI run 45056802518 SUCCESS, Browser E2E 45056802540 SUCCESS, Dependency Audit 45056802576 SUCCESS. PR #938 exact-head CI/E2E/Audit also passed. Main post-merge status lookup is empty; post-merge checks are NOT VERIFIED.
- Security classification improved from FAIL to **PARTIAL PASS**: the QR defect fix and focused altered/empty-token regression are merged and exact-head checks green; full A1 route-family review and environment security validation remain incomplete. Lifecycle remains **PARTIAL PASS**.
- Current remaining estimates: Sales/Payments BLOCKED 6–14h; Security PARTIAL PASS 4–8h; Lifecycle PARTIAL PASS 4–7h; Infrastructure BLOCKED 4–10h; UX/accessibility/performance PARTIAL PASS 3–6h; Final regression/release BLOCKED 3–5h. Total **24–50h**, about **4–8 working days at ~6.5 focused hours/day** (planning estimates).
- PR #941 has been refreshed with PR #940 merged and green exact-head evidence. Prior documentation-update head `35792795ef08f42090a4ba123d07f2cb571401da` had CI/E2E/Audit in progress; subsequent documentation commits changed the head, and latest-head check results were not yet returned. PR remains draft and unmerged.
- P0 #925 remains the single highest priority: obtain deployed runtime access and capture endpoint, HTTP status, backend message, request ID, timestamp, and correlated logs before root-cause work. Live runtime/log access is not available to this audit.
- No local tests, deployed runtime, browser session, live payments, or post-merge checks were run/claimed.
