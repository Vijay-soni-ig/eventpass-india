# ExhibitTix Production Readiness Gate Tracker

Updated: 2026-09-23 (security regression closure refresh)

This tracker separates repository-verifiable engineering gates from deployment and account-level gates that cannot be truthfully marked complete from source control alone.

## Repository gates

| Gate | Evidence / state | Status |
|---|---|---|
| Universal Event participant workflows | PR #152 merged to `main` | PASS |
| Universal Event organizer management | PR #154 merged to `main` | PASS |
| Public Event discovery filters | PR #155 merged to `main` | PASS |
| Public Event details experience | PR #156 merged to `main` | PASS |
| A2 tenant isolation | PRs #159-#167 merged; repository-verifiable A2 scope closed with targeted regression evidence | PASS |
| Production HTTP security regressions | PR #169 merged to `main`; CI #606, Browser E2E #352 and Dependency Audit #201 passed on exact PR head `845107be7c79742121e243266565dd5b91acc292` | PASS |
| Current `main` branch | `202e5dd427239d018672dc92cb6e17823ebffaf8` | VERIFIED |
| Main branch CI evidence | No pull-request workflow runs are returned for merge commit `202e5dd427239d018672dc92cb6e17823ebffaf8`; merge was gated by the exact PR-head CI/E2E/Dependency Audit results above | PENDING |
| Main branch protection | GitHub reports `protected=false` and required status-check enforcement `off` | BLOCKED |
| Phase 26.2 deployment foundation | Existing status says implementation complete, but rebased CI and deployment smoke verification remain required | PENDING |

## Universal Event / 001E

The Universal Event foundation and repository-level progressive read-cutover work are substantially complete. Exhibition-specific operational domains remain compatibility-backed until canonical Event-domain equivalents exist; no forced rewrite should be marked complete without evidence.

## Repository-verifiable security hardening

A2 tenant isolation is closed for the repository-verifiable scope. Production HTTP security regression coverage is now merged and green on its exact PR head.

Remaining repository-verifiable security work should focus on:

- A1 endpoint inventory closure.
- JWT/session lifetime policy documentation and regression coverage where still missing.
- Abuse/rate-limit review across authentication, booking, payment, webhook, and expensive mutation endpoints.
- Upload MIME, content, size, filename/path, and storage hardening.
- Continued IDOR/BOLA/RBAC/tenant-isolation regression coverage where gaps remain.
- Health/readiness and structured operational logging improvements where repository-verifiable.
- Dependency vulnerability review without unsafe mass upgrades.

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
