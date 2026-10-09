# ExhibitTix Production Readiness Blockers

## Purpose

This document records repository-independent launch gates that cannot be truthfully marked complete from source code alone. It prevents deployment readiness from being inferred from passing CI.

## Repository governance

- **Main branch protection:** PASS for required-check enforcement. Protection was enabled on 2026-10-03 and exercised by PR #521, which merged only after all 8 required checks passed on its exact head. Force pushes and branch deletion are disabled. Remaining governance risk: administrators can override protections and independent review is not required.

## Deployment infrastructure

The following require a real target environment and credentials before they can be verified:

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

- `main`: `be8f1b5e5ab7761f7846dc2b92c5774745311147` (verified 2026-10-09).
- PR #521 is merged at this baseline; all 8 required checks passed on its exact PR head.
- Repository security/tenant-isolation audit is PASS for reviewed repository scope, but production/staging API penetration verification remains NOT VERIFIED until a real staging target is available.
- Open P1 work remains in issue #2 (production readiness/security hardening) and issue #27 (Interactive Floor Plan implementation).
