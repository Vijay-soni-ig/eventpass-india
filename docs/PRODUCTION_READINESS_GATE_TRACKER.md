# ExhibitTix Production Readiness Gate Tracker

Updated: 2026-09-23

This tracker separates repository-verifiable engineering gates from deployment and account-level gates that cannot be truthfully marked complete from source control alone.

## Repository gates

| Gate | Evidence / state | Status |
|---|---|---|
| Universal Event participant workflows | PR #152 merged to `main` as `c97ee5d462c242e2d80aa60885dd13e80cf7058a` | PASS |
| Open PR backlog | No open PRs at tracker creation | PASS |
| Main branch CI evidence | No pull-request workflow runs are currently returned for merge commit `c97ee5d462c242e2d80aa60885dd13e80cf7058a` | PENDING |
| Main branch protection | GitHub reports `protected=false` and required status checks enforcement `off` | BLOCKED |
| Phase 26.2 deployment foundation | Existing status says implementation complete, but rebased CI and deployment smoke verification remain required | PENDING |

## Deployment gates

These require an actual deployment environment and must not be marked PASS from repository state alone:

- Production PostgreSQL service and credentials
- Production application secrets
- TLS certificate and production DNS/domain
- Razorpay production credentials and webhook verification
- Backup and restore drill
- Production object storage for scalable uploads
- Monitoring and alerting connected to the production deployment

## Merge policy

A production-facing PR is not considered complete until its exact head commit has successful required CI/E2E/security checks. A green check on an older commit is not sufficient evidence after the PR head changes.

When branch protection is enabled, the repository should require the project's CI, Browser E2E, and Dependency Audit checks before merging production-facing changes.

## Next independent engineering priority

Once a clean PR is available, continue with the highest-value repository-verifiable production hardening item. Do not fabricate deployment verification when an external service, credential, DNS record, or GitHub administration setting is required.
