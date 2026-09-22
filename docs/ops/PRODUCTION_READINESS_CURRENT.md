# ExhibitTix Production Readiness Current State

**Audit baseline:** `af94984e382354aa8465d0dc64fdc2e78870e1f7` (`main`)

This document records repository evidence only. It must not be interpreted as proof that external production infrastructure is provisioned or verified.

## Gate status

| Gate | Repository evidence | External evidence still required | Status |
|---|---|---|---|
| P1-1 Staging | Staging deployment contract and smoke workflow exist | Hosted staging API/frontend, database, object storage, HTTPS/DNS, secrets, successful smoke run | BLOCKED |
| P1-2 Production object storage | Production S3-compatible configuration/tests and readiness documentation exist | Real production bucket, IAM credentials, encryption policy, lifecycle/backup configuration, upload/read verification | BLOCKED |
| P1-3 Monitoring and alerting | Production health-check workflow exists and safely skips when `PRODUCTION_API_URL` is absent | Real production target, repository variable, failure notifications, external uptime/observability, alert delivery evidence | BLOCKED |
| P1-4 Razorpay | Provider contract, credential validation and sandbox/production verification procedure exist | Razorpay test/production credentials and successful credentialed payment, webhook and refund verification | BLOCKED |
| P1-5 Backup/restore | Backup/restore runbook and secret-safe contract verification exist | Real database/object-storage backup, isolated restore drill, integrity verification and evidence | BLOCKED |
| P1-6 GitHub main protection | Branch protection is directly observable as disabled on the audited `main` branch | Repository-admin configuration enabling required checks and preventing unverified direct merges | BLOCKED |

## Verified repository state

- `main` currently points to `af94984e382354aa8465d0dc64fdc2e78870e1f7`.
- The latest `main` commit is the production-monitoring configuration-safe fix from PR #117.
- No open pull requests were present at audit time.
- The repository contains CI, dependency-audit, Browser E2E, production-monitoring and staging-smoke workflows.
- GitHub's branch metadata reports `protected: false` and required status checks disabled for `main`.

## Merge policy

A repository-side change is not considered production-ready merely because CI is green. External gates above require real deployment, credential, infrastructure or repository-administration evidence.

For normal pull requests, require the repository's CI quality, Browser E2E and dependency-audit checks to pass before merge. If GitHub has not produced checks for a head commit, the PR must remain unmerged.

## Next independent engineering work

Continue with product capabilities that do not require external production infrastructure. Do not fabricate completion of any blocked P1 gate. Re-audit this document after material production-readiness changes or after external evidence becomes available.
