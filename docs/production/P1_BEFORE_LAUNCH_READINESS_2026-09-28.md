# ExhibitTix P1 Before-Launch Readiness — Evidence Refresh

**Audit date:** 2026-09-28  
**Base:** current `main` at the time of audit  
**Scope:** P1 items 8–20, excluding real payment-provider integration as explicitly deferred.

## Status vocabulary

- **PASS**: repository evidence exists and current CI/test evidence supports the control.
- **PARTIAL**: repository implementation exists, but an important verification boundary remains.
- **BLOCKED / EXTERNAL**: requires a real deployed environment, provider, credentials, device lab, or operational exercise.
- **NOT VERIFIED**: evidence is not sufficient to claim completion.

## P1 matrix

| # | Requirement | Current status | Evidence / remaining gate |
|---|---|---|---|
| 8 | Production object/file storage | PARTIAL / EXTERNAL | S3-compatible adapter, production fail-closed guard, MIME/magic-byte validation and storage tests are merged. Real production bucket, least-privilege credentials, encryption/policy, upload/read/delete and restart verification remain external. |
| 9 | Monitoring, logging, alerting | PARTIAL / EXTERNAL | Health/readiness endpoints, request IDs, structured logs and 15-minute production monitoring workflow exist. External uptime/observability provider, alert destination, ownership and synthetic alert test remain. |
| 10 | Backup + restore drill | PARTIAL / EXTERNAL | Backup/restore scripts and isolated-restore runbook exist. A real production backup and isolated restore drill with measured RTO/RPO has not been performed. |
| 11 | Rate limiting + API security | PASS for repository scope | Critical route inventory and rate-limit regressions are merged. Tenant/authorization/security hardening is also covered by merged PR-01 work and current CI. Production traffic/load behavior remains an operational check. |
| 12 | File-upload security | PASS for repository scope | MIME allowlist, magic-byte validation, 5 MB limits, multipart resource limits, generated keys, private/public separation and object-storage guards are implemented and tested. Real provider integration remains external. |
| 13 | Mobile/responsive QA | NOT VERIFIED for deployed-device scope | Responsive/mobile components and Browser E2E exist, but a representative real-device matrix has not been evidenced. Required: iOS Safari, Android Chrome, small/large mobile, tablet and desktop critical flows. |
| 14 | Accessibility audit | PARTIAL | CI accessibility contract verifies image alt attributes, document language, viewport, skip link and keyboard target constraints. Full WCAG-oriented keyboard, focus, screen-reader and contrast audit is still required on representative production routes. |
| 15 | Performance testing | PARTIAL | CI enforces frontend JS/CSS asset budgets and production-readiness documentation exists. Real Lighthouse/PageSpeed and representative API/load measurements against deployed staging remain. |
| 16 | Refund/reconciliation verification | PARTIAL / PAYMENT DEFERRED | Local payment/refund state-machine reconciliation and refund idempotency/security tests exist. Real provider-side reconciliation is intentionally deferred with payment integration. Mock refund behavior can be regression-tested, but cannot prove provider reconciliation. |
| 17 | Production configuration/environment audit | BLOCKED / EXTERNAL | Repository contains production configuration guards and staging/launch contracts. Actual secret-manager values, origins, storage, database, monitoring, TLS/DNS and runtime configuration require deployment access. |
| 18 | Rollback/runbook/recovery | PARTIAL / EXTERNAL | Executable launch/rollback/incident runbook and backup-recovery procedures exist. A real deployment rollback and isolated recovery exercise remains. |
| 19 | Final permission matrix verification | PARTIAL | Canonical role/permission matrix, tenant boundaries and substantial negative authorization coverage exist. Final route-wide evidence still has known gaps around legacy TeamMember consolidation, visitor ownership coverage and full CRUD/export audit coverage. |
| 20 | 001E Progressive Read Cutover | PASS | Final 001E audit classifies remaining Exhibition references as operational/compatibility ownership and confirms canonical Event reads for universal identity/lifecycle. No remaining 001E read-cutover defect identified. |

## Payment boundary

Real Razorpay integration, real webhook delivery, and provider-side payment/refund reconciliation are deliberately excluded from this P1 pass.

The application-side reconciliation engine must not be interpreted as provider reconciliation. It validates local financial state-machine consistency and is ready to be exercised when a real provider environment is available.

## Repository controls already present

- Production S3 configuration guard.
- File MIME/magic-byte validation.
- Multipart parser/resource limits.
- Critical API rate-limit inventory.
- Auth/session rate limiting.
- Health and readiness endpoints.
- Request correlation IDs.
- Structured request/error logging.
- Production monitoring workflow.
- Backup scripts and restore runbook.
- Payment reconciliation CLI.
- Refund idempotency/concurrency/security tests.
- Accessibility contract.
- Frontend performance budget.
- Canonical RBAC/tenant model and authorization regressions.
- 001E final progressive-read-cutover audit.

## Required external launch evidence

The following cannot be marked PASS from source control alone:

1. Real production/staging S3-compatible storage.
2. Real monitoring/alert destination and synthetic alert.
3. Actual isolated database restore drill with measured RTO/RPO.
4. Real-device responsive QA.
5. Full manual/automated WCAG-oriented accessibility audit.
6. Deployed Lighthouse/PageSpeed and API/load measurements.
7. Production environment/secrets/config verification.
8. Actual rollback exercise.
9. Staging execution of the complete business lifecycle.
10. Final route-wide authorization evidence where the current matrix still says PARTIAL.

## Launch rule

Do not convert an EXTERNAL or NOT VERIFIED item to PASS based on repository tests alone.

The correct next engineering action is to close repository-verifiable gaps first, then execute the external launch-evidence checklist in staging before production.
