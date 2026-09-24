# ExhibitTix Production Launch Gates

**Baseline:** `main` commit `31337f54d0d37b8e4490e49ea49bad8347ad46c7`  
**Updated:** 2026-09-24

This document separates repository-verifiable launch gates from deployment/admin dependencies. A green repository does not by itself authorize a production launch.

## 1. Repository gates

| Gate | Evidence required | Current state |
| --- | --- | --- |
| CI | Full CI workflow passes on the exact PR head | Required for every production merge |
| Browser E2E | Browser E2E workflow passes on the exact PR head | Required for every production merge |
| Dependency audit | Dependency audit passes on the exact PR head | Required for every production merge |
| Main protection | `main` requires the three checks above before merge | **BLOCKED: GitHub branch protection is disabled** |
| Production storage guard | Production rejects local filesystem storage and incomplete object-storage configuration | Implemented and regression-tested |
| HTTP security | Explicit CORS allowlist, security headers, sanitized production errors, request IDs | Implemented; deployment values remain external configuration |
| Public abuse controls | Sensitive public reads and mutations have dedicated rate limits | A1 audit/hardening is in progress and must remain green |
| Tenant isolation | Cross-organizer access regression suite remains green | Covered by merged A1 regression PRs |

## 2. Deployment gates

These cannot be completed from source control alone and must be verified in the real staging/production environment.

### Staging

- Real staging deployment exists and is reachable over HTTPS.
- Production-like environment variables are supplied through the deployment secret manager.
- Database migrations run successfully against the staging database.
- Frontend and API communicate through the intended public origins.
- Browser E2E is executed against the deployed staging system, not only local/test infrastructure.

### Object storage

Production uploads must use the configured object-storage backend. Required evidence:

- Bucket exists in the production account.
- Application credentials are scoped to the required bucket/prefix only.
- Upload, read, delete, and failure paths are verified in staging.
- Public/private object visibility matches the product's intended access model.
- CDN/cache behavior is verified where applicable.

### Payments

Razorpay production readiness requires:

- Production key material configured through secrets.
- Server-side payment verification enabled and tested.
- Webhook endpoint reachable over HTTPS.
- Razorpay webhook signature verification and idempotency verified with real webhook deliveries.
- Duplicate, delayed, and out-of-order webhook behavior verified.
- Refund/reconciliation procedure documented and exercised.

A sandbox-only or mock-provider test is not evidence of production payment readiness.

### Database recovery

- Automated production backups are enabled.
- A restore drill has been completed against an isolated target.
- Migration rollback/recovery procedure is documented.
- Restore time and data-loss objectives are recorded.

### Monitoring and alerting

At minimum, production monitoring must detect:

- API availability/readiness failures.
- Elevated 5xx responses.
- Database connectivity failures.
- Payment/webhook failures.
- Object-storage failures.
- Authentication/rate-limit anomalies.
- Background-job or queue failures, if enabled.

Alerts must have an identified owner and an actionable response path.

### DNS/TLS

- Production DNS points to the intended deployment.
- TLS certificate is valid and auto-renewal is configured.
- HTTPS redirects and HSTS behavior are verified after DNS is live.
- `CORS_ORIGINS` contains only the real production origins.

## 3. Final launch decision

Do not mark ExhibitTix production-ready until:

1. Repository gates are green on the release commit.
2. `main` branch protection requires those gates.
3. Staging deployment has passed the critical cross-persona lifecycle.
4. Production object storage is configured and verified.
5. Razorpay production configuration and webhook behavior are verified, or payments are explicitly disabled from launch.
6. Backup/restore has been drilled.
7. Monitoring and alerting are active.
8. DNS/TLS and production CORS values are verified.
9. No P0/P1 security defect remains open.

External dependencies should be recorded as blockers rather than simulated or marked complete.
