# Authorization & Tenant-Isolation Audit

Date: 2026-09-29
Base commit: 1143d045587bd58e70a2c29837557baca7a867ce

## Objective

Audit authorization, tenant isolation, visitor ownership, legacy membership boundaries, and IDOR/BOLA exposure before further product expansion.

## Verified on current main

### Visitor ticket ownership

The following routes were inspected:

- `server/src/routes/eventTicketReservations.ts`
  - `GET /mine` scopes reservations by `userId = req.user.id`.
  - `POST /:id/cancel` resolves the reservation with both `id` and `userId`.
  - Reservation creation always writes `userId = req.user.id`.
- `server/src/routes/eventTicketOrders.ts`
  - Idempotency lookup is scoped by `userId`.
  - Reservation lookup requires both reservation ID and `userId`.
  - Transaction re-checks `current.userId === req.user.id`.
  - `GET /mine` scopes orders by `userId`.
- `server/src/routes/eventTicketsIssued.ts`
  - `GET /mine` scopes tickets by `user_id = req.user.id`.
  - `GET /:id` requires both ticket ID and `user_id`.
  - `GET /:id/qr` requires both ticket ID and `user_id`.

These paths currently implement the expected visitor ownership boundary.

## Verified authorization foundation

`server/src/lib/access.ts` provides:

- platform-admin global access
- organizer membership + permission resolution
- suspended-organizer blocking
- exhibitor membership + permission resolution
- suspended-exhibitor blocking
- confirmed-participation checks for exhibitor exhibition access

This should be treated as the canonical authorization foundation rather than duplicating role checks inside routes.

## Legacy membership finding

The Prisma schema still contains:

- `TeamRole`
- `TeamMemberStatus`
- `TeamMember` mapped to `team_members`
- `User.teamMemberships`

It also contains the current:

- `ExhibitorMemberRole`
- `ExhibitorMemberStatus`
- `ExhibitorMembership` mapped to `exhibitor_memberships`

### Decision

Do **not** drop `team_members` or the Prisma model yet.

Before removal, verify:

1. application runtime references
2. migrations and historical data dependencies
3. seed/test fixtures
4. exports/reporting
5. admin/support tooling
6. background jobs/scripts
7. production row counts and ownership
8. migration/backfill strategy
9. rollback strategy

The old table can only be removed after those checks establish that it is unused or safely migrated.

## Remaining audit matrix

### Visitor

- registrations
- reservations
- ticket orders
- issued tickets
- cancellation/refund requests
- check-ins
- notifications
- saved events/exhibitions
- visitor interactions/preferences
- exports

### Organizer tenant

For every resource keyed by an ID, verify the route derives authorization from the authenticated organizer membership rather than trusting the supplied resource ID:

- events
- exhibitions
- venues
- halls/spaces
- floor plans
- stalls
- stall bookings
- ticket types
- ticket orders/payments/refunds
- exhibitors/participations
- leads
- analytics
- WhatsApp campaigns
- team/member management
- documents/media
- exports

### Exhibitor tenant

Verify business membership boundaries for:

- company profile
- memberships/staff
- event participation
- stall assignment
- leads
- documents
- payments/invoices
- analytics
- visitor exports
- scanner/check-in capabilities

### Super Admin

Verify platform-admin-only operations cannot be reached through ordinary organizer/exhibitor role context or resource-ID substitution.

## Required code-search checks

For every sensitive route, look for:

- `findUnique({ where: { id } })` without tenant ownership
- `findFirst({ where: { id } })` without tenant ownership
- unscoped `findMany()`
- raw SQL queries using only a supplied resource ID
- mutation endpoints that validate role but not tenant
- exports that omit tenant filtering
- archive/restore endpoints without tenant filtering
- approve/reject endpoints without tenant filtering

## Completion criteria

This audit is complete only when:

1. every sensitive route is classified as PASS, FIX REQUIRED, or NOT VERIFIED
2. real authorization defects are fixed
3. regression tests cover cross-tenant access attempts
4. visitor ownership tests cover IDOR/BOLA boundaries
5. legacy TeamMember usage is proven unused or migrated safely
6. CI passes
7. Browser E2E passes
8. Dependency Audit passes
9. the merged result is re-audited from the new `main`

## Current status

- Visitor ticket ownership: VERIFIED for inspected ticket reservation/order/issued-ticket routes
- Authorization helper foundation: VERIFIED
- Legacy TeamMember schema: FINDING / MIGRATION REQUIRED BEFORE REMOVAL
- Full organizer route audit: IN PROGRESS
- Full exhibitor route audit: IN PROGRESS
- Full visitor CRUD/export audit: IN PROGRESS
- Cross-tenant regression suite: PENDING
