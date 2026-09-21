# PR-01 Production Readiness & Security Audit

Date: 2026-09-21

## Scope

This audit reviews the current `main` branch against Issue #2 (PR-01). It distinguishes repository evidence from items that require deployment/runtime or GitHub administration verification.

## Current verified implementation

| Area | Status | Evidence |
|---|---|---|
| CORS configuration | PARTIAL PASS | Production requires non-empty `CORS_ORIGINS`; origin allowlist is enforced in `server/src/app.ts`. Live production origin verification remains external. |
| Security headers | PASS | Security headers and production HSTS are set in `server/src/app.ts`. |
| JWT hardening | PASS | JWT uses explicit issuer/audience, HS256 allowlist, JTI, and configurable expiry. |
| Server-side sessions | PASS | Sessions are persisted, hashed, expiry-checked, revocable, and pruned. |
| JSON/body limits | PASS | JSON is limited to 1MB; payment webhooks use raw-body parsing with a 100KB limit. |
| Rate limiting | PARTIAL PASS | Dedicated controls cover sensitive auth, registration, booking, payment, discovery and event-ticket mutation routes. A final endpoint inventory and abuse regression sweep remain. |
| Upload validation | PASS | Uploads have a 5MB limit, MIME allowlists, generated filenames, and magic-byte verification. |
| Object storage adapter | PASS / EXTERNAL VERIFICATION PENDING | S3-compatible storage adapter, production configuration assertions, private document access and local-storage fallback controls are implemented. A real managed production bucket, credentials and durability/recovery drill are still required. |
| Health/readiness | PASS | Health and DB-backed readiness endpoints exist and production compose uses readiness checks. |
| Payment webhook verification | PASS | Raw-body signature verification, event deduplication and refund reconciliation are implemented. Live Razorpay verification remains external. |
| Mock payment provider production safety | PASS | Production rejects `PAYMENT_PROVIDER=mock`; non-production may explicitly use mock. |
| Backup/restore scripts | PASS / DRILL PENDING | Checksummed custom-format backups and explicit production restore confirmation exist. A real recovery drill remains required. |
| Dependency security | PASS | The dependency remediation landed in PR #84 with Dependency Audit, CI and Browser E2E passing before merge. Current dependency audit must still be rerun as part of final release verification. |
| CI / Browser E2E | PASS | Required CI and Browser E2E suites have passed on the current application baseline. |
| Node 22 Actions runtime | PASS | CI and Browser E2E workflows were migrated to Node 22 and the change was merged via PR #85. |
| Staging smoke gate | PASS / EXTERNAL VERIFICATION PENDING | A manual staging smoke workflow checks HTTPS URL, API health, DB readiness and frontend reachability. A real staging deployment and successful run are still required. |

## Remaining P1 findings

### P1 — Production object storage

The application-side S3-compatible storage foundation is implemented, but production remains blocked until a real managed bucket is provisioned and verified with encryption, least-privilege credentials, private-by-default access, lifecycle/retention policy, versioning or equivalent recovery protection, monitoring, checksum-verified migration and a recovery drill.

### P1 — Main-branch protection

GitHub currently reports `main` as unprotected with required status-check enforcement off. Production governance requires pull requests, direct-push protection, and required successful checks for `CI / quality` and `Browser E2E / public-event`. This requires repository administration action outside the connected integration.

### P1 — Staging deployment

The repository now contains a manual staging smoke gate, but no successful run against a real staging deployment has been evidenced. Staging still requires isolated infrastructure, database, credentials, payment sandbox configuration, storage configuration and a successful smoke/E2E verification.

### P1 — Monitoring and alerting

Structured request logs and health endpoints exist, but external production monitoring/alerting is not verified. Production needs API availability, readiness, HTTP 5xx, database, payment/webhook, storage and authentication/rate-limit monitoring with actionable alerts.

### P1 — Live payment and recovery verification

Razorpay signature verification, idempotency and reconciliation are implemented, but live/sandbox provider verification and a real backup/restore drill require external infrastructure and credentials.

## Verification limitations

Source inspection and repository CI do not prove production CORS/TLS behavior, live Razorpay behavior, managed object-storage durability, external alert delivery, staging deployment health, or successful backup restoration. These require deployment-level evidence.

## Recommended remaining order

1. Provision and verify staging infrastructure.
2. Configure managed object storage and perform migration/recovery verification.
3. Run staging smoke, Browser E2E and payment sandbox verification.
4. Complete the rate-limit endpoint inventory and abuse regression sweep.
5. Configure external monitoring and alerting.
6. Perform backup/restore drill.
7. Enable `main` branch protection with required CI checks.
8. Run final cross-persona release regression and dependency audit.

## Production gate

PR-01 remains **NOT COMPLETE**. The repository contains the application-side hardening required for the remaining gates, but external infrastructure and repository-governance evidence is still required before a production-ready claim.
