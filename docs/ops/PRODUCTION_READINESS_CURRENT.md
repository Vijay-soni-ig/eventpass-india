# ExhibitTix Production Readiness Current State

**Audit baseline:** `bce70ef510e47e1e1f797561cfc865b9f70fe046` (`main`)

This document records repository evidence only. It must not be interpreted as proof that external production infrastructure is provisioned or verified.

## Gate status

| Gate | Repository evidence | External evidence still required | Status |
|---|---|---|---|
| P1-1 Staging | Staging deployment contract and smoke workflow exist | Hosted staging API/frontend, database, object storage, HTTPS/DNS, secrets, successful smoke run | BLOCKED |
| P1-2 Production object storage | Production S3-compatible configuration/tests and readiness documentation exist | Real production bucket, IAM credentials, encryption policy, lifecycle/backup configuration, upload/read verification | BLOCKED |
| P1-3 Monitoring and alerting | Production health-check workflow exists and safely skips when `PRODUCTION_API_URL` is absent | Real production target, repository variable, failure notifications, external uptime/observability, alert delivery evidence | BLOCKED |
| P1-4 Razorpay | Provider contract, credential validation and sandbox/production verification procedure exist | Razorpay test/production credentials and successful credentialed payment, webhook and refund verification | BLOCKED |
| P1-5 Backup/restore | Backup/restore runbook and secret-safe contract verification exist | Real database/object-storage backup, isolated restore drill, integrity verification and evidence | BLOCKED |
| P1-6 GitHub main protection | Repository currently exposes no rulesets through the connected GitHub integration; direct branch-protection administration is not available to this integration | Repository-admin configuration requiring PR review/checks and preventing unverified direct changes to `main` | BLOCKED |

## Verified repository state

- `main` currently points to `bce70ef510e47e1e1f797561cfc865b9f70fe046`.
- The latest `main` commit records the current production-readiness evidence update.
- There are currently **0 open pull requests**.
- The repository contains CI, dependency-audit, Browser E2E, production-monitoring and staging-smoke workflows.
- The connected GitHub integration returns an empty repository ruleset list.
- The GitHub branch-protection endpoint requires administration access that is not available to the connected integration, so protection must be verified/configured from repository administration settings.

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

1. Configure and verify `main` branch protection in GitHub repository settings.
2. Provision and verify real staging.
3. Provision production object storage.
4. Configure production monitoring and alert delivery.
5. Obtain Razorpay credentials and perform credentialed sandbox verification.
6. Perform the isolated backup/restore drill.
7. Run the final production-readiness audit.
