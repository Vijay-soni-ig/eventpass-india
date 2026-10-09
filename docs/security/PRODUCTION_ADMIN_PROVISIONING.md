# Production Super Admin Provisioning Runbook

## Status

**Pre-launch control. This document does not prove that production admin provisioning has been implemented or rehearsed.** Production launch remains blocked until the steps below are adapted to the deployed database/authentication setup, reviewed by a second authorized operator, and successfully rehearsed in staging.

## Security requirements

- Never use `server/prisma/seed.ts` or development seed credentials against production.
- Never add a public signup, unauthenticated route, or general-purpose API endpoint that grants `super_admin`.
- Do not place passwords, access tokens, database URLs, or other secrets in source control, issue comments, terminal transcripts, or this runbook.
- Grant the minimum required platform role only to a named, verified account controlled by the business.
- Use an approved secret manager and a time-limited, individually attributable operator identity for any privileged database access.
- Require a second authorized reviewer to verify the target account and exact role change before production execution.
- Preserve an audit trail containing the operator, reviewer, target user ID, change reason, timestamp, and outcome. Never log credentials or session tokens.

## Preconditions

Before running this procedure, the release owner must confirm:

- [ ] The production environment and database are unambiguously identified.
- [ ] A tested backup exists and the documented recovery procedure is available.
- [ ] The target account has been created through the normal account-registration flow and its email/identity has been verified.
- [ ] The target account's immutable user ID and current platform role have been independently checked.
- [ ] The approved, repository-versioned role-change mechanism has been identified. If none exists, stop and implement/review one before changing production data.
- [ ] The change has an approved ticket/change record and a named second reviewer.
- [ ] Audit logging and access to the resulting audit record have been verified.
- [ ] The staging rehearsal passed on the same application revision intended for release.

## Execution procedure

1. Open the approved change record and record the application commit, environment, operator, reviewer, target user ID, and reason for access.
2. Confirm with a second operator that the account belongs to the intended business administrator. Do not select an account by display name alone.
3. Use only the reviewed, least-privilege, out-of-band role-change mechanism approved for the current schema and deployment. Do not improvise SQL or use the development seed.
4. Verify the persisted role by querying through the approved administrative mechanism. Confirm no other user or role was changed.
5. Start a fresh authenticated session for the target account and verify access to the intended platform-admin route.
6. Verify that an ordinary user cannot access that route and that a session whose platform role has been revoked is denied on its next privileged request.
7. Confirm that the role change and any subsequent revocation are recorded in the audit trail without secrets.
8. Record evidence and the final outcome in the change record. The second reviewer must sign off before the change is considered complete.

## Failure and rollback

- If the target identity, environment, persisted role, or audit event is ambiguous, stop immediately. Do not retry with a different account or environment until the discrepancy is resolved.
- If the wrong role was granted, use the approved revocation mechanism immediately, verify that the account loses privileged access, invalidate/revoke sessions if the application supports it, and preserve the incident evidence.
- If privileged access cannot be revoked or authorization behavior differs from expectations, treat it as a security incident and follow the production incident-response process.
- Do not delete the user or erase audit records as a rollback shortcut.

## Required staging rehearsal evidence

- [ ] Approved operator and independent reviewer recorded.
- [ ] Intended account receives the role through the reviewed out-of-band mechanism.
- [ ] The database confirms the intended role and no unintended changes.
- [ ] Privileged route works for the authorized account.
- [ ] Privileged route is denied for a normal user.
- [ ] Removing the role denies access for the same still-valid session/token on the next privileged request.
- [ ] Audit trail records grant and revocation.
- [ ] Rollback/revocation procedure is completed successfully.
- [ ] CI and relevant authorization regression tests pass on the exact commit.

## Launch gate

This runbook is not, by itself, evidence of production readiness. Keep production Super Admin provisioning marked **BLOCKED** until the implementation is reviewed, staging rehearsal evidence is attached to the change record, and the production owner approves the controlled procedure.
