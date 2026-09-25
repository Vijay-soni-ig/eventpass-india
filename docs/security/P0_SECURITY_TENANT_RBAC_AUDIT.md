# P0 Security / Tenant Isolation / RBAC Audit

## Scope

Audit the production launch boundary across authentication, organizer tenancy, exhibitor tenancy, role permissions, event ownership, exhibition compatibility, bookings, payments, tickets, leads, analytics, documents/media, and event-module access.

## Verified controls on current main

- Authentication requires a valid bearer token and server-side auth-session validation.
- Suspended users are rejected by authentication middleware.
- Organizer and exhibitor membership scopes are resolved server-side from active membership rows.
- Suspended organizer/exhibitor tenants are excluded from normal membership authorization.
- Platform admin access is explicit through the platformRole field.
- Universal Event reads/writes intersect requested event IDs with permitted organizer IDs.
- Event category IDs are resolved against active canonical platform categories.
- Existing tests cover organizer payment tenant isolation, analytics isolation, exhibition/floor-plan/booking isolation, event ticket inventory isolation, document authorization, entitlement security, refund security, upload boundaries, auth rate limits, security headers, and ticket ownership.

## P0/P1 hardening completed in this PR

### Tenant owner invariants

Organizer and exhibitor membership management now enforces:

1. Only an existing owner may assign the owner role.
2. An admin cannot modify or remove an owner membership.
3. An active owner cannot be demoted or deactivated when it would leave the tenant without an active owner.
4. The final active owner cannot be deleted.
5. Owner-removal/demotion checks run inside a transaction with a row lock on the tenant record to prevent concurrent requests from both removing the last owner.

## Remaining audit verification

The repository contains broad authorization coverage, but production launch is not considered security-complete until CI and browser E2E verify this branch and the following launch checks are completed:

- Full route-by-route BOLA/IDOR review for every protected resource.
- Cross-organizer and cross-exhibitor negative-path E2E checks for newly added/modified routes.
- Production environment configuration review.
- Production storage access policy review.
- Rate-limit verification against production topology.
- Final dependency/security scan.
- Runtime monitoring and alert verification.

## Launch gate

This PR should merge only after TypeScript/build checks, server security tests, Browser E2E, and dependency audit pass, with no new cross-tenant authorization regression.

Razorpay credentials are not required for this audit. Live Razorpay verification remains a separate external launch dependency.