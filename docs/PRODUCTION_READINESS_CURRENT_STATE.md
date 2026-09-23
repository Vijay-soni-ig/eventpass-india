# ExhibitTix Production Readiness Current State

_Last verified: 2026-09-24_

## Repository baseline

- Default branch: `main`
- Verified `main` commit: `b04a3d464b1f41cabee5f9ff458469f974bb4b9b`
- Latest merged change on `main`: A1 route review evidence ledger (`#174`)
- Open pull requests at verification time: none
- GitHub `main` branch protection: **NOT ENABLED**
- Required status-check enforcement: **OFF**

The absence of branch protection is a repository-governance blocker, not a reason to bypass the normal CI/E2E gates for individual changes.

## Verified repository-level readiness

The repository currently contains documented and implemented foundations for:

- Production frontend/backend container builds.
- Prisma client generation and production migration startup handling.
- Liveness and database-backed readiness endpoints.
- Graceful application shutdown.
- Explicit production CORS configuration.
- Security headers and Express fingerprinting protection.
- Reverse-proxy configuration support.
- Persistent local upload storage for the current single-host deployment model.
- Deployment contract and regression-test documentation.
- JWT/session security policy documentation.
- A1 route-family security matrix and route-review evidence ledger.

These are repository facts. They do not establish that a production deployment has been exercised successfully.

## External production gates

The following remain environment/account dependent and must not be marked complete from source inspection alone:

1. Production PostgreSQL service and credentials.
2. Production application secrets and secure secret delivery.
3. TLS certificate and production DNS/domain configuration.
4. Razorpay production credentials and webhook configuration.
5. Backup and restore drill using the production database configuration.
6. Production object storage and migration away from local filesystem uploads before horizontal scaling.
7. Production monitoring and alerting with an exercised alert path.
8. Staging environment deployment and smoke verification.
9. GitHub `main` branch protection with required CI, Browser E2E, and Dependency Audit checks.

## Verification rule

A production-readiness item is marked complete only when its required evidence exists. In particular:

- Source code is evidence for implementation, not deployment success.
- CI/E2E results must be tied to the exact commit being evaluated.
- External infrastructure gates require environment-level verification.
- Branch protection requires GitHub repository settings evidence.
- Payment readiness requires real provider configuration or a documented, tested sandbox equivalent where production credentials are unavailable.

## Next independent engineering priorities

When external deployment gates are blocked, continue with repository-verifiable work in this order:

1. Expand targeted IDOR/BOLA/RBAC and tenant-isolation regression coverage for sensitive route families.
2. Complete the abuse/rate-limit coverage audit and add missing targeted regression tests.
3. Review upload validation and storage boundaries for MIME, size, path, and authorization controls.
4. Add operational logging/readiness regression coverage where source-level evidence is possible.
5. Re-run and record the complete CI, Browser E2E, and Dependency Audit gates for each merge candidate.

No production claim should be made until the external gates above are independently verified.
