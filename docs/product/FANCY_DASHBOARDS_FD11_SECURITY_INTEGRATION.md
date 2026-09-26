# FD-11 — Dashboard Security & Integration Tests

## Verified boundaries
- Organizer dashboard read/data access is tenant-scoped.
- A user from another organizer cannot read or resolve another organizer's dashboard.
- An organizer cannot use an event belonging to another organizer as a dashboard event filter.
- Event-scoped dashboard widgets honor the Event module enablement boundary.
- Dashboard updates reject stale versions with HTTP 409.

## Why this matters
FD-05/06 implemented the authorization and concurrency mechanisms, but unit/contract tests alone did not prove the database-backed tenant boundary. FD-11 exercises the real HTTP route, authenticated users, Prisma data, and authorization path together.

## Remaining FD-11 scope
- Exhibitor-business cross-tenant dashboard tests.
- Widget-level permission matrix tests for every registered widget.
- Canonical Event versus legacy Exhibition fixture proving migrated data is counted exactly once.
