# PR-01 Security Verification Matrix

**Baseline commit:** `b1c442f6878f7d89af4991c4128c4cb1e4b14420`

**Purpose:** record repository-verifiable production security controls without claiming closure of controls that depend on deployment infrastructure, credentials, or GitHub administration.

## 1. HTTP boundary controls

| Control | Repository evidence | Status |
|---|---|---|
| Production CORS allowlist | `server/src/app.ts` reads `CORS_ORIGINS`; production startup fails when it is empty; requests are restricted to configured origins. | Implemented |
| Security headers | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP, and production HSTS are set in the Express boundary. | Implemented |
| Request body limit | JSON requests are capped at 1 MB; payment webhooks use a 100 KB raw-body limit. | Implemented |
| Error leakage reduction | Production error responses return generic 4xx/5xx bodies while structured server logs retain request context. | Implemented |
| Request correlation | Every request receives `X-Request-Id` and completion logs include the request id and duration. | Implemented |

## 2. Authentication and abuse controls

| Control | Repository evidence | Status |
|---|---|---|
| JWT/session policy | JWT validation and session policy are covered by the existing authentication implementation and security documentation. | Implemented, regression evidence required |
| Sensitive-route rate limiting | Authentication and other sensitive mutation boundaries have targeted rate-limit coverage. | Implemented, coverage audit ongoing |
| IDOR/BOLA/RBAC/tenant isolation | Existing route-level authorization and tenant-scope controls are covered by targeted tests and audits. | Implemented, regression sweep ongoing |

## 3. Upload and storage boundary

| Control | Repository evidence | Status |
|---|---|---|
| Production storage guard | Production startup validates storage configuration. | Implemented |
| Local sensitive-document exposure | Exhibitor document path returns 404 when S3 storage is not active. | Implemented |
| Production object storage | S3/object-storage credentials, bucket policy, CDN and lifecycle configuration require deployment infrastructure. | External blocker |

## 4. Payments and webhooks

| Control | Repository evidence | Status |
|---|---|---|
| Webhook raw-body handling | Payment webhook route receives raw body before JSON parsing and has an explicit 100 KB limit. | Implemented |
| Razorpay production verification | Production credentials, webhook secret and live-provider verification require Razorpay access. | External blocker |
| Reconciliation/operational readiness | Production settlement, refund and reconciliation procedures require operational environment verification. | External blocker |

## 5. Delivery governance and operations

| Control | Status |
|---|---|
| CI / frontend / backend validation | Repository CI is the merge gate and must remain green. | Repository-verifiable |
| Browser E2E regression | Required for production-facing changes. | Repository-verifiable |
| Dependency audit | Required for production-facing changes. | Repository-verifiable |
| Staging deployment verification | Requires a real staging environment and credentials. | External blocker |
| Monitoring and alerting | Requires production monitoring infrastructure and alert destinations. | External blocker |
| Backup/restore drill | Requires access to the deployed production/staging database. | External blocker |
| Main branch protection | GitHub repository administration is required to enforce required checks. | External blocker |

## 6. Release rule

This matrix is an evidence ledger, not a production approval. A repository change may be merged only when the PR's required CI, Browser E2E and Dependency Audit checks pass on the exact PR head. Production launch remains blocked until the external controls above are verified in the real deployment environment.

## 7. Next independent repository work

After this evidence baseline, the highest-value remaining repository work is targeted security regression coverage for the route families identified in the PR-01 audit, followed by the production Interactive Floor Plan foundation. External deployment blockers must not be represented as completed by repository-only changes.
