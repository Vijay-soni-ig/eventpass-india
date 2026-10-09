# Production Super Admin Provisioning Runbook

## Status

**Pre-launch control.** Production provisioning remains blocked until this script is reviewed and successfully rehearsed in staging. Never run it against production until the release owner and an independent reviewer approve the change record.

## Security requirements

- Never use `server/prisma/seed.ts` or development seed credentials against production.
- Never add a public signup or API endpoint that grants `super_admin`.
- Do not put passwords, tokens, database URLs, or other secrets in source control, tickets, or logs.
- Use a named operator identity and a separate approver. Use a least-privilege, time-limited database credential from the approved secret manager.
- Ensure a tested backup and rollback/incident process are available before execution.
- The script only permits a first-admin grant when there are zero existing Super Admins. It refuses suspended users, mismatched target email/ID, existing roles, missing confirmations, and same-person operator/approver values.
- The role grant and audit record are in one database transaction. If audit creation fails, the role grant rolls back.

## Required environment variables

Set these only in the approved operator shell/secret-injection mechanism. Never commit values to files.

- `NODE_ENV=production`
- `ADMIN_GRANT_TARGET_USER_ID`: exact immutable user ID verified by two people
- `ADMIN_GRANT_EXPECTED_EMAIL`: verified email for that user ID
- `ADMIN_GRANT_OPERATOR`: attributable operator identity
- `ADMIN_GRANT_APPROVED_BY`: different, independently authorized reviewer
- `ADMIN_GRANT_CHANGE_ID`: approved change/ticket identifier
- `CONFIRM_PRODUCTION_ADMIN_GRANT=GRANT_SUPER_ADMIN_TO:<exact-user-id>`

## Procedure

1. Verify the intended production database/environment and the target account ID/email independently. Do not identify the account by display name alone.
2. Verify the account was created through normal signup and its email/identity is verified.
3. Obtain a tested backup and record the change ID, commit, operator and reviewer.
4. Confirm the operator and approver are different people and have approved this exact target.
5. From `server/`, run `npm run provision:first-super-admin` with the required environment variables injected securely.
6. If the script exits with any error, stop. Do not bypass a guard or improvise direct SQL.
7. Verify the persisted role and the audit record for `platform.super_admin_provisioned`; confirm operator, approver, change ID and target are present. Do not expose secrets in evidence.
8. Start a fresh session for the target account and verify the platform admin route works.
9. Verify a normal account is denied and that revoking a platform role blocks the same still-valid session on its next privileged request.
10. Record evidence and obtain the independent reviewer's sign-off.

## Rollback / failure

- If identity, environment, role state or audit evidence is ambiguous, stop immediately.
- If an incorrect role is granted, revoke it through the approved administrative process, verify privileged access is denied, revoke sessions where supported, and preserve evidence.
- If access cannot be revoked or authorization behavior is unexpected, treat it as a security incident.
- Never delete users or audit records to conceal a failed attempt.

## Staging rehearsal checklist

- [ ] Approved operator and independent reviewer recorded.
- [ ] Intended account is promoted only when no existing Super Admin exists.
- [ ] A second run is refused because a Super Admin already exists.
- [ ] Wrong target ID/email, suspended target, missing confirmation and same-person approval are refused without a role change.
- [ ] Role grant and audit entry succeed atomically.
- [ ] Audit-write failure rolls back the role grant.
- [ ] Authorized admin access succeeds; normal user and revoked role are denied.
- [ ] Rollback/revocation succeeds.
- [ ] CI and authorization regression tests pass on the exact commit.

## Launch gate

A merged script or this runbook is not proof of production readiness. Keep production provisioning **BLOCKED** until code review, exact-head CI, staging rehearsal evidence, backup/recovery verification, and production-owner approval are complete.
