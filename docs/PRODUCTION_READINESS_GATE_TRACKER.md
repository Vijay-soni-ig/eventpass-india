# ExhibitTix Production Readiness Gate Tracker

Updated: 2026-09-23 (A2 closure refresh)

This tracker separates repository-verifiable engineering gates from deployment and account-level gates that cannot be truthfully marked complete from source control alone.

## Repository gates

| Gate | Evidence / state | Status |
|---|---|---|
| Universal Event participant workflows | PR #152 merged to `main` | PASS |
| Universal Event organizer management | PR #154 merged to `main` | PASS |
| Public Event discovery filters | PR #155 merged to `main` | PASS |
| Public Event details experience | PR #156 merged to `main` | PASS |
| A2 tenant isolation | PRs #159-#167 merged; repository-verifiable A2 scope closed with targeted regression evidence | PASS |
| Current `main` branch | `608da6e3af2e6fa6ea7c63cfe7772f12cb0e4176` | VERIFIED |
| Main branch CI evidence | PR heads through the A2 closure cycle passed CI/E2E/Dependency Audit; post-merge main-specific workflow evidence still requires verification | PENDING |
| Main branch protection | GitHub reports `protected=false` and required status-check enforcement `off` | BLOCKED |
| Phase 26.2 deployment foundation | Existing status says implementation complete, but rebased CI and deployment smoke verification remain required | PENDING |

## Repository-verifiable security hardening still required

A2 tenant isolation is now closed for the repository-verifiable scope. Remaining security work should focus on A1 endpoint inventory closure, production CORS/security headers/session policy, abuse/rate-limit review, upload hardening, and final security regression consolidation.

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
