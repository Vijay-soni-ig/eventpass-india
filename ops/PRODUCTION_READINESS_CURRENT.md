# ExhibitTix Production Readiness Current State

**Audit baseline:** `202e5dd427239d018672dc92cb6e17823ebffaf8` (`main`)

This document records repository evidence only. It must not be interpreted as proof that external production infrastructure is provisioned or verified.

## Gate status

| Gate | Repository evidence | External evidence still required | Status |
|---|---|---|---|
| P1-1 Staging | Staging deployment contract and smoke workflow exist | Hosted staging API/frontend, database, object storage, HTTPS/DNS, secrets, successful smoke run | BLOCKED |
| P1-2 Production object storage | Production S3-compatible configuration/tests and readiness documentation exist | Real production bucket, IAM credentials, encryption policy, lifecycle/backup configuration, upload/read verification | BLOCKED |
| P1-3 Monitoring and alerting | Production health-check workflow exists and safely skips when `PRODUCTION_API_URL` is absent | Real production target, repository variable, failure notifications, external uptime/observability, alert delivery evidence | BLOCKED |
| P1-4 Razorpay | Provider contract, credential validation and sandbox/production verification procedure exist | Razorpay test/production credentials and successful credentialed payment, webhook and refund verification | BLOCKED |
| P1-5 Backup/restore | Backup/restore runbook and secret-safe contract verification exist | Real database/object-storage backup, isolated restore drill, integrity verification and evidence | BLOCKED |
| P1-6 GitHub main protection | Current GitHub branch reports `protected=false` and required status-check enforcement `off` | Repository-admin configuration requiring PR review/checks and preventing unverified direct changes to `main` | BLOCKED |

## Verified repository state

- `main` currently points to `202e5dd427239d018672dc92cb6e17823ebffaf8`.
- PR #169 was merged into `main` after CI #606, Browser E2E #352 and Dependency Audit #201 all passed on the exact PR head `845107be7c79742121e243266565dd5b91acc292`.
- PR #169 added production HTTP security regression coverage for API security headers, request IDs and explicit CORS allowlisting/rejection.
- A2 tenant isolation is recorded as closed for the repository-verifiable scope after PRs #159-#167.
- The connected GitHub integration returned no pull-request workflow runs for the post-merge `main` commit, so this tracker does not treat merge-commit workflow evidence as available.
- The repository contains CI, dependency-audit, Browser E2E, production-monitoring and staging-smoke workflows.
- Branch protection is currently disabled and requires repository-administration access to configure.

## Required main-branch protection policy

Configure `main` so that:

1. Direct pushes are not permitted for normal development.
2. Pull requests are required before merging.
3. CI, Browser E2E and Dependency Audit must pass before merge.
4. Conversations must be resolved before merge where supported.
5. Force pushes are blocked.
6. Branch deletion is blocked.
7. Administrators should follow the same merge protections unless an explicit emergency procedure is documented.
8. Do not enable a rule that requires checks that the repository does not actually publish.

## Production gate policy

A repository-side change is not considered production-ready merely because CI is green. External gates require real deployment, credentials, infrastructure or repository-administration evidence.

Do not mark a blocked gate complete without evidence from the real environment.

## Next actions

1. Complete remaining repository-verifiable security hardening, especially A1 endpoint inventory, abuse/rate-limit review and upload hardening.
2. Verify any remaining justified Universal Event 001E read-cutover gaps without forcing incompatible Exhibition rewrites.
3. Configure and verify `main` branch protection in GitHub repository settings when administration access is available.
4. Provision and verify real staging.
5. Provision production object storage.
6. Configure production monitoring and alert delivery.
7. Obtain Razorpay credentials and perform credentialed sandbox verification.
8. Perform the isolated backup/restore drill.
9. Run the final cross-persona production-readiness E2E and final audit.
