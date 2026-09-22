# ExhibitTix Production Readiness Gates

This checklist defines the evidence required before ExhibitTix is treated as production-ready. A code change can be merged independently, but production launch is blocked until every applicable gate below has evidence.

## 1. Repository governance

- [ ] `main` branch protection is enabled.
- [ ] Pull requests require the CI quality check.
- [ ] Pull requests require Browser E2E.
- [ ] Dependency/security audit is required before merge.
- [ ] Direct pushes to `main` are disabled.

**Evidence:** GitHub branch protection/ruleset configuration and a successful protected-branch PR.

## 2. Application environment

- [ ] A real staging environment is deployed from a known commit.
- [ ] Production configuration is separated from development/test configuration.
- [ ] Required secrets are stored in a secret manager, not source control.
- [ ] HTTPS/TLS is enabled for all public application endpoints.
- [ ] Health/readiness checks are available and tested.

**Evidence:** staging URL, deployment commit SHA, environment configuration record, and health-check result.

## 3. Object storage

- [ ] Production object storage exists and is reachable by the application.
- [ ] Upload, read, replacement, and deletion flows are verified in staging.
- [ ] Bucket/container access is private by default where appropriate.
- [ ] Public delivery uses controlled URLs or an approved CDN policy.
- [ ] Storage credentials are scoped to the minimum required permissions.

**Evidence:** successful staging upload/read/delete drill and storage access policy.

## 4. Payments

- [ ] A payment provider is selected and documented.
- [ ] Sandbox credentials and webhook verification are tested before production enablement.
- [ ] Idempotency, payment status reconciliation, and failure handling are verified.
- [ ] Refund handling is verified.
- [ ] Production credentials are added only after the merchant account is approved.

If Razorpay production access is not available, this is a **launch blocker**, not a reason to fabricate production verification. Independent non-payment work may continue.

**Evidence:** sandbox transaction, verified webhook, reconciliation result, refund result, and later production transaction proof.

## 5. Monitoring and alerting

- [ ] Application errors are captured without leaking secrets or sensitive payloads.
- [ ] Availability/health monitoring is enabled.
- [ ] Database/storage/payment failures generate actionable alerts.
- [ ] Logs have retention appropriate to the operating environment.
- [ ] An owner and escalation path exist for production incidents.

**Evidence:** test alert, dashboard/monitor configuration, and incident escalation contact.

## 6. Backup and recovery

- [ ] Database backups are enabled.
- [ ] Object-storage backup/retention policy is documented where required.
- [ ] Restore procedure is documented.
- [ ] A restore drill has been completed against a non-production target.
- [ ] Recovery point and recovery time targets are recorded.

**Evidence:** dated restore-drill result including source backup, target, restored record/file verification, and measured duration.

## 7. Security and access

- [ ] Production secrets are rotated and are not present in Git history.
- [ ] Authentication/session configuration uses production-safe secrets and lifetimes.
- [ ] RBAC and tenant isolation have automated regression coverage.
- [ ] Dependency audit has no unaccepted high/critical findings.
- [ ] Production error responses do not expose stack traces or internal exception details.

**Evidence:** security review, automated test results, dependency audit, and configuration review.

## 8. DNS and launch controls

- [ ] Production DNS points to the intended deployment.
- [ ] TLS certificate covers the production hostname.
- [ ] Canonical/redirect behavior is verified.
- [ ] Robots/indexing behavior is intentionally configured for launch.
- [ ] A rollback procedure is tested or otherwise operationally verified.

**Evidence:** DNS/TLS check, deployment verification, and rollback drill/result.

## Launch decision

ExhibitTix should not be declared production-ready based only on green CI/E2E. The launch decision requires:

1. All applicable repository and application gates above to have evidence.
2. All external dependencies to be provisioned and verified.
3. No open critical security issue.
4. A known deployable commit SHA and rollback path.

When an external dependency is unavailable, record it explicitly as a blocker and continue independent engineering work rather than marking the gate complete.
