# ExhibitTix A2–A12 Launch Gate Refresh

**Audited main:** 4dfa6d0dfa6a160094baf1fef1798cef6292f344  
**Audit date:** 2026-09-26

This document separates repository-verifiable completion from deployment/credential-dependent launch gates. A repository control is never marked PASS merely because its implementation exists.

## Gate matrix

| Gate | Scope | Repository status | External status |
|---|---|---|---|
| A2 | Organizer/tenant isolation deep audit | **PASS — refreshed** | Production penetration testing remains separate |
| A3 | Production config, secrets, CORS/TLS, durable storage | **PASS — application fail-closed controls present** | **BLOCKED** until real staging/production configuration is verified |
| A4 | Razorpay production readiness | **PASS — provider contract/readiness controls present** | **BLOCKED** until credentialed sandbox/production verification |
| A5 | Payment/refund integrity and reconciliation | **PASS — repository controls present** | Provider-ledger reconciliation requires real credentials/environment |
| A6 | Monitoring/logging/alerting | **PASS — application observability contract present** | **BLOCKED** until external monitoring, alerts and notification routing are verified |
| A7 | Branch protection/governance | **PARTIAL** | **BLOCKED** until GitHub ruleset/branch protection is actually enabled and verified |
| A8 | Performance/accessibility/mobile | **PARTIAL** | Final staging/device verification remains required |
| A9 | Cross-persona regression | **PARTIAL** | Final deployed lifecycle smoke is required |
| A10 | Backup/restore | **PASS — scripts/runbook present** | **BLOCKED** until an actual isolated production-equivalent restore drill is executed |
| A11 | Launch/rollback operations | **PARTIAL** | Final deployment-specific rollback evidence remains required |
| A12 | Final launch gate | **BLOCKED** | Cannot be green while required external gates above remain unverified |

## A2 current-state evidence

Historical A2 closure existed before the newer Universal Event participant child-resource surface. The current refresh adds cross-organizer negative-path regression coverage for participant contacts, participant media, event sessions, sponsor packages, and sponsor profiles.

Organizer A attempts to read, update, or archive Organizer B resources through Universal Event identifiers and receives non-success responses. The test also asserts the protected records remain unchanged.

PR #276.

## A3 repository evidence

Production application startup already fails closed when production storage is not S3, required S3 configuration is missing, or production CORS origins are absent. Production compose passes database, authentication, CORS, payment-provider and S3 configuration through environment variables.

External completion still requires a real HTTPS staging/production deployment, secret provisioning, durable object storage, CORS/TLS verification and tenant-scoped private-object verification.

## A4 repository evidence

The repository already contains provider abstraction, Razorpay adapter, checkout signature verification, raw-body webhook signature verification, webhook event deduplication, centralized payment state transitions, refund state machine, production rejection of mock payment provider, provider order/refund recovery and reconciliation paths.

Credentialed Razorpay execution is intentionally not simulated and remains external.

## A5 repository evidence

Payment integrity currently includes server-side payment settlement, provider payment/order references, idempotent webhook event recording, terminal-state protection, booking/order state synchronization, refund row locking, refund idempotency, succeeded-refund total reconciliation, stale-payment detection, provider order recovery, and provider refund reconciliation.

The reconciliation CLI exits non-zero when local financial-integrity findings exist.

## A6 repository evidence

Application observability includes X-Request-Id, structured HTTP completion events, structured production-safe error logging, liveness/readiness endpoints, and documented payment/reconciliation monitoring signals.

External centralized logs, uptime checks, alert delivery and on-call routing are not inferred from repository code.

## A7 external gate

Production governance requires PR-only changes, no direct pushes to main, required CI and Browser E2E checks, and an up-to-date branch before merge where configured.

Current GitHub branch-protection/ruleset state must be verified in repository settings before this gate can be marked PASS.

## A8/A9 final verification

Repository CI already exercises frontend lint/build, performance/accessibility contracts, backend tests, Browser E2E and dependency auditing. Existing regression coverage spans major RBAC, tenant, booking, payment, participant, check-in and public-event workflows.

Before launch, staging must still verify the integrated lifecycle on the exact release candidate across:

**Organizer → Event → Exhibitor → Stall → Payment → Visitor → Ticket → Payment → QR → Check-in → Lead → Analytics**

The final run must cross-check UI, API responses and database state.

## A10 recovery

Backup/recovery scripts and the production recovery runbook are present. The actual drill remains unverified until a backup is restored into an isolated production-equivalent database and the required business records and financial aggregates are reconciled.

## A11 operational readiness

The repository contains production deployment, staging smoke, backup/recovery, monitoring and governance documentation. Final launch operations still require deployment-specific rollback command/procedure, release SHA, database migration rollback/recovery procedure, object-storage recovery procedure, incident owner, payment reconciliation procedure, and post-deploy smoke checklist.

## A12 launch rule

A12 is **not PASS** until all required external evidence exists. No mock, local-only, repository-only or assumed evidence may be substituted for staging health, durable production object storage, credentialed Razorpay verification, production CORS/TLS, external monitoring and alerting, GitHub branch protection, an actual backup/restore drill, and the final cross-persona release-candidate smoke test.

## Fastest path

Blocked gates should be skipped during repository engineering rather than repeatedly reimplemented:

**A2 refreshed → repository A5/A6/A8/A9 hardening → A11 runbook → final A12 audit → execute external A3/A4/A6/A7/A10 gates when infrastructure/credentials are available.**

This is an evidence ledger, not a declaration that production is already launch-ready.
