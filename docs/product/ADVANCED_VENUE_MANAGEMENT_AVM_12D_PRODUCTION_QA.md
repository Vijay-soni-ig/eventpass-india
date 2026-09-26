# AVM-12D — Production QA

Date: 2026-09-26

## Scope

Production QA for Advanced Venue Management integration with Universal Event:

- Event → physical Venue ownership and tenant isolation
- Venue availability / maintenance compatibility with Event dates
- Event publishing readiness
- Exhibition compatibility boundaries
- Public Venue / map exposure
- Regression and security boundaries

## Verified findings

### P1 — Venue-wide scheduling conflict must block publication

Universal Events use date-only `startDate` / `endDate`. AVM availability and maintenance blocks use timestamps.

A venue-wide block is unambiguously incompatible with publishing an Event whose date range overlaps the block. AVM-12D therefore adds a server-side publish guard for:

- Availability: `closed`, `reserved`, `unavailable`
- Maintenance: `scheduled`, `in_progress`
- Scope: venue-wide only (`floorId = null`, `spaceId = null`)
- Archived/completed/cancelled blocks do not block publication.

The Event date range is treated as the full calendar-day interval from start date through end date inclusive.

### Deliberately not enforced

Floor-level and space-level blocks are not treated as Event-wide conflicts.

Reason: an Event currently references a Venue but has no persisted allocation describing which floors/spaces it actually uses. Blocking every Event for a floor/space maintenance record would incorrectly reject valid events using another part of the venue.

This requires a future Event → Venue allocation/usage model before it can be enforced safely.

### Partial-day semantics

Because Event dates are date-only, the platform cannot currently express an Event that uses only part of a day. AVM-12D therefore treats an overlapping venue-wide timestamp block as a conflict whenever it intersects any Event calendar day.

A future event-time/allocation model can make this more precise.

## Security / tenancy

- Event Venue assignment remains restricted to an active, non-archived Venue owned by the Event organizer.
- Availability and maintenance CRUD remains venue-owner scoped through `venue:view` / `venue:manage`.
- Public Venue/map endpoints remain sanitized and module-gated.
- No authorization weakening is introduced by the scheduling guard.

## Regression boundaries

Existing Exhibition-owned commercial domains remain unchanged:

- Stall inventory/pricing/reservations/bookings
- Exhibitor participation
- Exhibition ticket bookings
- Exhibition floor plans/stall geometry
- Exhibition legacy leads/check-ins
- Exhibition payments

The same venue-wide publish guard is applied to the Exhibition live transition so the paired Event cannot become publicly live through the legacy Exhibition path while the physical Venue is closed or under active venue-wide maintenance.

## Remaining AVM-12D / P1 decision

Before launch, product should explicitly decide whether a Venue can host multiple Events simultaneously in different spaces. If yes, an EventVenueAllocation model should be introduced before enforcing floor/space maintenance conflicts.

## Acceptance criteria

- Venue-wide closed/reserved/unavailable block prevents overlapping Event publish.
- Active scheduled/in-progress venue-wide maintenance prevents overlapping Event publish.
- Archived/completed/cancelled/non-blocking records do not block publish.
- Exhibition live transition receives the same protection.
- Existing RBAC and tenant isolation remain intact.
- Existing public Venue/map behavior remains unchanged.
- Regression tests cover blocked and allowed paths.
- CI, Browser E2E and Dependency Audit pass.
