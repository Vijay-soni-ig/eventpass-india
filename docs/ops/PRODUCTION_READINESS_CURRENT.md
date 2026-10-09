# ExhibitTix Production Readiness Current State

**Audit baseline:** `be8f1b5e5ab7761f7846dc2b92c5774745311147` (`main`, verified 2026-10-09)

This document records repository evidence only. It must not be interpreted as proof that external production infrastructure is provisioned or verified.

## Gate status

| Gate | Repository evidence | External evidence still required | Status |
|---|---|---|---|
| P1-1 Staging | Staging deployment contract and smoke workflow exist | Hosted staging API/frontend, database, object storage, HTTPS/DNS, secrets, successful smoke run | BLOCKED |
| P1-2 Production object storage | Production S3-compatible configuration/tests and readiness documentation exist | Real production bucket, IAM credentials, encryption policy, lifecycle/backup configuration, upload/read verification | BLOCKED |
| P1-3 Monitoring and alerting | Production health-check workflow exists and safely skips when `PRODUCTION_API_URL` is absent | Real production target, repository variable, failure notifications, external uptime/observability, alert delivery evidence | BLOCKED |
| P1-4 Razorpay | Provider contract, credential validation and sandbox/production verification procedure exist | Razorpay test/production credentials and successful credentialed payment, webhook and refund verification | BLOCKED |
| P1-5 Backup/restore | Backup/restore runbook and secret-safe contract verification exist | Real database/object-storage backup, isolated restore drill, integrity verification and evidence | BLOCKED |
| P1-6 GitHub main protection | Branch protection was enabled on 2026-10-03; PR #521 merged after all 8 required checks passed on its exact head. Required checks: quality, backend test shards 1–4, public-event, npm audit, Migration upgrade path. Force-push/deletion disabled; administrators can override and required reviewers are not configured. | Re-check settings periodically; decide whether production governance should also require independent review and prevent administrator bypass. | PASS (required checks enforced; governance hardening remains) |

## Verified repository state

- `main` currently points to `be8f1b5e5ab7761f7846dc2b92c5774745311147`.
- PR #521 (`test(e2e): cover organizer settings interactions`) merged at `be8f1b5e5ab7761f7846dc2b92c5774745311147` after all 8 required checks passed on exact PR head `a22f600ae0fe98d53c3b38e0d0427c97c8c7d777`.
- Required checks include quality, backend test shards 1–4, public-event Browser E2E, npm audit, and Migration upgrade path.
- The repository contains CI, dependency-audit, Browser E2E, production-monitoring and staging-smoke workflows.
- Branch protection was enabled on 2026-10-03 and has been exercised by a subsequent merged PR. Administrators can override the checks; independent review is not required.

## Main-branch protection policy

The repository currently requires the published CI, Browser E2E, Dependency Audit, and migration-upgrade checks before merge; force pushes and branch deletion are disabled. Administrators can override protections and independent reviews are not required. For stronger production governance, consider requiring at least one independent review and preventing routine administrator bypass, while preserving a documented emergency procedure.

## Production gate policy

A repository-side change is not considered production-ready merely because CI is green. External gates require real deployment, credentials, infrastructure or repository-administration evidence.

Do not mark a blocked gate complete without evidence from the real environment.

## Next actions

1. Provision and verify real staging: isolated PostgreSQL, S3-compatible storage, HTTPS/DNS, secrets, health/readiness smoke test, and Browser E2E.
2. Verify production object storage and private/public access policy against the real bucket.
3. Configure production monitoring and alert delivery, then exercise a safe synthetic failure.
4. Obtain Razorpay test credentials and perform credentialed checkout, webhook replay, failure, refund, and reconciliation verification.
5. Perform an isolated database/object-storage backup-restore drill and record achieved RPO/RTO.
6. Consider independent review and administrator-bypass policy improvements for branch protection.
7. Run the final production-readiness audit only after the external gates have evidence.