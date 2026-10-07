# P0 Security / Tenant Isolation / RBAC Audit

**Audit baseline:** `main` at `1a2ade9ae3433fd6b8245788168c466055023436` (2026-10-07)

## Scope

Repository-level verification of authentication, RBAC, organizer/exhibitor tenant isolation, Event ownership, Exhibition compatibility, ticketing, bookings, leads, payments/refunds, analytics, documents/media, venue hierarchy, participant modules, and server-side module enforcement.

This document records repository evidence only. Production infrastructure and provider configuration remain separate launch gates.

## Current evidence inventory

- **83** Express route files under `server/src/routes`.
- **45** backend tests with security/authorization/tenant/ownership focus.
- Protected resource families consistently use authenticated-user-derived organizer or exhibitor scopes rather than trusting a client-supplied tenant ID.
- High-risk child resources generally resolve through an authorized parent boundary before mutation/read.
- Visitor-owned reservations, orders, issued tickets, bookings, and payment access are bound to the authenticated user.
- Universal Event module enforcement is server-side; disabled modules are rejected by API boundaries.
- Platform administration uses explicit `platformRole === "super_admin"` authorization.
- Cross-tenant regression coverage exists for organizer payments/refunds, event ticket inventory, exhibitions/floor plans/bookings, leads/capture contexts, registrations/analytics, memberships, documents, and Universal Event participant families.
- Venue/AVM coverage includes tenant isolation for venues, spaces, and interactive maps, with hierarchy ownership checks in the remaining venue child-resource routes.
- Private participant/exhibitor documents and private media are served through authenticated, tenant-scoped endpoints.

## Security findings

### PASS — Core authorization foundation

`server/src/lib/access.ts` is the canonical scope resolver for organizer and exhibitor permissions. Membership state and tenant suspension are enforced server-side.

### PASS — Universal Event ownership

`server/src/routes/events.ts` intersects Event IDs with organizer IDs derived from the authenticated user's permissions. Child Universal Event resources follow the same parent-first ownership pattern.

### PASS — Visitor ownership

Reservation/order/ticket routes bind reads and mutations to `req.user!.id`. Cross-user resource IDs return non-enumerating 404 responses in the covered paths.

### PASS — Financial ownership

Organizer payment/refund access derives the owning organizer from the persisted payment relationships rather than trusting a supplied organizer ID. Visitor payment access is buyer-scoped.

### PASS — Inventory and check-in boundaries

Ticket inventory is organizer/event scoped. QR check-in verifies event ownership, CHECK_IN module enablement, ticket state, payment state, event availability, and duplicate scans inside a transaction.

### PASS — Leads and participant data

Lead routes constrain event access and exhibitor-business scope. Participant/contact/media/document routes first authorize the Event and then constrain the child resource by its Event/Participant relationship.

### PASS — Venue hierarchy

Venue, building, floor, zone, space, capacity, seating, parking, facilities, entrances, availability, and map operations derive access from organizer membership through the venue hierarchy. Existing AVM tests include cross-organizer isolation for venue, space, and map paths.

### PASS — Platform-admin boundary

Platform routes require the platform-admin role server-side. UI route guards are not treated as the security boundary.

## Remaining items

### NOT VERIFIED — Production data state of legacy TeamMember

The Prisma schema still contains the legacy `TeamMember` / `team_members` model. Repository inspection has not identified an active runtime route or test dependency, but production row counts, historical migration dependencies, exports, support tooling, and rollback requirements have not been verified.

**Decision:** retain the legacy model/table until production-aware migration evidence exists. Do not remove it during this audit.

### EXTERNAL — Production security evidence

The following cannot be marked PASS from repository inspection:

- production S3-compatible storage policy, encryption, lifecycle and public/private access;
- production CORS/TLS/domain configuration;
- distributed rate-limit behavior behind production topology;
- monitoring and alert delivery;
- credentialed Razorpay verification and webhook delivery;
- backup/restore drill;
- branch protection and required-check enforcement in the production repository configuration.

### PARTIAL — Full penetration-test coverage

The repository has broad negative-path regression coverage, but automated tests are not equivalent to a full penetration test. Before launch, run a targeted API security test pass against staging covering BOLA/IDOR, privilege escalation, mass assignment, rate-limit bypass, upload abuse, and sensitive-data exposure.

## P0-4 exit criteria

P0-4 can be considered **repository PASS / production NOT YET PASS** when:

1. no confirmed cross-tenant authorization defect remains in the reviewed high-risk families;
2. critical negative-path regressions remain green on the exact PR head;
3. platform-admin boundaries remain server-enforced;
4. module enforcement remains server-enforced;
5. visitor ownership remains server-enforced;
6. legacy TeamMember production status is explicitly retained as NOT VERIFIED;
7. production-only security dependencies remain explicitly tracked rather than being incorrectly marked complete;
8. exact-head CI, Browser E2E, and Dependency Audit are green for the audit PR;
9. `main` is re-inspected after merge.

## Audit conclusion

**Current repository finding: no confirmed P0-4 IDOR/BOLA defect identified in the reviewed high-risk domains.**

The correct next step is verification and regression hardening, not speculative authorization rewrites. Any newly discovered route-level defect should be fixed with a focused regression test rather than broad refactoring.
