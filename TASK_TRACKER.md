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


## Latest verified update — 2026-11-23 01:42 IST (Universal Event analytics finance RBAC)
- Main is `c896292642d268ee717e3b74234c1708daa56b1c`, PR #942 merge. PR #942 exact-head CI [45061824906](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45061824906), Browser E2E [45061824843](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45061824843), and Dependency Audit [45061824855](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45061824855) succeeded. Main post-merge checks are NOT VERIFIED (combined status and post-merge runs returned no entries).
- New source-confirmed P1 on main: `server/src/routes/organizerEventAnalytics.ts` (blob `f160fc6330c632f2cc9b410294cb3f27ba0e9212`) gates the route on `event:view` but returns grossPaid, refundedAmount, netTicketRevenue, and ticket-type prices without `payment:view`. No exploit was executed.
- PR #943 `ef18ed072cf9c511265ea1f90cb18ce071ad3e65` gates financial fields/aggregates on `payment:view`, returns null to non-finance users, and skips financial aggregates. It is OPEN/DRAFT and changes only `organizerEventAnalytics.ts`; no focused regression tests are included in its changed-file list. Exact-head CI [45064044866](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45064044866), Browser E2E [45064044881](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45064044881), and Dependency Audit [45064044883](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45064044883) succeeded.
- Updated six-workstream classifications: Sales/Payments **BLOCKED** (6–14h); Security **FAIL** (5–9h, new finance-leak defect on main); Lifecycle **PARTIAL PASS** (4–7h); Infrastructure **BLOCKED** (4–10h); UX/accessibility/performance **PARTIAL PASS** (3–6h); final regression/release **BLOCKED** (3–5h). Total **25–51h**, approximately **4–8 focused working days at 6.5h/day**.
- Next single actionable repo task: add focused #943 regression tests for payment:view role matrix, non-finance null fields, cross-organizer denial, and aggregate-query skipping; review nullable field consumers; then verify exact-head workflows. P0 #925 still requires deployed runtime and correlated logs, unavailable to this audit.
- No app code changed; no PR merged. No live runtime/deployment/browser/logs/local test runner/payment provider/physical scanner was accessed.


