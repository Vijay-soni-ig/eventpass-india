# Production Readiness Checklist

This document is the launch gate for ExhibitTix. A checkbox is only considered complete when the linked evidence exists and is reproducible. Code-level gates can be completed in GitHub; infrastructure gates remain blocked until the real target environment is available.

## P0/P1 launch gates

| Gate | Required evidence | Owner/action | Status |
|---|---|---|---|
| Staging environment | Deployed staging URL, commit SHA, health/readiness result, smoke-test result | Deploy the current release candidate to staging and record the exact commit | BLOCKED: external hosting/deployment |
| Production object storage | Production bucket/container, private-by-default policy, upload/download smoke test, lifecycle/retention policy | Provision production object storage and verify application storage configuration | BLOCKED: external storage |
| Monitoring/alerting | Application error tracking, API/database health alerts, alert delivery test | Configure monitoring and prove an alert reaches the on-call channel | BLOCKED: external monitoring |
| Real payment-provider verification | Razorpay live/sandbox credentials, signed webhook test, duplicate/late webhook test, reconciliation evidence | Configure a non-mock Razorpay environment and execute payment/webhook verification | BLOCKED: provider access |
| Backup/restore drill | Backup artifact, restore timestamp, restored DB validation, recovery notes | Run a restore against a disposable target and record RPO/RTO evidence | BLOCKED: database infrastructure |
| Main branch protection | Protected `main`, required CI + Browser E2E + Dependency Audit checks | Configure repository rules and verify a merge is blocked when a required check fails | BLOCKED: GitHub admin setting |
| Production secrets management | Secrets stored outside source control, rotation procedure, no production secrets in logs | Configure target secret store and perform a non-destructive secret-readiness check | BLOCKED: target infrastructure |
| Database migration procedure | Forward migration, rollback/recovery procedure, backup-before-migration evidence | Validate migration procedure on staging | BLOCKED: staging |
| Rollback procedure | Known-good release SHA, rollback command/procedure, post-rollback smoke test | Perform rollback drill in staging | BLOCKED: staging |
| Error tracking | Captured application exception with request ID and actionable context | Trigger a controlled staging error and verify the event is captured | BLOCKED: monitoring |
| Security regression suite | CI green with authorization, tenant-isolation, rate-limit, upload and payment regressions | Keep targeted regression tests green on every release candidate | CODE READY: verify in CI |
| Critical E2E suite | CI Browser E2E green across critical organizer/exhibitor/visitor flows | Run the release candidate against the target environment | BLOCKED: staging |
| Accessibility/responsive verification | Automated accessibility checks plus documented mobile/desktop smoke pass | Run the release candidate against staging | BLOCKED: staging |
| Privacy/data retention review | Data inventory, retention periods, deletion/export procedure, operational sign-off | Complete product/legal review | BLOCKED: operational decision |
| Operational support process | On-call owner, incident severity rules, escalation path, support runbook | Define and test the support workflow | BLOCKED: operational decision |

## Repository-only verification

These checks can be verified without production credentials:

1. `main` contains the intended release candidate commit.
2. CI passes migration, seed, lint, frontend build, backend build and backend tests.
3. Browser E2E passes the critical cross-persona flows.
4. Dependency Audit passes without introducing an unreviewed high/critical vulnerability.
5. Authorization, tenant isolation, rate limiting, upload hardening and payment/webhook regression tests remain green.
6. No production secrets are committed to the repository.

## External dependency rule

If Razorpay, staging, object storage, monitoring, backup infrastructure, DNS, or another production dependency is unavailable, do not substitute a false green. Continue repository-only engineering and mark the live verification gate **BLOCKED** until real evidence exists.

For Razorpay specifically, mocks/provider abstractions may be used for independent engineering, but mock success never satisfies the live payment verification gate.

## Launch decision

Launch requires:

- no P0 security or production blocker;
- no unresolved critical authorization, tenant-isolation, data-integrity, payment, or recovery issue;
- all repository-only CI/E2E gates green;
- all infrastructure-dependent gates backed by real target-environment evidence;
- protected `main` with required quality checks.


## Readiness audit snapshot — 2026-11-22 (21:50 IST)

