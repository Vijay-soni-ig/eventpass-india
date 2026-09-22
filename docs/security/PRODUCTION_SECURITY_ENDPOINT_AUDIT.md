# Production Security Endpoint Audit

**Audit date:** 2026-09-22  
**Baseline:** `main` at `dd442765558beb53dba96c6388de180a0120adb5`  
**Scope:** Express API authentication, authorization, tenant isolation, request hardening, upload handling, storage access, and security-sensitive transaction boundaries.

## Status

**A1 Security endpoint/code audit: PARTIAL — repository review in progress.**

This document records verified repository evidence. It is not a claim that every production endpoint has been exhaustively penetration-tested.

## Verified controls

### Application-wide request controls

- Express disables `x-powered-by`.
- Production requires `CORS_ORIGINS` to be configured.
- CORS uses an explicit allow-list when configured.
- Production enables HSTS.
- Security headers include CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy and Permissions-Policy.
- Request IDs are generated and returned as `X-Request-Id`.
- JSON request bodies are capped at 1 MB.
- Payment webhook raw bodies are capped at 100 KB.
- The application has a centralized error handler that avoids returning internal error details for 5xx responses.

### Authentication

- Protected API routers use `requireAuth`.
- JWT verification is combined with persisted auth-session validation.
- Suspended users are rejected.
- Platform-admin access requires `platformRole === "super_admin"`.
- Optional authentication does not treat malformed/expired credentials as authenticated.

### Tenant authorization

- Organizer routes use membership-derived organizer IDs rather than trusting a client-supplied organizer ID.
- Exhibition reads and writes use organizer-scoped Prisma queries.
- Exhibitor document reads/downloads/deletes are scoped to business IDs derived from the authenticated user.
- Event-ticket orders and reservations scope ownership to the authenticated user.
- Cross-tenant regression coverage exists for organizer exhibition access and exhibitor participation mutation attempts.

### Mutation hardening

Recent repository changes provide rate limiting across major mutation surfaces including authentication sessions, exhibitions/business flows, floor plans, ticketing, platform administration, organizer payments, check-in, leads/documents, and exhibitor mutations.

### Upload and storage security

- Uploads are restricted to explicitly supported MIME types.
- Uploaded filenames are generated server-side with UUIDs and fixed extensions.
- Uploads are limited to 5 MB and one file per request.
- Uploaded bytes are checked against declared MIME magic bytes.
- Production requires S3-compatible object storage rather than local filesystem storage.
- Private exhibitor documents are served through an authenticated, tenant-scoped download endpoint.
- Public storage access is restricted to an explicit allow-list of public object prefixes.
- Storage path traversal checks are present.

### Ticket reservation / order integrity

- Reservation creation locks the ticket-type row before capacity calculation.
- Expired active reservations are released inside the transaction.
- Reservation ownership is checked against the authenticated user.
- Per-order and per-attendee limits are enforced server-side.
- Order creation locks the reservation row.
- Idempotency keys are supported for reservations and orders.
- Payment/order failure handling attempts to move still-pending records to failed states.

## Remaining A1 work

The following still require explicit endpoint-by-endpoint verification rather than inference from shared middleware:

1. Enumerate every mounted route and HTTP method.
2. Verify every mutation has an intentional authentication/authorization boundary.
3. Verify every resource lookup is tenant/owner scoped where required.
4. Verify every privileged platform route has the expected platform-admin guard.
5. Verify every sensitive mutation has an appropriate rate limit.
6. Verify every file endpoint has the intended public/private exposure.
7. Verify every state-changing financial endpoint has idempotency/concurrency protection where required.
8. Add regression tests for any uncovered authorization or ownership boundary.
9. Run the complete CI, Browser E2E and dependency-audit gates after fixes.

## Findings requiring attention

### F1 — Production readiness evidence baseline is stale

The production-readiness document still references the older JWT-hardening commit as its `main` baseline even though subsequent security-test and documentation commits have been merged.

**Action:** refresh the evidence document after this audit PR is merged.

### F2 — Repository evidence is not production-environment evidence

Staging, production object storage, monitoring/alert delivery, Razorpay credentialed verification, backup/restore, and GitHub branch protection still require external evidence.

These remain separate launch blockers and must not be marked complete from repository inspection alone.

## Exit criteria for A1

A1 is complete only when:

- Every mounted API route is inventoried.
- Each route has an intentional auth/RBAC/tenant classification.
- High-risk routes have regression tests.
- No unexplained cross-tenant access path remains.
- CI, Browser E2E and Dependency Audit are green.
- Findings are recorded with PR/commit evidence.

## Next engineering task after A1

Move to **A2 — organizer/tenant isolation deep audit**, focusing on every resource lookup and mutation that crosses Organizer, ExhibitorBusiness, Event, Exhibition, Stall, Booking, Ticket, Lead, Payment, Document and Analytics ownership boundaries.
