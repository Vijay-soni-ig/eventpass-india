# Platform Administrator Production Provisioning Policy

## Current status: BLOCKED for production launch

The repository currently has a development/test seed account (`platform.admin@eventpass.test`) created by `server/prisma/seed.ts`. That seed explicitly uses a reserved `.test` domain and a shared development password. It is not a production administrator-provisioning mechanism.

No public signup, profile-update, or client-supplied role field may grant `platformRole = super_admin`. Do not run the development seed against a production database and do not reuse its credentials.

## Required production control

Before a production environment is opened to real users, the team must implement and rehearse a controlled, out-of-band provisioning procedure for the first platform administrator. The procedure must:

1. Target an existing account whose email has been verified through the operator's approved identity-verification process.
2. Require an explicit production-environment confirmation and fail closed if the environment or target account is ambiguous.
3. Never accept a password, role, or arbitrary user ID from a public HTTP endpoint.
4. Grant only the `super_admin` platform role; it must not alter organizer/exhibitor memberships or business data.
5. Record an auditable operator action with the target user, actor/change authority, timestamp, and reason. If the audit system cannot identify the initiating operator, that limitation must be documented and compensating infrastructure audit evidence retained.
6. Be idempotent, report the exact account changed, and refuse to silently create an account or change more than one user.
7. Include a documented revocation procedure and a verification step proving that demotion blocks platform API access for already-issued, otherwise-valid sessions.
8. Be tested against a non-production database before use.

Preferred implementation is a narrowly scoped, reviewed operator command or deployment runbook—not a publicly reachable bootstrap route or a permanent shared bootstrap secret.

## Authorization behavior

Platform API authorization is enforced server-side by `requireAuth` and `requirePlatformAdmin`. The role is read from the current database user during authentication, rather than trusted from a client-provided role field. A regression test must prove that demoting a user blocks their existing token from platform APIs without requiring token expiry, while leaving ordinary authenticated access intact.

## Launch checklist

- [ ] Reviewed provisioning command/runbook implemented.
- [ ] Provisioning action is auditable and operator identity is attributable.
- [ ] No development seed credentials exist in production.
- [ ] First administrator has MFA or equivalent strong identity protection at the identity provider / access layer, where supported.
- [ ] Existing-session demotion test passes in CI.
- [ ] Provisioning and revocation procedures rehearsed in staging.
- [ ] Production credentials, HTTPS, and deployment access controls verified in the real environment.

This document does not claim that production provisioning, MFA, or any deployment-level control has already been implemented. Until the checklist is satisfied, production administrator provisioning remains a launch blocker.
