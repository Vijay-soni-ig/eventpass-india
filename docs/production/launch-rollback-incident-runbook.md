# ExhibitTix Launch, Rollback & Incident Runbook

**Purpose:** make A11 executable for the exact release candidate without pretending deployment infrastructure exists.

## 1. Release candidate

Record before deployment:
- Release commit SHA: <RELEASE_SHA>
- Release time: <UTC_TIMESTAMP>
- Deployed frontend image/tag: <FRONTEND_IMAGE>
- Deployed API image/tag: <API_IMAGE>
- Database migration state: <MIGRATION_SHA_OR_TIMESTAMP>
- Staging smoke run: <RUN_URL>
- CI run: <RUN_URL>
- Browser E2E run: <RUN_URL>
- Dependency audit run: <RUN_URL>

Never deploy an untracked commit.

## 2. Pre-deploy gates

Do not deploy when any P0 exists.

Required repository gates: CI quality PASS; Browser E2E PASS; Dependency Audit PASS; exact release SHA identified; no unexpected database migration; production configuration validated without exposing secrets.

Required external gates: HTTPS/TLS; production CORS; managed PostgreSQL and backups; durable private object storage; production payment provider; monitoring and alerting; branch protection/ruleset; approved change window.

## 3. Deployment sequence

1. Confirm release SHA.
2. Confirm database backup/recovery readiness.
3. Confirm environment variables are present through the deployment secret manager; never commit or print them.
4. Deploy API.
5. Wait for /api/health/ready to report database readiness.
6. Apply Prisma migrations using the release's normal deployment mechanism.
7. Deploy frontend.
8. Verify frontend root returns HTTP 2xx.
9. Run staging/post-deploy smoke checks.
10. Run critical authenticated checks: login, organizer authorization, event access, exhibitor access, visitor public event access.
11. Verify storage access and private-document authorization.
12. Verify payment webhook endpoint health.
13. Verify monitoring receives health/error signals.
14. Record evidence and deployed SHA.

## 4. Immediate rollback triggers

Initiate rollback/change freeze for: API readiness failure that cannot be corrected safely; widespread HTTP 5xx increase; cross-tenant data exposure; payment state corruption or duplicate settlement; webhook signature/processing failure affecting financial state; ticket/stall inventory integrity failure; database migration failure; private-document exposure; authentication/RBAC bypass; data loss or failed recovery verification.

Security or financial-integrity incidents take precedence over availability.

## 5. Application rollback

1. Stop further deployment promotion.
2. Record incident time and current release SHA.
3. Preserve logs/request IDs and relevant payment/webhook IDs.
4. Revert application images to the last verified release.
5. Verify API readiness.
6. Verify frontend.
7. Run critical smoke checks.
8. Reconcile payment/ticket/stall state.
9. Confirm monitoring is healthy.
10. Record the rollback SHA and evidence.

## 6. Database migration safety

Do not blindly run a down migration in production.

For a failed release, determine whether the migration is backward-compatible. If application rollback is safe without DB rollback, roll back application only. If DB state is incompatible, use the approved recovery plan. Restore into an isolated database first when data recovery is required. Validate users, organizers, events/exhibitions, stalls/bookings, tickets/orders, payments/refunds, check-ins, leads, subscriptions/invoices and audit logs. Reconcile financial aggregates before returning traffic.

The repository restore command requires a verified checksum and explicit production confirmation. Use production restore only under approved incident/change control.

## 7. Object-storage recovery

For missing/corrupted production files: stop destructive writes if necessary; identify affected object keys and tenants; verify object-storage version/recovery source; restore to an isolated prefix/bucket first; verify private/public access policy; verify tenant ownership; promote restored objects only after validation.

Never make a private document public as a recovery shortcut.

## 8. Payment incident procedure

If payment integrity is uncertain: do not manually mark payments paid without verified provider evidence; preserve provider order/payment/refund IDs; inspect webhook event IDs and request IDs; run read-only local reconciliation; use provider recovery/reconciliation tooling when credentials are available; verify refunds against the provider ledger; reconcile EventTicketOrder, TicketBooking and StallBooking state; document all manual interventions in the audit trail.

The mock provider must never be used as evidence of production payment success.

## 9. Post-rollback verification

Required: /api/health PASS; /api/health/ready PASS; frontend PASS; authentication PASS; RBAC/tenant isolation PASS; public event PASS; stall availability unchanged except for intentional operations; ticket capacity unchanged except for intentional operations; QR/check-in rejects refunded/invalid tickets; payment reconciliation has no new critical findings; monitoring/alerts PASS.

## 10. Incident closure

Record incident ID, start/end time, affected release SHA, rollback SHA, affected tenants/events, affected payments/orders/refunds, database actions, storage actions, customer impact, root cause, corrective action, evidence links, owner and follow-up deadline.

Do not close a financial/security incident solely because the UI is working again.

## 11. Definition of done for A11

A11 becomes PASS only when this runbook has been exercised against the actual staging/production deployment and the evidence above is recorded.

Repository documentation alone is not deployment evidence.
