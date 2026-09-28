# PR-01 Phase 01: Production Readiness Baseline Audit

**Audit date:** 2026-09-28  
**Audited branch:** `main`  
**Audited head:** `12dc5b7048f5fed52b2cbc8d28136324ee2c7374`

## Purpose

Establish the current repository state before making further PR-01 production-readiness changes.

This document deliberately separates:

- **PASS** = requirement is directly verified by repository evidence.
- **PARTIAL PASS** = implementation/evidence exists, but the complete control is not proven.
- **FAIL** = a known defect or unsafe condition is present.
- **NOT TESTED** = no sufficient evidence is available.

Source code is implementation evidence only. It is not deployment or production-runtime evidence.

## Baseline evidence matrix

| Area | Status | Current evidence | Remaining verification | Priority |
|---|---|---|---|---|
| Frontend build | PARTIAL PASS | CI workflow contains frontend install, lint and build gates. | Exact-head CI result must be captured for this baseline. | P1 |
| Backend build | PARTIAL PASS | CI workflow contains Prisma generation and backend build. | Exact-head CI result must be captured. | P1 |
| Prisma migrations | PARTIAL PASS | CI deploys migrations against PostgreSQL service. | Exact-head migration result and production migration rehearsal remain. | P1 |
| Seed | PARTIAL PASS | CI seeds its PostgreSQL test database. | Exact-head result and production-safe seed policy verification. | P2 |
| API tests | PARTIAL PASS | Backend tests are sharded across four CI jobs. | Exact-head green result and coverage of PR-01 security matrix. | P1 |
| Browser E2E | NOT TESTED | Repository treats Browser E2E as a required release gate. | Exact-head Browser E2E result. | P1 |
| Dependency audit | PARTIAL PASS | Dependency remediation previously landed and CI includes security expectations. | Rerun against current main before release. | P1 |
| CORS | PARTIAL PASS | Production requires non-empty CORS_ORIGINS and requests are allowlisted in app.ts. | Verify real staging/production origins and preflight behavior. | P1 |
| Security headers | PASS | CSP, HSTS in production, X-Content-Type-Options, X-Frame-Options, Referrer-Policy and Permissions-Policy are set in app.ts. | Runtime header verification on staging. | P1 |
| Request limits | PASS | JSON limit is 1 MB; payment webhook raw body is limited to 100 KB. | Abuse/load verification for expensive endpoints. | P1 |
| Error leakage | PASS | Production error responses are generic while structured logs retain request context. | Runtime verification and log sink review. | P1 |
| Authentication | PARTIAL PASS | JWT issuer/audience, HS256 allowlist, JTI and bounded lifetime are implemented; auth sessions are persisted and validated. | Cross-route regression sweep and runtime session verification. | P1 |
| RBAC | PARTIAL PASS | Platform, organizer and exhibitor access middleware plus recent dashboard security work exist. | Full cross-persona API matrix, including unauthorized IDs. | P0/P1 |
| Tenant isolation / BOLA | PARTIAL PASS | Recent tenant/RBAC hardening and dashboard integration tests exist. | Full sensitive-route regression sweep across all CRUD verbs. | P0/P1 |
| Rate limiting | PARTIAL PASS | Sensitive route limits exist, including reservation cancellation and public asset access. | Complete endpoint inventory and abuse regression sweep. | P1 |
| Upload validation | PARTIAL PASS | Production storage is guarded; storage keys are constrained; upload hardening landed previously. | Verify every upload route for MIME, magic bytes, size and authorization. | P1 |
| Production object storage | PARTIAL PASS | Production startup requires S3-compatible storage and local sensitive-document exposure is blocked. | Provision real bucket, least-privilege credentials, lifecycle/recovery and runtime test. | P1 |
| Payment provider safety | PASS | Production rejects mock payment configuration according to prior merged hardening. | Verify current exact-head behavior and real provider configuration. | P0/P1 |
| Razorpay webhooks | PARTIAL PASS | Raw-body route, signature verification and idempotency foundations exist. | Sandbox/live provider callback verification. | P0/P1 |
| Payment reconciliation | PARTIAL PASS | Reconciliation CLI and payment/refund architecture exist. | Execute against provider/test dataset and verify accounting totals. | P1 |
| Backup | PASS | PostgreSQL backup script creates custom-format dumps and SHA-256 checksums. | Verify external backup storage and schedule. | P1 |
| Restore | PARTIAL PASS | Restore script verifies checksum and blocks unconfirmed production restores. | Execute isolated restore drill and record RTO/RPO. | P1 |
| Health/readiness | PASS | `/api/health` and DB-backed `/api/health/ready` exist. | Verify deployment routing and monitoring integration. | P1 |
| Logging | PARTIAL PASS | Request ID, method, path, status and duration are logged; error logs are structured. | Verify external log retention/redaction and alerting. | P1 |
| Monitoring/alerting | NOT TESTED | Repository has health/logging foundations. | Real monitoring, alert destinations and exercised alert path. | P1 |
| Staging | NOT TESTED | Staging smoke workflow/readiness foundations exist. | Real isolated staging deployment and successful smoke/E2E run. | P1 |
| GitHub branch protection | NOT TESTED | Prior repository evidence recorded main as unprotected. | Verify current GitHub settings and require CI/E2E/dependency checks. | P1 |
| Production configuration | NOT TESTED | Application has production configuration guards. | Verify secrets, TLS, DNS, storage, payment and deployment configuration. | P1 |
| Full business E2E | NOT TESTED | Application contains the required lifecycle domains. | Run Organizer → Event → Exhibitor → Stall → Payment → Visitor → Ticket → Payment → QR → Check-in → Lead → Analytics → Refund → Reconciliation. | P0/P1 |

## Immediate findings

### No repository evidence of a new unresolved P0

The baseline does not currently establish a known unresolved P0 defect. However, tenant isolation, payment integrity and authentication remain P0-sensitive areas until the required regression evidence is complete.

### Main gap is evidence, not missing architecture

A substantial amount of PR-01 implementation has already landed. The next engineering work should avoid duplicating it and instead:

1. close missing repository-verifiable security regression coverage;
2. verify exact-head CI/E2E/dependency gates;
3. prepare staging/runtime verification;
4. execute external infrastructure controls when credentials and environments are available.

## Phase 01 exit criteria

Phase 01 is complete when:

- the current main SHA is recorded;
- all major PR-01 control families are inventoried;
- each control has a PASS/PARTIAL PASS/FAIL/NOT TESTED state;
- every non-PASS item has a concrete next verification action;
- no implementation is claimed solely from code existence;
- P0-sensitive areas are explicitly tracked.

## Next implementation track

**PR-01B: HTTP/API Security + targeted regression coverage**

Scope should focus on repository-verifiable gaps found by this audit, especially:

- CORS regression coverage;
- security-header regression coverage;
- request-size/error-boundary coverage;
- rate-limit endpoint inventory;
- sensitive upload-route coverage;
- authorization/BOLA regression tests where gaps remain.

Do not change production infrastructure assumptions in this PR. External staging/provider/storage work remains a separate launch gate.
