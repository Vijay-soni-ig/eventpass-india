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


## Readiness audit snapshot — 2026-11-22

**Current main:** `eaf0ce04829f2c7e0ff06607a1ced0619ae33225` (PR #924 merged)  
**Open PRs:** none found in the latest repository query.  
**Release decision:** NO-GO. Repository checks are healthy, but critical live-runtime and infrastructure gates remain unverified/blocked.

### Workstream status

| Workstream | Status | Implemented vs verified | Remaining estimate |
|---|---|---|---:|
| 1. Exhibitor Sales/Payments runtime diagnosis and fix | PARTIAL PASS | PR #922 diagnostics (HTTP status, server message, request ID) are merged. No deployed runtime failure has been captured; root cause, Owner/Admin/Staff permissions, and payment/refund correctness remain unverified. Issue [#925](https://github.com/Vijay-soni-ig/eventpass-india/issues/925) is open. | 6–14h |
| 2. Security and tenant isolation | PARTIAL PASS | Repository contains authorization/tenant regression coverage and a P0 security audit with PASS findings in reviewed high-risk areas. The A1 route-family review [#926](https://github.com/Vijay-soni-ig/eventpass-india/issues/926) remains open; staging/production security tests, full penetration testing, production upload/storage policy, rate-limit topology, sensitive-data/audit-log verification are not complete. | 4–8h |
| 3. Cross-persona lifecycle regression | PARTIAL PASS | Existing tests cover event publish, Exhibition-backed participation, stall/ticket concurrency, QR/check-in rejection, lead isolation, and analytics. PR #924 adds Exhibition analytics source-row reconciliation and is merged. Standalone Event exhibitor participation/lead capture and linked Exhibition checkout migration remain known gaps; no full deployed candidate lifecycle run was verified. | 4–7h |
| 4. Staging/production config, migrations, monitoring, backup/recovery/rollback | BLOCKED | Workflows and runbooks exist, but real staging/production deployment, secrets, object storage, migration execution on target, monitoring alert delivery, backup/restore drill, and rollback drill have no current environment evidence. Latest scheduled monitoring run [44998826141](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/44998826141) is named **NOT CONFIGURED**; it made no health request. | 4–10h |
| 5. Responsive/accessibility/performance | PARTIAL PASS | CI quality, accessibility contract, and performance-budget checks passed on PR #924. Full mobile/tablet/desktop smoke testing, keyboard/screen-reader audit, and real Lighthouse/Core Web Vitals measurements are not verified on a deployed candidate. | 3–6h |
| 6. Final regression and release decision | BLOCKED | PR-head checks are green; a release-candidate full regression, environment-based lifecycle verification, and launch sign-off are still blocked by workstreams 1 and 4. | 3–5h |

**Total remaining:** 24–50 engineering/QA hours, approximately 4–8 focused working days at 6–7 hours/day. Estimates are planning ranges, not measured actuals.

### Current check evidence

- [PR #924](https://github.com/Vijay-soni-ig/eventpass-india/pull/924) merged analytics reconciliation at current main. Exact PR head `d8d28af134451d7970ebad11509e50d953693114`: all 8 checks passed (backend shards 1–4, Quality, Browser E2E, Dependency Audit, Migration upgrade path).
- [Main CI run 45028054618](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45028054618): backend shards 1–4 and Quality passed; Migration upgrade path was **skipped**, not passed.
- [Main Browser E2E run 45028055582](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45028055582): passed.
- Dependency Audit passed on the exact PR #924 head; a separate post-merge audit run was not present in the inspected main check set.

### Single highest-priority next action

Reproduce the Exhibitor Sales/Payments failure in the deployed environment and capture the actual HTTP status, backend message, request ID, endpoint, and timestamp; correlate the request ID with backend logs before making a root-cause fix. Runtime/browser/deployment/log access was not available in this audit, so no live behavior is claimed.


## Readiness audit snapshot — 2026-11-22 22:00 IST (supersedes earlier snapshot above)

**Current main merge SHA:** `5f154604a83a5bcde48fe1ed028737858524dc34` (PR #935 merged).  
**Release decision:** **NO-GO** — critical runtime and external infrastructure gates remain unverified/blocked.

### Updated lifecycle status
- PR #935 is merged. It removes the seeded Exhibition dependency from the critical path by creating/publishing a fresh Exhibition, verifying linked Event ticket exposure, and continuing through exhibitor/stall/payment, visitor ticket/payment, QR/check-in, lead capture and analytics.
- Exact-head CI, Browser E2E and Dependency Audit were green before merge. **Separate post-merge checks for the merge SHA were not verified.**
- Lifecycle coverage is still PARTIAL PASS: standalone Universal Event exhibitor participation (#930) and linked Exhibition checkout cutover (#931) remain unimplemented gaps; physical scanner/live deployment/payment provider are not verified.

### Updated next priorities
1. **P0 #925:** Reproduce Sales/Payments runtime failure and capture endpoint/status/message/request ID/timestamp plus correlated backend logs. No root cause until evidence. BLOCKED without runtime/log access.
2. **P1 #926:** Complete A1 route-family security/tenant audit and focused tests. Initial selected source review is not full coverage; no security test run and no route family VERIFIED at this checkpoint.
3. **P1 Infrastructure:** Staging, secrets, TLS/DNS, storage, monitoring/alert delivery, migrations, backup/restore and rollback drills require target-environment evidence.
4. **P1 Release candidate:** Deployed unified lifecycle, data reconciliation, responsive/accessibility/performance and release GO/NO-GO.
5. **A9 product gaps:** Scope and prioritize #930 standalone Event exhibitor participation and #931 linked Exhibition checkout migration after blockers.

### Evidence limitations
GitHub merge and pre-merge check evidence is repository-level only. No deployed runtime, production/staging, live payment, physical scanner, restore drill, or rollback verification is claimed. The previous snapshot's statuses are historical and should not be treated as current after PR #935.
