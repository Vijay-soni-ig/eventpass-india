# ExhibitTix Production Governance

## Purpose

This document defines the minimum repository and deployment governance required before ExhibitTix is treated as production-ready.

## Main branch policy

The `main` branch is the production integration branch.

Required policy:

1. Changes reach `main` through a pull request.
2. Direct pushes to `main` are disabled.
3. Required pull-request checks are:
   - `CI / quality`
   - `Browser E2E / public-event`
4. A pull request must have all required checks successful before merge.
5. The branch must be up to date with `main` before merge when GitHub branch protection/rulesets are configured to require this.
6. Production changes must use the normal review/merge workflow; emergency changes must still pass the same automated checks as soon as practical.

## Current verification

The repository currently contains both required workflows:

- `.github/workflows/ci.yml` — workflow name `CI`, job `quality`.
- `.github/workflows/e2e.yml` — workflow name `Browser E2E`, job `public-event`.

The connected GitHub integration can confirm repository administration access, but the GitHub branch-protection API currently returns HTTP 403 for this repository. No repository rulesets are currently returned.

Therefore branch protection is **NOT VERIFIED** and must not be represented as enabled until confirmed in GitHub repository settings.

## Staging policy

Before production deployment:

1. Deploy the exact release candidate to a staging environment.
2. Configure production-like database, authentication, CORS, payment, storage, and secrets without using production customer data.
3. Run CI and browser E2E.
4. Exercise health/readiness endpoints.
5. Verify authentication/RBAC and tenant isolation.
6. Verify upload and private-document authorization.
7. Verify payment flows using the provider's test/sandbox environment.
8. Verify rollback/recovery procedures.
9. Record the release candidate commit SHA and test evidence.

A staging environment is not considered verified merely because deployment configuration exists in the repository.

## Production object storage

The application-side S3-compatible storage foundation is implemented, but production storage remains blocked until a real managed bucket is provisioned and verified.

Required evidence:

- durable object storage independent of the application host
- encryption at rest and TLS in transit
- least-privilege credentials
- private-by-default object policy
- lifecycle/retention policy
- versioning or equivalent recovery protection
- storage monitoring/capacity alerting
- checksum-verified migration of existing files
- public asset verification
- tenant-scoped private document verification
- restore/recovery drill

## Monitoring and incident readiness

Production must have external monitoring for:

- API availability
- readiness/health failures
- HTTP 5xx rate
- database connectivity
- payment/webhook failures
- storage failures
- authentication/rate-limit anomalies
- application error rate

Alerts must have an identified operational owner and a documented response path.

## Release gate

PR-01 must remain open until the following are evidenced:

- [ ] Main branch protection/ruleset verified
- [ ] Staging deployment verified
- [ ] Durable production object storage verified
- [ ] Payment production-readiness verified
- [ ] External monitoring and alerting verified
- [ ] Final security/regression audit completed
- [ ] No unresolved P0 production blocker

## Important distinction

Application code can be production-ready while repository or infrastructure governance remains unverified. This document intentionally records those external prerequisites rather than claiming them from repository code alone.
