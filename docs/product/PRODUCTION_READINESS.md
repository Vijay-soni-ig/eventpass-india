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