**Current main:** `a755930de886cdf1eef84f6d8a478c78756996f5` (PR #932 handoff merged).  
**Open PRs:** #933 (this documentation refresh, draft) and #935 (fresh Exhibition critical-path E2E, active checks). PR #929 was closed as superseded.  
**Release decision:** NO-GO. Repository evidence is improving, but live-runtime and production infrastructure gates remain unverified or blocked.

### Workstream status

| Workstream | Status | Implemented vs verified | Remaining estimate |
|---|---|---|---:|
| 1. Exhibitor Sales/Payments runtime diagnosis and fix | PARTIAL PASS / runtime BLOCKED | PR #922 diagnostic UI (HTTP status, server message, request ID) is merged. Live deployment reproduction, endpoint/status/message/request ID, log correlation, root cause, Owner/Admin/Staff matrix and payment/refund correctness remain unverified. Issue #925 is open. | 6–14h |
| 2. Security and tenant isolation | PARTIAL PASS | Repository authorization/tenant regression coverage and source audit findings exist. A1 route-family audit #926 remains open; staging penetration checks, upload/storage policy, production rate-limit topology, sensitive-data exposure and operational audit-log verification are not complete. | 4–8h |
| 3. Cross-persona lifecycle regression | PARTIAL PASS | Existing tests cover publishing, Exhibition-backed participation, stall/ticket concurrency, QR/check-in rejection, lead isolation and analytics reconciliation. PR #935 proposes replacing the seeded Exhibition in the critical path with fresh organizer signup and Exhibition creation/publication, linked Event ticket exposure, stall/ticket inventory, approval, mock payments, QR/check-in, lead capture and source-reconciled analytics. PR #935 is open/unmerged; its current exact head checks are in progress. Standalone Event exhibitor participation and linked Exhibition checkout cutover remain gaps. | 4–7h |
| 4. Staging/production config, migrations, monitoring, backup/recovery/rollback | BLOCKED | Workflows/runbooks exist, but staging/production, secrets, storage, target migration, monitoring/alert delivery, backup/restore and rollback drills lack real environment evidence. Monitoring was previously reported NOT CONFIGURED; no current health/alert test is established. | 4–10h |
| 5. Responsive/accessibility/performance | PARTIAL PASS | CI quality/accessibility/performance contract checks passed on recent PR heads. Full mobile/tablet/desktop smoke, keyboard/screen-reader audit and deployed Lighthouse/Core Web Vitals remain unverified. | 3–6h |
| 6. Final regression and release decision | BLOCKED | PR #932 exact-head CI, Browser E2E and Dependency Audit passed; post-merge main verification links are recorded in the prior snapshot. Current #935 exact-head CI and Browser E2E are pending. Unified deployed release-candidate regression and sign-off remain blocked by workstreams 1 and 4. | 3–5h |

**Total remaining:** 24–50 engineering/QA hours, approximately 4–8 focused working days at 6–7 hours/day. Estimates are planning ranges, not measured actuals.

### Current check evidence

- PR #932 merged current main at `a755930de886cdf1eef84f6d8a478c78756996f5`. Its exact head `c868f48bbbad04a83307c9f00b8c412e4a8fa970` passed CI, Browser E2E, and Dependency Audit; CI included Migration upgrade path PASS. Main post-merge results are referenced in the earlier snapshot and should not be assumed freshly re-queried by this run.
- PR #933 documentation branch exact head `85ba9fa0cff7febd0446cba020b3b7a410072e8a`: CI `45037812554`, Browser E2E `45037812567`, and Dependency Audit `45037812638` passed. This documentation branch is being refreshed; checks will need to rerun on the new head.
- PR #935 code/test head `fe666cd695947888c23a30da5905a34557c88bf2`: CI `45040997033`, Browser E2E `45040997086`, and Dependency Audit `45040997006` passed.
- PR #935 updated head `f68a77dbfa5d7144f2d37efdfb9811fb29c4df4a`: CI `45043242883`, Browser E2E `45043242889`, and Dependency Audit `45043242915` are **in progress**. The prior green head is not a substitute for checking the current head.
- [PR #935](https://github.com/Vijay-soni-ig/eventpass-india/pull/935) is open and unmerged. It uses mock payments; it does not verify live payment-provider behavior.
- [PR #932 exact-head CI](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45034552053), [Browser E2E](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45034551990), and [Dependency Audit](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45034552052) passed.

### Single highest-priority next action

P0 issue #925: reproduce the Exhibitor Sales/Payments failure in the deployed environment and capture actual endpoint, HTTP status, backend message, request ID, and timestamp; correlate with backend logs before a root-cause fix. Live runtime/deployment/log access is unavailable in this audit, so no live behavior or root cause is claimed.
