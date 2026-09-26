# FD-12 — Dashboard Permission Matrix & Exhibitor Isolation

## Scope

FD-12 extends FD-11 with database-backed authorization coverage for:

- Organizer dashboard widget visibility across all organizer roles.
- Revenue, registration, stall, and lead permission boundaries.
- Exhibitor-business dashboard read/data/list tenant isolation.

## Verified organizer matrix

| Role | Dashboard widgets visible |
|---|---|
| Organizer Admin | All organizer widgets |
| Operations | Events, attendance, stall occupancy |
| Finance | Events, gross revenue |
| Marketing | Events, attendance, lead conversion |
| Scanner | Events |

The test derives expected visibility from the registered widget permissions and verifies the HTTP response after authentication.

## Verified exhibitor boundary

An exhibitor user from Business B cannot:

- Read Business A's dashboard.
- Resolve Business A's dashboard data.
- List Business A's dashboards by owner ID.

The owning exhibitor can still read its own dashboard.

## Follow-up

The remaining dashboard data-integrity gap is a fixture proving canonical Event data and legacy Exhibition data are counted exactly once during the progressive Event migration.
