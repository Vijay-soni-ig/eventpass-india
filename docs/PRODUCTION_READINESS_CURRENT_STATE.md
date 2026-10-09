# ExhibitTix Production Readiness Current State

_Last verified: 2026-10-09_

## Repository baseline

- Default branch: `main`
- Verified `main` commit: `be8f1b5e5ab7761f7846dc2b92c5774745311147`
- Latest merged change on `main`: organizer settings interaction regression coverage (`#521`); all 8 required CI checks passed on exact PR head `a22f600ae0fe98d53c3b38e0d0427c97c8c7d777`.
- Open pull request at verification time: #287 (WhatsApp automation foundation; not a launch gate)
- GitHub `main` branch protection: **ENABLED** (2026-10-03)
- Required status-check enforcement: **ON** for non-administrators (`quality`, 4 backend test shards, Browser E2E `public-event`, `npm audit`, `Migration upgrade path`)

Branch protection was enabled on 2026-10-03 and the repository settings report it as protected. Administrators can still override the required checks, so the normal CI/E2E gates apply to every change regardless.

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
3. TLS certificate and production DNS/domain configuration. **As of 2026-10-03 `exhibittix.com` does not resolve (NXDOMAIN from Google and Cloudflare DNS; the .com registry returns no nameservers), so no production SEO verification has been possible. The Vercel "Production" deployment of `main` exists but is behind Vercel Authentication, so it is not publicly reachable either. Every canonical, sitemap and Open Graph URL in the code assumes `https://exhibittix.com`.**
4. Razorpay production credentials and webhook configuration.
5. Backup and restore drill using the production database configuration.
6. Production object storage and migration away from local filesystem uploads before horizontal scaling.
7. Production monitoring and alerting with an exercised alert path.
8. Staging environment deployment and smoke verification.
9. GitHub `main` branch protection with required checks: enabled 2026-10-03; PR #521 subsequently passed the required checks and merged. The configuration allows administrator override and does not require reviewers.

## Verification rule

A production-readiness item is marked complete only when its required evidence exists. In particular:

- Source code is evidence for implementation, not deployment success.
- CI/E2E results must be tied to the exact commit being evaluated.
- External infrastructure gates require environment-level verification.
- Branch protection requires GitHub repository settings evidence.
- Payment readiness requires real provider configuration or a documented, tested sandbox equivalent where production credentials are unavailable.

## Next independent engineering priorities

When external deployment gates are blocked, continue with repository-verifiable work in this order:

1. Run targeted API security tests against a real staging deployment for BOLA/IDOR, privilege escalation, mass assignment, rate-limit bypass, upload abuse, and sensitive-data exposure; repository review has not identified a confirmed P0-4 defect, but staging evidence is still missing.
2. Provision staging with isolated PostgreSQL, S3-compatible storage, HTTPS/DNS, and secrets; execute the staging smoke workflow and browser E2E suite.
3. Verify production object storage, monitoring/alert delivery, and an isolated backup/restore drill against real infrastructure.
4. Perform credentialed Razorpay sandbox verification when test credentials are available; real-money production launch remains blocked until provider verification is complete.
5. Re-run and record exact-head CI, Browser E2E, and Dependency Audit for each merge candidate.

No production claim should be made until the external gates above are independently verified.
