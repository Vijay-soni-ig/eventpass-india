# ExhibitTix Production Readiness Gate Tracker

Updated: 2026-09-23

This tracker separates repository-verifiable engineering gates from deployment and account-level gates that cannot be truthfully marked complete from source control alone.

## Repository gates

| Gate | Evidence / state | Status |
|---|---|---|
| Universal Event participant workflows | PR #152 merged to `main` as `c97ee5d462c242e2d80aa60885dd13e80cf7058a` | PASS |
| Universal Event organizer management | PR #154 merged to `main` | PASS |
| Public Event discovery filters | PR #155 merged to `main` | PASS |
| Public Event details experience | PR #156 merged to `main` as `3040bb566ede51941ed16dfa9e97dd9da0848be6` | PASS |
| Open PR backlog | No open PRs as of this update | PASS |
| Current `main` branch | `3040bb566ede51941ed16dfa9e97dd9da0848be6` | VERIFIED |
| Main branch CI evidence | No pull-request workflow runs are currently returned for merge commit `3040bb566ede51941ed16dfa9e97dd9da0848be6` | PENDING |
| Main branch protection | GitHub reports `protected=false` and required status-check enforcement `off` | BLOCKED |
| Phase 26.2 deployment foundation | Existing status says implementation complete, but rebased CI and deployment smoke verification remain required | PENDING |

## Repository-verifiable security hardening still required

These items can be progressed without production credentials:

- Audit and explicitly allowlist production CORS origins.
- Add and test HTTP security headers with a CSP-compatible configuration.
- Review JWT/session lifetime and document the production policy.
- Audit rate limiting across authentication, booking, payment, webhook, and expensive mutation endpoints.
- Add request/body abuse limits where missing.
- Harden upload MIME, content, size, filename/path, and storage handling.
- Continue the IDOR/BOLA/RBAC/tenant-isolation regression sweep.
- Ensure production errors do not leak sensitive implementation details.
- Add or strengthen health/readiness and structured operational logging where repository-verifiable.
- Review dependency vulnerabilities without unsafe mass upgrades.

## Deployment gates

These require an actual deployment environment and must not be marked PASS from repository state alone:

- Production PostgreSQL service and credentials
- Production application secrets
- TLS certificate and production DNS/domain
- Razorpay production credentials and webhook verification
- Backup and restore drill
- Production object storage for scalable uploads
- Monitoring and alerting connected to the production deployment
- GitHub main branch protection administration

## Merge policy

A production-facing PR is not considered complete until its exact head commit has successful required CI/E2E/security checks. A green check on an older commit is not sufficient evidence after the PR head changes.

When branch protection is enabled, the repository should require the project's CI, Browser E2E, and Dependency Audit checks before merging production-facing changes.

## Current priority

Continue with the highest-value repository-verifiable production hardening item. Do not fabricate deployment verification when an external service, credential, DNS record, or GitHub administration setting is required.
