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
| Object storage adapter | PASS / EXTERNAL VERIFICATION PENDING | S3-compatible storage foundation and production configuration assertions are implemented. A real managed production bucket, credentials and durability/recovery drill are still required. |
| Health/readiness | PASS | Health and DB-backed readiness endpoints exist and production compose uses readiness checks. |
| Payment webhook verification | PASS | Raw-body signature verification, event deduplication and refund reconciliation are implemented. Live Razorpay verification remains external. |
| Mock payment provider production safety | PASS | Production rejects `PAYMENT_PROVIDER=mock`; non-production may explicitly use mock. |
| Backup/restore scripts | PASS / DRILL PENDING | Checksummed custom-format backups and explicit production restore confirmation exist. A real recovery drill remains required. |
| Dependency security | PASS | Dependency remediation landed previously with Dependency Audit, CI and Browser E2E evidence. A final release-time dependency audit remains required. |
| CI / Browser E2E | PASS ON PR #107 | Phase 6.1 PR #107 reached green CI/E2E after fixing the missing `PARTICIPANTS` module registry entry, then merged as commit `7ad8cada6339757e6f33b27eb64cfb66a34cfc8d`. |
| Universal Event participant foundation | PASS | Phase 6.1 adds the `PARTICIPANTS` module, organizer-scoped participant CRUD, soft archive/restore, public-safe projection, audit logging and focused regression coverage. |
| Node 22 Actions runtime | PASS | CI and Browser E2E workflows use the Node 22 runtime. |
| Staging smoke gate | PASS / EXTERNAL VERIFICATION PENDING | A manual staging smoke workflow checks HTTPS URL, API health, DB readiness and frontend reachability. A real staging deployment and successful run are still required. |

## Remaining P1 findings

### P1 — Production object storage

The application-side S3-compatible storage foundation is implemented, but production remains blocked until a real managed bucket is provisioned and verified with encryption, least-privilege credentials, private-by-default access, lifecycle/retention policy, versioning or equivalent recovery protection, monitoring, checksum-verified migration and a recovery drill.

### P1 — Main-branch protection

The connected GitHub integration cannot read the branch-protection endpoint and returned HTTP 403. Therefore branch protection is **not verified**, rather than being declared enabled or disabled. Production governance requires pull requests, direct-push protection, and required successful checks for `CI / quality` and `Browser E2E / public-event`. Repository administration must verify and configure this outside the connected integration.

### P1 — Staging deployment

The repository contains a manual staging smoke gate, but no successful run against a real staging deployment has been evidenced. Staging still requires isolated infrastructure, database, credentials, payment sandbox configuration, storage configuration and successful smoke/E2E verification.

### P1 — Monitoring and alerting

Structured request logs and health endpoints exist, but external production monitoring/alerting is not verified. Production needs API availability, readiness, HTTP 5xx, database, payment/webhook, storage and authentication/rate-limit monitoring with actionable alerts.

### P1 — Live payment and recovery verification

Razorpay signature verification, idempotency and reconciliation are implemented, but live/sandbox provider verification and a real backup/restore drill require external infrastructure and credentials.

### P1 — Participant feature completion

The universal participant foundation is merged, but specialized event participant capabilities remain incomplete. Speaker/session management, sponsor workflows, vendor/partner/staff workflows and participant-facing organizer UI must be delivered incrementally before those event types can be considered feature-complete.

## Verification limitations

Source inspection and repository CI do not prove production CORS/TLS behavior, live Razorpay behavior, managed object-storage durability, external alert delivery, staging deployment health, successful backup restoration, or GitHub branch-protection configuration. These require deployment-level or repository-administration evidence.

## Recommended remaining order

1. Continue Phase 6 with specialized participant capabilities, starting with speaker management.
2. Complete sponsor/vendor/partner/staff participant workflows and organizer UI.
3. Provision and verify staging infrastructure.
4. Configure managed object storage and perform migration/recovery verification.
5. Run staging smoke, Browser E2E and payment sandbox verification.
6. Complete the rate-limit endpoint inventory and abuse regression sweep.
7. Configure external monitoring and alerting.
8. Perform backup/restore drill.
9. Enable and verify `main` branch protection with required CI checks.
10. Run final cross-persona release regression and dependency audit.

## Production gate

PR-01 remains **NOT COMPLETE**. The repository contains the application-side hardening required for the remaining gates, but external infrastructure, runtime verification and repository-governance evidence are still required before a production-ready claim.