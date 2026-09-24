# ExhibitTix Production Readiness Blockers

## Purpose

This document records repository-independent launch gates that cannot be truthfully marked complete from source code alone. It prevents deployment readiness from being inferred from passing CI.

## Repository governance

- **Main branch protection:** BLOCKED until repository administration enables protection on `main` and requires the CI, Browser E2E, and Dependency Audit checks before merge.
- Current observed state: `main` is unprotected and required status-check enforcement is off.

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

- `main`: `3b982ea813fb0b3059d36b973c7be494277b8341`
- PR #179 is merged and its Floor Plan v1 production contract is now part of `main`.
- Open P1 work remains in issue #2 (production readiness/security hardening) and issue #27 (Interactive Floor Plan implementation).
