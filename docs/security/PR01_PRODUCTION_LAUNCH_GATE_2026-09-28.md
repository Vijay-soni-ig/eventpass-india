# ExhibitTix PR-01 Production Launch Gate — 2026-09-28

## Purpose

This document is the launch-gate handoff for PR-01 Production Readiness. It separates repository-verifiable evidence from deployment/provider evidence so that a green GitHub CI run is not mistaken for production readiness.

## Current baseline

- Main baseline: `9492559217e6687360cbbbdb06b70017ac3db3a5`
- Repository-side hardening tracks completed through PR-01F.
- No unresolved P0 application defect was identified in the PR-01 repository audit.
- Remaining launch risk is concentrated in external environment verification, real payment/storage behavior, operational controls, and full business E2E.

## Repository-side status

| Area | Status | Evidence / interpretation |
|---|---|---|
| Frontend/backend build | PASS at merged PR gates | Exact-head CI required for every implementation PR |
| Prisma/migrations/tests | PASS at merged PR gates | Continue exact-head verification after changes |
| HTTP security / CORS / headers | PASS | PR-01B regression coverage |
| RBAC / tenant isolation / BOLA | PASS for covered regression scope | PR-01C plus prior tenant-isolation work; continue regression testing |
| Authentication/session | PASS repository implementation | Server-side session binding, revocation, expiry, suspended-user enforcement; production secrets/runtime still external |
| Auth/session rate limiting | PASS | PR-01D |
| Critical route rate-limit inventory | PASS | PR-01E |
| Upload MIME/magic-byte/resource controls | PASS repository implementation | Multer hardening and upload middleware; real provider/runtime still external |
| Production storage configuration guard | PASS | PR-01F |
| Production object-storage integration | BLOCKED / external | Real S3-compatible bucket, credentials, policy and runtime verification required |
| Payment provider safety | PARTIAL / external | Application contracts exist; credentialed Razorpay sandbox/live verification remains |
| Webhook verification | PARTIAL / external | Verify with real provider callbacks and replay/idempotency tests |
| Payment reconciliation | PARTIAL / external | Run against realistic paid/refund datasets and provider records |
| Backup automation | IMPLEMENTED | Scripts exist; scheduled durable backup execution remains external |
| Restore capability | PARTIAL | Isolated restore drill and measured RTO/RPO remain |
| Monitoring/alerting | NOT TESTED | Requires deployed environment and alert destination |
| Staging environment | NOT TESTED | Requires actual deployment |
| GitHub branch protection | NOT TESTED | Repository settings verification required |
| Production config/secrets | NOT TESTED | Secure deployment configuration required; never paste secrets into chat |
| DNS/TLS | NOT TESTED | Deployment/domain verification required |
| Full cross-persona E2E | NOT TESTED | Must execute against deployed staging |

## External launch gate

### G1 — Staging
Required:
- Production-like staging deployment
- Database migrations applied successfully
- Production build running
- HTTPS enabled
- Correct frontend/API origins
- No development/local storage configuration

Evidence:
- Staging URL
- deployment/build identifier
- migration result
- smoke-test result

### G2 — Object storage
Required:
- S3-compatible production bucket
- least-privilege application credentials
- server-side encryption
- versioning where appropriate
- lifecycle/retention policy
- public/private object policy matching application rules
- successful upload/read/delete test
- migration/restore drill for representative objects

Do not paste credentials into chat.

### G3 — Razorpay
Required:
- sandbox credentials configured securely
- server-side payment verification
- webhook endpoint configured
- webhook signature verification
- duplicate/replay handling
- payment pending/failure/success handling
- refund and partial-refund verification
- reconciliation against provider records

Live credentials should only be configured through the deployment secret manager.

### G4 — Backup and restore
Required:
- scheduled database backups
- durable off-host backup destination
- retention policy
- isolated restore environment
- restore verification
- measured RTO/RPO
- documented recovery procedure

### G5 — Monitoring and operations
Required:
- application error monitoring
- API/server health monitoring
- database monitoring
- payment/webhook failure alerts
- storage failure alerts
- backup failure alerts
- alert ownership and escalation path
- structured logs with sensitive-data redaction

### G6 — GitHub/release controls
Required:
- protect `main`
- require PR review
- require required status checks
- prevent direct pushes
- require up-to-date branch where appropriate
- confirm release/rollback procedure

### G7 — Full business E2E
Execute on staging:

Organizer → Event → Venue/Hall → Stall/Module setup → Exhibitor → Stall booking → Payment → Visitor registration → Ticket order → Payment → QR ticket → Check-in → Lead capture → Analytics → Refund → Reconciliation.

For each stage verify UI, API response, database state, permissions, audit trail, notifications where applicable, and failure behavior.

## Exit criteria

PR-01 can be marked **PRODUCTION READY** only when:

1. All repository gates remain green at the release commit.
2. G1–G7 have recorded evidence.
3. No unresolved P0 exists.
4. P1 items have an explicit owner and launch decision.
5. Payment, storage, backup/restore, monitoring, and security controls are verified in the deployed environment.
6. Full business E2E passes on staging.
7. Rollback and incident-response procedures are documented and tested.

Until then, the correct status is:

**PR-01 — REPOSITORY HARDENING COMPLETE / PRODUCTION LAUNCH GATE PENDING**

## User input required

No secrets or code changes are required from the user for the repository audit.

When moving through the external gate, the user/team must provide access or evidence for:
- staging environment/deployment
- S3-compatible storage provisioning
- Razorpay sandbox configuration
- monitoring/alerting setup
- backup destination and restore environment
- GitHub repository settings
- production DNS/TLS
- authorized staging test accounts/data

Credentials should be entered through secure environment/secret management, not pasted into chat.
