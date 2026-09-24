# ExhibitTix Production Readiness Blockers

## Purpose

This document records repository-independent launch gates that cannot be truthfully marked complete from source code alone. Passing repository tests must not be treated as proof that infrastructure or GitHub administration is ready for production.

## Repository governance

- **Main branch protection: BLOCKED.** Repository administration must enable protection or a ruleset on `main` and require the CI, Browser E2E, and Dependency Audit checks before merge.
- Current observed state on 2026-09-25: no repository rulesets are exposed by the connected GitHub integration, and direct branch-protection inspection is not available to the integration. Do not infer enforcement from successful PR checks.
- A merge is considered governance-compliant only after the protection/ruleset is independently verified.

## Deployment infrastructure

The following require a real target environment, administrative access, or production credentials before they can be verified:

- Production database connectivity and migration/recovery drill
- Production object storage and upload lifecycle
- Production monitoring and alerting target
- Staging environment and deployment smoke test
- DNS/TLS configuration
- Production secrets and key rotation
- Razorpay production credentials and webhook endpoint verification

## Verification rule

Passing repository CI, Browser E2E, and dependency auditing proves repository integrity only. It does not close infrastructure or administration gates. Each external gate must be re-verified against the real target before production launch.

## Current repository baseline

- Current main tip verified from repository history: `98d050612c49a4eb0362adf2c25b2a62a5b20d51`.
- PR #206 is closed after the Event-linking duplicate-exhibition fix; its changes are included in the current main-line history.
- Open P1 work remains in issue #2 (production readiness/security hardening) and issue #27 (Interactive Floor Plan implementation).

## Evidence handling

When a blocker changes, update this document with:
1. the exact repository/environment state observed,
2. the verification method,
3. the date of verification,
4. the evidence required to close the gate.

Do not mark an external dependency complete based only on configuration code, local tests, or a passing CI run.
