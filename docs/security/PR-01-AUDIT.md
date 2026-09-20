# PR-01 Production Readiness & Security Audit

Date: 2026-09-20

## Scope

This audit reviews the current `main` branch against Issue #2 (PR-01). It distinguishes repository evidence from items that require deployment/runtime verification.

## Verified implemented

| Area | Status | Evidence |
|---|---|---|
| CORS configuration | PARTIAL PASS | Production requires non-empty `CORS_ORIGINS`; origin allowlist is enforced in `server/src/app.ts`. |
| Security headers | PASS | Security headers and production HSTS are set in `server/src/app.ts`. |
| JWT hardening | PASS | JWT uses explicit issuer/audience, HS256 allowlist, JTI, and configurable expiry. |
| Server-side sessions | PASS | Sessions are persisted, hashed, expiry-checked, revocable, and pruned. |
| JSON/body limits | PASS | JSON is limited to 1MB; payment webhooks use raw-body parsing with a 100KB limit. |
| Rate limiting | PARTIAL PASS | Sensitive auth, registration, booking, payment, discovery and mutation routes have dedicated limits; final endpoint inventory remains. |
| Upload validation | PASS | Uploads have a 5MB limit, MIME allowlists, generated filenames, and magic-byte verification. |
| Health/readiness | PASS | Health and DB-backed readiness endpoints exist and production compose uses readiness checks. |
| Payment webhook verification | PASS | Raw-body signature verification, event deduplication and refund reconciliation are implemented. |
| Backup/restore scripts | PASS | Checksummed custom-format backups and explicit production restore confirmation exist. |
| CI quality gate | PASS | CI runs migration, seed, lint, frontend build, performance/accessibility checks, backend build/tests; Browser E2E is separate. |

## Findings requiring action

### P1 — Multer dependency is outdated and has known security advisories

The backend currently declares `multer ^1.4.5-lts.1`. Current Multer advisories identify vulnerabilities affecting older releases, including denial-of-service issues. Upgrade to a patched 2.x release, regenerate both lockfiles, then run the full CI/E2E suite.

### P1 — Production object storage

Uploads currently use local filesystem storage. Docker Compose provides a persistent local volume, but this is not equivalent to durable production object storage/CDN architecture. Either implement an approved object-storage adapter or explicitly block production launch for upload-dependent workflows until object storage is configured.

### P1 — Main-branch protection

The connected GitHub integration could not read the branch-protection endpoint because GitHub denied access. Repository administration must verify that main requires the CI quality gate before production launch.

### P1 — Staging

CI validates build/test behavior but does not deploy to a staging environment. A staging environment with isolated credentials, database, webhook endpoint, object storage and smoke/E2E verification is still required.

### P1 — Monitoring/alerting

Structured request logs and health endpoints exist, but external production monitoring/alerting is not verified. Production needs application error tracking, uptime/readiness monitoring, payment/webhook failure alerts, notification failure visibility and database/infrastructure alerts.

## Verification limitations

Source inspection alone does not prove production CORS/TLS behavior, live Razorpay behavior, backup restore success, object-storage durability, external alert delivery, branch protection settings, or a current dependency vulnerability scan.

## Priority order

1. Upgrade Multer and regenerate lockfiles.
2. Complete rate-limit endpoint inventory and targeted regressions.
3. Decide and implement/block local filesystem uploads for production.
4. Establish staging and deployment smoke checks.
5. Configure monitoring/alerting.
6. Verify branch protection and required CI checks.
7. Run a recovery drill and final cross-persona E2E regression.

## Production gate

PR-01 is **NOT COMPLETE** yet. No production-ready claim should be made until the P1 findings and runtime verification items are closed with evidence.
