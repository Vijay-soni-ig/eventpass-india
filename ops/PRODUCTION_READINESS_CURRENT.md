# ExhibitTix Production Readiness Current State

**Audit baseline:** `ef8df67bf52ca9406024f7daa507b0b98a8b7296` (`main`, PR #882 merged 2026-11-15)

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

- `main` currently points to `ef8df67bf52ca9406024f7daa507b0b98a8b7296` (PR #882 squash merge).
- PR #169 was merged into `main` after CI #606, Browser E2E #352 and Dependency Audit #201 all passed on the exact PR head `845107be7c79742121e243266565dd5b91acc292`.
- PR #169 added production HTTP security regression coverage for API security headers, request IDs and explicit CORS allowlisting/rejection.
- A2 tenant isolation is recorded as closed for the repository-verifiable scope after PRs #159-#167.
- The connected GitHub integration returned no pull-request workflow runs for the post-merge `main` commit, so this tracker does not treat merge-commit workflow evidence as available.
- The repository contains CI, dependency-audit, Browser E2E, production-monitoring and staging-smoke workflows.
- Branch protection is enabled and the eight required status-check contexts are configured. The available branch response does not establish whether PR reviews, force-push/deletion restrictions, and administrator enforcement are also configured.

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

1. Close the deployment-contract gaps identified in the Phase 1 review: require explicit production rate-limit topology and enable mandatory malware scanning in staging.
2. Verify any remaining justified Universal Event 001E read-cutover gaps without forcing incompatible Exhibition rewrites.
3. Configure and verify `main` branch protection in GitHub repository settings when administration access is available.
4. Provision and verify real staging.
5. Provision production object storage.
6. Configure production monitoring and alert delivery.
7. Obtain Razorpay credentials and perform credentialed sandbox verification.
8. Perform the isolated backup/restore drill.
9. Run the final cross-persona production-readiness E2E and final audit.


## Phase 1 security audit update — 2026-11-16

**Reviewed baseline:** `ef8df67bf52ca9406024f7daa507b0b98a8b7296`.

### Existing controls verified in source and test inventory

- Authentication validates signed JWT issuer/audience/algorithm, session validity, suspended-user status, and bounded token lifetime.
- Organizer and exhibitor membership authorization helpers scope tenant access by active membership and role permissions.
- Regression tests cover cross-organizer Exhibition/Event reads and mutations, organizer/exhibitor tenant boundaries, nested Universal Event resources, event role permissions, and disabled public module gates.
- Mutating-route rate-limit inventory is enforced by `routeRateLimitCoverage.test.ts`; critical route families are separately listed in `pr01CriticalRateLimitInventory.test.ts`.
- Upload middleware enforces allowlisted MIME types, actual file signatures, file/field/part limits, malware scanning, and cleanup on rejection. Private exhibitor documents are not served through the public uploads path.
- Production startup requires explicit rate-limit topology and production malware-scan configuration at application entrypoint.

### Gaps found and remediation in progress

1. **Production rate-limit topology was silently defaulted by Docker Compose.** The application requires an explicit production topology, but the production Compose file supplied `single-instance` when the variable was absent. This defeated the intended fail-closed deployment contract. The current change removes that default and requires an explicit `RATE_LIMIT_TOPOLOGY=single-instance`.
2. **Staging did not enable malware scanning.** Staging used `NODE_ENV=staging` and did not set `UPLOAD_MALWARE_SCAN_ENABLED`, so `malwareScanRequired()` skipped scanning. The current change enables scanning and requires a reachable `CLAMD_HOST` in staging, matching production upload behavior.
3. **Environment verification remains external.** The staging smoke workflow and production monitor exist, but successful runs against actual deployment targets have not been evidenced in this audit. Object storage, ClamAV availability, backup/restore, monitoring alert delivery, and rollback still require operator evidence.

### Current verification boundary

- PR #882: all eight required PR-head checks passed before merge; `main` now points to its squash merge commit.
- Main branch protection: enabled; required contexts are present. Full repository rule settings are only partially verified.
- No claim is made that production or staging runtime configuration has passed.
- Razorpay/live payment-provider verification remains out of scope for this pass.