## Readiness update — 2026-11-23 02:42 IST
- Main: `ef52beccf8683cb88c7e836e94b40e30552bc1f8` (PR #943 merged; Universal Event analytics financial access now gated by `payment:view`). Main CI run 45067835282: backend shards 1–4, public-event, quality PASS; migration upgrade SKIPPED. Main Browser E2E 45067835309 PASS. PR #943 Dependency Audit 45064044883 PASS on exact head before merge; post-merge audit not verified.
- PR #945 is OPEN/DRAFT and unmerged, head `0860f14166e62cfbe747a7816c89da82d66b801e`, based on older main `c896292642d268ee717e3b74234c1708daa56b1c` (current main ahead by 2 commits). Added Finance vs Marketing response regression test: Finance gets numeric financial fields/ticket prices; Marketing gets null. Exact-head CI 45067953355, Browser E2E 45067953419, Dependency Audit 45067953324 all PASS. No local test run. Missing cross-organizer 404 and aggregate-query-skipped assertions.
- Statuses/estimates: Sales/Payments BLOCKED 6–14h; Security PARTIAL PASS 4–8h; lifecycle PARTIAL PASS 4–7h; infrastructure BLOCKED 4–10h; UX/accessibility/performance PARTIAL PASS 3–6h; final regression/release BLOCKED 3–5h. Total 24–50h (~4–8 focused working days at 6–7h/day).
- Highest priority: reproduce Sales/Payments in deployed runtime and capture endpoint/status/message/request ID/timestamp plus correlated logs; blocked by lack of runtime/log access. Next repository task is update PR #945 to current main and review missing assertions. No application code changes, local test runner, deployment/runtime/browser/log access, live payments or scanner testing performed.


## Latest readiness update — 2026-11-23 03:42 IST
- Main SHA: `99d3c31c2f0d9b66101a1c8dd25b1f537b0b8597` (PR #946 docs merge). PR #946 exact-head CI [45070903254], Browser E2E [45070903270], Dependency Audit [45070903241] succeeded. CI migration upgrade, four backend shards, quality (backup-recovery script validation, performance budget, accessibility contract) passed. Main post-merge combined status is empty/not verified.
- New main-branch Host reflection finding: `server/src/routes/documents.ts` blob `833d28c91f7f421415470db016005bd2cec65cdb` builds private-document links using incoming `protocol` and `Host`. No exploit executed. PR #947 is open/draft, head `2c82146542f435bd3ef6ff892c7186b0e8bdd25b`, base c2ab5eb (one commit behind main). Fix uses same-origin relative URLs and adds malicious-Host test. Exact-head CI [45071914774], Browser E2E [45071914742], Dependency Audit [45071914726] all SUCCESS; CI migration upgrade, all four backend shards, and quality steps succeeded. PR is unmerged; local test not run.
- Workstream status/estimates: Sales/Payments **BLOCKED** (6–14h); Security/Tenant Isolation **FAIL** (5–9h; Host-reflection defect unresolved on main, PR #947 green but draft); Lifecycle **PARTIAL PASS** (4–7h; #930/#931 and deployed validation remain); Infrastructure **BLOCKED** (4–10h); UX/accessibility/performance **PARTIAL PASS** (3–6h); Final regression/release **BLOCKED** (3–5h). **Total 25–51h**, about **4–8 working days** at 6–7 focused hours/day.
- Implemented vs verified: #947 fix and regression are implemented in proposed PR; exact-head CI/E2E/Audit pass. Current-main source still reflects Host-derived absolute URL. Earlier merged QR token fix/tests (#938/#940) and financial RBAC (#943/#945) remain. Broader security route audit, tenant isolation, payment/refund and environment validation are not complete.
- Highest priority: review PR #947, update its base to current main, confirm relative-link and malicious-Host test, then mark ready and merge only with authorization. P0 #925 remains blocked until deployed runtime error/request ID/log evidence is available.
- No live runtime, deployment, server logs, manual browser, local test runner, payment provider, or scanner was accessed. No application code changes; readiness docs only. No PR merged.


## Latest tracker refresh — 2026-11-23 04:46 IST
- Main remains `99d3c31c2f0d9b66101a1c8dd25b1f537b0b8597`. No newer main commit was found. Main combined-status and PR-triggered workflow-run lookups returned no evidence; post-merge checks are **NOT VERIFIED**.
- PR #945 financial-permission regression is **MERGED** at merge commit `c2ab5eb5194a9fea13ca0d163aeb3913d82399f7` (head `0860f14166e62cfbe747a7816c89da82d66b801e`). Correct the older snapshot that called #945 draft/unmerged.
- PR #947 remains OPEN/DRAFT and unmerged at `2c82146542f435bd3ef6ff892c7186b0e8bdd25b`; base is `c2ab5eb5194a9fea13ca0d163aeb3913d82399f7`, one commit behind main (#946). CI [45071914774], Browser E2E [45071914742], Dependency Audit [45071914726] succeeded at exact PR head. The Host-header relative-link fix is implemented, but its new malicious-Host test directly covers document listing only; the shared helper also generates upload and restore links.
- PR #948 docs head checks completed green: CI [45076566817], Browser E2E [45076566722], Dependency Audit [45076566590]. Documentation checks do not change product readiness.
- Statuses/estimates remain Sales/Payments **BLOCKED** (6–14h); Security **FAIL** (5–9h; Host reflection on main pending #947); Lifecycle **PARTIAL PASS** (4–7h); Infrastructure **BLOCKED** (4–10h); UX/accessibility/performance **PARTIAL PASS** (3–6h); Final regression/release **BLOCKED** (3–5h). Total **25–51h**, about **4–8 focused working days**.
- Next action: refresh/review PR #947 against current main before merging. P0 #925 remains blocked pending deployed endpoint/status/message/request ID/timestamp and correlated server logs.
- No application code changed; no PR merged. No live runtime/deployment/browser/logs/local test runner/payment provider/scanner accessed.


## Latest tracker evidence refresh — 2026-11-23 07:42 IST
- Main `99d3c31c2f0d9b66101a1c8dd25b1f537b0b8597`: CI [45072107417] SUCCESS; Browser E2E [45072107423] SUCCESS; backend shards 1–4 and quality passed. Migration upgrade path **SKIPPED**. Production monitoring run [45096024642] is explicitly **NOT CONFIGURED**; diagnostic check success does not mean monitoring works. Health check skipped. Infrastructure stays BLOCKED.
- PR #947 exact head `2c82146542f435bd3ef6ff892c7186b0e8bdd25b`: CI [45071914774], Browser E2E [45071914742], Dependency Audit [45071914726] all SUCCESS (8 check runs). PR is OPEN/DRAFT and one commit behind main (base `c2ab5eb5194a9fea13ca0d163aeb3913d82399f7`). The Host-header finding remains on main until fix review/merge; shared URL helper warrants upload/restore regression coverage as well as document-list coverage.
- PR #948 exact head `7ba6b2c4d2fc4122bebda1bd3c622fd3b5ff197f`: CI [45082507022], public-event [45082507056], npm audit [45082507115] all SUCCESS (8 check runs). Documentation-only checks do not change product readiness.
- Status/estimates unchanged: Sales/Payments **BLOCKED** 6–14h; Security **FAIL** 5–9h; Lifecycle **PARTIAL PASS** 4–7h; Infrastructure **BLOCKED** 4–10h; UX/accessibility/performance **PARTIAL PASS** 3–6h; final regression/release **BLOCKED** 3–5h. Total **25–51h** (~4–8 focused workdays).
- Next action: update/review PR #947 against main; verify relative URL generation and malicious Host regression, add focused coverage for shared upload/restore link paths if needed; merge only with authorization. P0 #925 still needs actual deployed failure and correlated logs.
- No app code changed, no PR merged. Runtime/deployment/logs/browser/local tests/payment/scanner not accessed.


## Readiness tracker evidence refresh — 2026-11-23 08:49 IST

- **Main remains** `99d3c31c2f0d9b66101a1c8dd25b1f537b0b8597`. Main CI [45072107417](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45072107417) and Browser E2E [45072107423](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45072107423) succeeded. CI backend shards 1–4 and quality passed; **Migration upgrade path was SKIPPED**. Branch `main` is protected with required checks configured. This is repository CI, not target deployment/migration evidence.
- Monitoring diagnostic [45096024642](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45096024642) confirms **NOT CONFIGURED**; health job was skipped. Infrastructure remains **BLOCKED**.
- **PR #947** is OPEN/DRAFT/UNMERGED, head `2c82146542f435bd3ef6ff892c7186b0e8bdd25b`, based on `c2ab5eb5194a9fea13ca0d163aeb3913d82399f7`, one commit behind main. Exact-head CI [45071914774], Browser E2E [45071914742], and Dependency Audit [45071914726] succeeded; CI's migration upgrade, four backend shards and quality passed. The patch changes private download links to same-origin relative paths and adds a malicious-Host regression for document listing only. Because the helper is shared, upload/restore link paths need targeted regression coverage. Host reflection remains **FAIL on main** until reviewed and merged.
- **PR #948** prior head `2bf4e865232a030198c9a3831e671ddc76250e42` has exact-head CI [45099009042], Browser E2E [45099009036], and Dependency Audit [45099009064] all SUCCESS. This is documentation-only validation, not product readiness. A fresh documentation commit will trigger new checks; the old green runs do not apply to the new head.
- **Six workstreams unchanged:** Sales/Payments **BLOCKED** 6–14h (PR #922 diagnostics implemented; live failure/status/message/request ID/log correlation, role matrix and payment/refund reconciliation absent); Security **FAIL** 5–9h (Host-header issue on main; full A1/IDOR/BOLA/upload/rate-limit/sensitive-data/audit-log and target security validation incomplete); Lifecycle **PARTIAL PASS** 4–7h (#935/#940/#943/#945 repository coverage, but #930/#931 and deployed/provider/scanner validation remain); Infrastructure **BLOCKED** 4–10h; responsive/accessibility/performance **PARTIAL PASS** 3–6h (CI contracts only, no real-device/deployed Lighthouse/Core Web Vitals); final regression/release **BLOCKED** 3–5h.
- **Total remaining:** 25–51 engineering/QA hours, approximately 4–8 focused working days at 6–7h/day. Estimates are planning ranges; external access/waiting time excluded.
- **Single highest-priority next action:** unblock P0 #925 by obtaining deployed Sales/Payments runtime and correlated-log access, then capture endpoint, HTTP status, backend message, request ID, timestamp and role context before root-cause work. No diagnosis can be made speculatively. PR #947 remains the next repository security fix but must not be merged without explicit authorization.
- Evidence boundary: GitHub source, PR metadata/patches and Actions were inspected. No live runtime, deployment, backend logs, manual browser, local test runner, payment provider, scanner or target-environment migration/restore/rollback was accessed.
- No application code changed; readiness documentation only. No PR merged.


## Latest readiness tracker refresh — 2026-11-23 09:50 IST
- Main is `b4f275c4c34b676c8db194ee233f5702511169b9`; PR #948 documentation reconciliation is merged. PR #947 security fix is also **MERGED** at `fd4a58be2b5eac08df83cc8fdc21bb5c0dd03053`. Host-header reflection finding is resolved in main; Security status improves to **PARTIAL PASS** (full A1/security/environment audit still incomplete).
- PR #947 exact-head CI [45071914774], Browser E2E [45071914742], Dependency Audit [45071914726] all SUCCESS. The regression directly checks the document-list link remains relative under malicious Host. No local test run. PR #948 exact-head CI [45105462580], Browser E2E [45105462607], Dependency Audit [45105462598] all SUCCESS and #948 merged. Current-main post-merge checks are NOT VERIFIED (combined status empty; PR run lookup is PR-triggered only).
- Workstreams: Sales/Payments **BLOCKED** 6–14h; Security/Tenant Isolation **PARTIAL PASS** 4–8h; Lifecycle **PARTIAL PASS** 4–7h; Infrastructure **BLOCKED** 4–10h; UX/accessibility/performance **PARTIAL PASS** 3–6h; Final regression/release **BLOCKED** 3–5h. Total **24–50h**, ~4–8 focused workdays at 6–7h/day.
- Infrastructure evidence remains negative: monitoring diagnostic [45096024642] explicitly NOT CONFIGURED; main migration-upgrade run [45072107417] SKIPPED. Target deployment, monitoring alert delivery, storage, migration, backup/restore/recovery/rollback are not verified.
- Highest-priority action: unblock P0 #925 with deployed Sales/Payments runtime and correlated-log access; capture endpoint/status/message/request ID/timestamp and role context before root-cause work. No speculative diagnosis.
- No app code changed. No live runtime/deployment/logs/browser/local runner/payment/scanner/target migration or restore accessed.


## Readiness update — 2026-11-23 13:41 IST
- Main: `0385343040ab677213cd32421d574cfeda661a7b`. No open PRs at audit time.
- PR #950 cross-organizer Universal Event analytics isolation test merged at `7ccf30b8f47e5f051f8c23e4a9999ab086ee176d`. Exact-head CI [45119625169], Browser E2E [45119625205], Dependency Audit [45119625152] passed. Main post-merge CI [45132413014] and Browser E2E [45132413028] passed; current main SHA CI [45132459708] and Browser E2E [45132459767] also passed. Migration upgrade path on current-main CI was skipped.
- Workstreams: Sales/Payments **BLOCKED** (6–14h; #922 diagnostics merged, but runtime status/message/request ID/log correlation, role matrix, payment/refund correctness and root cause absent); Security **PARTIAL PASS** (4–8h; #938/#940 QR, #943/#945 finance RBAC, #947 Host-header fix and #950 cross-organizer analytics regression merged; full route audit, IDOR/BOLA, uploads, rate limits, sensitive data, audit logs and target validation incomplete); Lifecycle **PARTIAL PASS** (4–7h; core repository tests merged, #930/#931 and deployed/provider/scanner checks remain); Infrastructure **BLOCKED** (4–10h; migration upgrade skipped, monitoring not configured, deployment/secrets/storage/target migrations/alerts/backup restore/rollback unverified); UX/accessibility/performance **PARTIAL PASS** (3–6h; CI contracts only, real device/manual and deployed performance checks absent); Final regression/release **BLOCKED** (3–5h).
- Total remaining: **24–50h** (~4–8 focused working days at 6–7h/day), planning estimate only.
- Highest priority: unblock P0 #925 with deployed Sales/Payments runtime and correlated logs; capture endpoint, status, backend message, request ID, timestamp and role context before root-cause work. No speculation.
- Evidence boundary: GitHub only; no live runtime/deployment/logs/browser/local runner/payment/scanner/target migration/restore/rollback accessed. No application code changes.


## Readiness evidence refresh — 2026-11-23 14:43 IST
- Main remains `0385343040ab677213cd32421d574cfeda661a7b`. Current-main CI [45132459708](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45132459708) and Browser E2E [45132459767](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45132459767) pass. Main CI's Migration upgrade path is **SKIPPED**; the PR #951 CI migration-upgrade job passed in CI, which is not target-production migration evidence.
- PR #951 documentation head `942ddf4b64896a39788cf438771bb66e5e9d1c20` has all 3 exact-head workflows passed: CI [45136792330](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45136792330), Browser E2E [45136792312](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45136792312), Dependency Audit [45136792290](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45136792290). PR remains open/unmerged; no product readiness gate cleared by documentation checks.
- Issue [#925](https://github.com/Vijay-soni-ig/eventpass-india/issues/925) latest investigation comment [7095197556](https://github.com/Vijay-soni-ig/eventpass-india/issues/925#issuecomment-7095197556) records source review of `/payments`, `/:id/payments`, and `withExhibitorReadPermission`: shared permission resolution and active-membership revalidation under transaction/business-row lock precede StallBooking/Payment reads. The source review has **not** established the HTTP 500 root cause. Deployed endpoint/status/message/request ID/timestamp and correlated logs, role matrix, financial reconciliation, and root-cause regression fix remain outstanding.
- Statuses/estimates unchanged: Sales/Payments **BLOCKED** 6–14h; Security **PARTIAL PASS** 4–8h; Lifecycle **PARTIAL PASS** 4–7h; Infrastructure **BLOCKED** 4–10h; UX/accessibility/performance **PARTIAL PASS** 3–6h; final regression/release **BLOCKED** 3–5h. Total **24–50h**, approximately 4–9 working days at 6–7 focused hours/day (planning range; waiting time excluded).
- Highest priority remains P0 #925: obtain deployed runtime and correlated-log evidence, capture request context, then diagnose; do not guess a fix. No app code changed, no PR merged. No live runtime/deployment/logs/browser/local runner/payment/scanner/target migration/restore/rollback accessed.
