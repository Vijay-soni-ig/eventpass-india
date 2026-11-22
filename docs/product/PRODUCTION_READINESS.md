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


## Readiness audit snapshot — 2026-11-22 (20:48 IST)

**Current main:** `a755930de886cdf1eef84f6d8a478c78756996f5` (PR #932 handoff merged).  
**Open PRs:** PR #929 is the only open PR; it is a draft and currently reports non-mergeable because its base is stale.  
**Release decision:** NO-GO. Main CI is green, but the main-commit Browser E2E job is still in progress; live-runtime and infrastructure gates remain unverified or blocked.

### Workstream status

| Workstream | Status | Implemented vs verified | Remaining estimate |
|---|---|---|---:|
| 1. Exhibitor Sales/Payments runtime diagnosis and fix | PARTIAL PASS | PR #922 diagnostic UI preserves/displays HTTP status, server message, and request ID. Issue #925 remains open; deployed failure, root cause, Owner/Admin/Staff permissions, and payment/refund correctness are not verified. | 6–14h |
| 2. Security and tenant isolation | PARTIAL PASS | Repository authorization/tenant regression coverage and security-audit findings exist. Issue #926 A1 route-family review remains open; deployed penetration testing, upload/storage policy, rate-limit topology, sensitive-data exposure, and audit-log verification are incomplete. | 4–8h |
| 3. Cross-persona lifecycle regression | PARTIAL PASS | Tests cover event publishing, Exhibition-backed participation, stall/ticket concurrency, QR/check-in rejection, lead isolation, and analytics source reconciliation (PR #924 merged). Standalone Event exhibitor participation and linked Exhibition checkout remain gaps; full deployed-candidate lifecycle is not verified. | 4–7h |
| 4. Staging/production config, migrations, monitoring, backup/recovery/rollback | BLOCKED | Repository workflows/runbooks exist, but staging/production, secrets, storage, target migration, monitoring/alert delivery, backup/restore and rollback drills lack environment evidence. Monitoring was previously reported NOT CONFIGURED; no current environment health/alert test is established. | 4–10h |
| 5. Responsive/accessibility/performance | PARTIAL PASS | CI quality/accessibility/performance-contract checks have passed on recent PR heads. Full mobile/tablet/desktop smoke testing, keyboard/screen-reader audit, and deployed Lighthouse/Core Web Vitals remain unverified. | 3–6h |
| 6. Final regression and release decision | BLOCKED | PR #932 exact-head CI, Browser E2E and Dependency Audit passed. Main CI run #45037246391 passed backend shards 1–4 and Quality; Migration upgrade path was skipped. Main Browser E2E run #45037246374 is currently in progress. Release-candidate lifecycle and live environment verification remain incomplete. | 3–5h |

**Total remaining:** 24–50 engineering/QA hours, approximately 4–8 focused working days at 6–7 hours/day. Estimates are planning ranges, not measured actuals.

### Current check evidence

- [PR #932](https://github.com/Vijay-soni-ig/eventpass-india/pull/932) merged the latest handoff documentation; merge commit/main SHA is `a755930de886cdf1eef84f6d8a478c78756996f5`.
- [Main CI run #45037246391](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45037246391): backend shards 1–4 and Quality passed; Migration upgrade path was **skipped**, not passed.
- [Main Browser E2E run #45037246374](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45037246374): **in progress**; public-event job is still running.
- PR #932 exact head `c868f48bbbad04a83307c9f00b8c412e4a8fa970`: CI, Browser E2E, and Dependency Audit passed; merged to main.
- [PR #929](https://github.com/Vijay-soni-ig/eventpass-india/pull/929), exact head `4e7cbf03a8d5c5827dbc55450dc3752e71781816`: CI, Browser E2E, and Dependency Audit passed. The PR remains **draft/open/non-mergeable** and targets stale base `eaf0ce04829f2c7e0ff06607a1ced0619ae33225`; it is not merged.

### Single highest-priority next action

Reproduce the Exhibitor Sales/Payments failure in the deployed environment and capture the actual HTTP status, backend message, request ID, endpoint, and timestamp; correlate the request ID with backend logs before making a root-cause fix. Runtime/browser/deployment/log access was not available in this audit, so no live behavior is claimed.
