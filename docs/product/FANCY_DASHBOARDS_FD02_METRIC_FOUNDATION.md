# FD-02 Canonical Metric Foundation

Status: Implementation baseline
Branch: `fd-02-canonical-metric-foundation`
Base: `main` after FD-01

## Purpose

Create the first canonical, typed metric registry for Fancy Dashboards without changing existing dashboard behavior.

## Canonical metric IDs

### Organizer
- ORGANIZER_EVENT_COUNT
- ORGANIZER_ACTIVE_EVENT_COUNT
- ORGANIZER_EXHIBITOR_COUNT
- ORGANIZER_STALL_COUNT
- ORGANIZER_STALL_OCCUPANCY
- ORGANIZER_VISITOR_COUNT
- ORGANIZER_CHECKIN_COUNT
- ORGANIZER_ATTENDANCE_RATE
- ORGANIZER_TICKET_REVENUE_GROSS
- ORGANIZER_STALL_REVENUE_GROSS
- ORGANIZER_REVENUE_GROSS
- ORGANIZER_LEAD_COUNT
- ORGANIZER_LEAD_CONVERSION_RATE

### Event
- EVENT_REGISTRATION_COUNT
- EVENT_CONFIRMED_REGISTRATION_COUNT
- EVENT_TICKET_COUNT
- EVENT_CHECKIN_COUNT
- EVENT_CHECKIN_RATE
- EVENT_TICKET_REVENUE_GROSS
- EVENT_TICKET_REVENUE_REFUNDED
- EVENT_TICKET_REVENUE_NET

### Exhibitor
- EXHIBITOR_VISITORS_INTERACTED
- EXHIBITOR_LEAD_COUNT
- EXHIBITOR_CONVERTED_LEAD_COUNT
- EXHIBITOR_OPEN_FOLLOWUP_COUNT
- EXHIBITOR_LEAD_CONVERSION_RATE

## Metric contract

Each registry entry defines:
- metricId
- label
- description
- scope
- source domain
- dateField
- requiredPermission
- requiredModule
- supportedFilters
- unit
- calculation owner

## Rules

1. Event is the canonical cross-module scope for new metrics.
2. Exhibition remains valid for exhibition-only data.
3. Financial metrics must identify gross/refunded/net explicitly.
4. Rates define numerator and denominator.
5. No frontend metric calculation becomes authoritative.
6. Registry metadata is not an authorization substitute. APIs still enforce access.
7. No metric may silently combine Event and Exhibition records if that can double-count an event.
8. Legacy metrics remain available until individually reconciled.

## Immediate implementation scope

FD-02 should introduce:
- typed metric identifiers
- typed metric metadata
- a registry lookup
- validation helpers
- unit tests for registry completeness and metadata consistency

FD-02 should not yet introduce:
- Dashboard/DashboardWidget Prisma models
- drag/drop UI
- arbitrary widget queries
- a new analytics endpoint that changes existing dashboard behavior

## Known migration risks

The existing organizer dashboard still derives several values from Exhibition-oriented tables. In particular, ticket/stall revenue and visitor/check-in counts need explicit reconciliation before they can be treated as Event-canonical metrics.

The Event analytics route currently calculates ticket revenue from EventTicketOrder totals. This must be kept separate from legacy Exhibition ticket revenue until a reconciliation rule is established.

## Acceptance criteria

- Metric IDs are centralized and typed.
- Metadata is centralized and typed.
- Registry entries are unique.
- Required permissions/modules are explicit.
- Rate metrics document denominators.
- Financial metrics identify gross/refunded/net semantics.
- Registry tests cover all entries.
- Existing analytics endpoints remain behaviorally unchanged.
