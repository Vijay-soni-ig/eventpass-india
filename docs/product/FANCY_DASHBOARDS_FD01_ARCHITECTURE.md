# FD-01 Fancy Dashboards Architecture

Status: Architecture baseline / implementation gate
Branch: `fd-01-fancy-dashboard-architecture`
Base: `main` at `d944fb6b30881e2935ca11163fd119fa0b7420a6`

## 1. Objective

Define the production architecture for ExhibitTix configurable business-intelligence dashboards before implementing the widget system.

FD-01 is documentation and architecture work. It does not introduce the configurable dashboard UI, dashboard persistence models, or new analytics APIs yet.

## 2. Current-State Audit

### Existing dashboard surfaces

1. Organizer operational dashboard
   - `src/pages/organizer/Dashboard.tsx`
   - Uses `useOrganizerDashboardMetrics()`
   - Shows exhibitions, exhibitors, stalls, visitors, check-ins, attendance, revenue, leads and quick actions.
   - Event list already reads from canonical Event data.
   - Existing metrics still come from the legacy Exhibition-oriented analytics service.

2. Organizer exhibition analytics
   - `src/pages/organizer/analytics/Analytics.tsx`
   - `src/pages/organizer/analytics/EventAnalytics.tsx`
   - Legacy exhibition analytics provides visitor/check-in series, peak entry periods, ticket sales, stall occupancy, revenue and lead/exhibitor analytics.
   - Universal Event analytics provides registrations, tickets, check-ins, ticket revenue and ticket-type data.

3. Platform analytics
   - `server/src/lib/analyticsService.ts`
   - Existing platform dashboard aggregation includes revenue, transactions, organizers, exhibitors, visitors, exhibition status, subscriptions, attention items and recent activity.
   - This is a useful aggregation pattern, but it is not a configurable widget system.

### Existing analytics APIs

- `GET /api/organizer/analytics/dashboard`
- `GET /api/organizer/analytics/exhibitions/:id`
- `GET /api/organizer/event-analytics/:id`
- `GET /api/organizer/event-analytics/:id/participants`

The current API surface is therefore split between Exhibition compatibility analytics and canonical Event analytics.

### Existing authorization

The centralized permission system in `server/src/lib/permissions.ts` already contains:
- `event:view`
- `exhibition:view`
- `payment:view`
- `lead:analytics`
- `lead:view`
- organizer role-specific permissions
- platform-admin wildcard access

Analytics routes already perform server-side organizer scoping through `organizerIdsWithPermission()`.

### Existing module enforcement

`EventModuleEnablement` exists in Prisma and Event analytics currently verifies that the Analytics module is enabled before returning Event analytics.

### Existing persistence

There is currently no Dashboard / DashboardWidget / WidgetDefinition model in Prisma.

## 3. Architectural Finding

The main risk is not the dashboard UI. The main risk is creating a second, inconsistent analytics system.

FD-01 therefore establishes:

**Canonical metrics -> analytics aggregation layer -> widget registry -> dashboard layout**

The configurable dashboard must consume approved analytics metrics rather than embedding business calculations inside individual React widgets.

## 4. Canonical Domain Direction

For new dashboard work:

- Event is the canonical cross-module entity.
- Exhibition remains a legitimate module domain for stalls, floor plans, exhibition participation and compatibility reads.
- New Event-level analytics should prefer Event, EventRegistration, EventTicket*, EventLead and EventModuleEnablement.
- Existing Exhibition analytics should be reused where the metric is still exhibition-specific, but migration should be tracked rather than copied into a second implementation.

No dashboard widget may silently combine legacy and canonical records in a way that can double-count data.

## 5. V1 Personas

### Platform Admin
Scope:
- Entire platform
- Organizers
- Events
- Exhibitors
- Visitors
- Ticketing
- Payments
- Refunds
- Subscriptions
- Platform earnings

### Organizer
Scope:
- Organizer-owned events and their enabled modules
- Revenue only when payment permission allows it
- Lead analytics only when lead analytics permission allows it
- No cross-organizer data

### Exhibitor
V1 configurable dashboard is limited to exhibitor-owned business/event participation data:
- visitors interacted with
- leads
- qualified leads
- follow-ups
- conversions

### Visitor
No BI dashboard is planned for V1.

## 6. Metric Contract

Every metric exposed to a widget must have a defined contract:

- metric ID
- display name
- description
- owner/scope
- source entities
- status filters
- date field
- currency behavior where applicable
- aggregation method
- supported filters
- required permission
- required event module
- data freshness
- null/empty behavior

### Revenue definition

Revenue must distinguish:

- gross revenue
- refunds
- taxes
- payment fees
- net revenue
- organizer revenue
- platform earnings

Do not use a generic `revenue` field when the financial meaning is ambiguous.

The existing platform analytics implementation already treats the Payment table as the financial source of truth for its paid-revenue aggregation. New financial widgets should follow the same principle after confirming compatibility with organizer-level payment/reconciliation rules.

## 7. Initial Metric Registry

### Organizer V1

KPI:
- ORGANIZER_REVENUE
- TICKETS_SOLD
- VISITOR_REGISTRATIONS
- CHECK_INS
- STALL_OCCUPANCY
- LEADS
- LEAD_CONVERSION_RATE

Charts:
- REVENUE_TREND
- TICKET_SALES_TREND
- VISITOR_TREND
- CHECK_IN_TREND
- TICKET_FUNNEL
- LEAD_CONVERSION
- EXHIBITOR_PERFORMANCE
- STALL_OCCUPANCY_TREND

### Platform V1

KPI:
- PLATFORM_GMV
- PLATFORM_REVENUE
- TRANSACTIONS
- ORGANIZERS
- EVENTS
- EXHIBITORS
- VISITORS
- REFUNDS

Charts/tables:
- PLATFORM_REVENUE_TREND
- EVENT_ACTIVITY
- ORGANIZER_ACTIVITY
- EVENT_STATUS_BREAKDOWN
- SUBSCRIPTION_STATUS
- RECENT_ACTIVITY

### Exhibitor V1

KPI:
- VISITORS_INTERACTED
- TOTAL_LEADS
- QUALIFIED_LEADS
- OPEN_FOLLOW_UPS
- CONVERSION_RATE

Charts:
- LEAD_TREND
- LEAD_STATUS_BREAKDOWN
- FOLLOW_UP_STATUS
- EVENT_PERFORMANCE

## 8. Widget Registry Contract

The frontend must not decide widget availability by role alone.

Each widget definition must include:

- `id`
- `name`
- `category`
- `description`
- `allowedRoles`
- `requiredPermissions`
- `requiredModules`
- `defaultSize`
- `supportedFilters`
- `configurationSchema`
- `dataResolver`
- `status`

The backend must validate the same constraints.

Frontend hiding is UX only. It is not authorization.

## 9. Dashboard Persistence

V1 requires persistent per-user/per-scope layouts.

Proposed models:

### Dashboard

- id
- owner type
- owner id
- name
- is default
- createdAt
- updatedAt
- archivedAt if needed

### DashboardWidget

- id
- dashboardId
- widgetType
- x
- y
- width
- height
- configuration JSON
- isVisible
- createdAt
- updatedAt

The exact owner model must preserve tenant boundaries. An organizer dashboard must not be transferable to another organizer by changing an ID.

Widget configuration must be validated server-side against the widget definition. Arbitrary JSON must not become an unrestricted query language.

## 10. Filter Contract

V1 shared filters:

- date range
- event
- ticket type where applicable
- venue/hall where supported
- exhibitor where supported
- stall where supported

Date presets:

- today
- 7 days
- 30 days
- this month
- last month
- this year
- custom range

Every widget must declare which filters it supports.

The dashboard filter context must not imply that unsupported filters were applied.

## 11. API Direction

Proposed dashboard APIs:

- `GET /api/dashboards`
- `POST /api/dashboards`
- `GET /api/dashboards/:id`
- `PUT /api/dashboards/:id`
- `DELETE /api/dashboards/:id`
- `POST /api/dashboards/:id/reset`
- `GET /api/dashboards/:id/widgets`
- `POST /api/dashboards/:id/widgets`
- `PUT /api/dashboards/:id/widgets/:widgetId`
- `DELETE /api/dashboards/:id/widgets/:widgetId`

Analytics APIs should remain metric/data APIs rather than widget-specific SQL endpoints.

Where possible, a dashboard data request should batch approved widget metrics into one server-side aggregation request to avoid N+1 widget queries.

## 12. Performance Architecture

V1 should not introduce a data warehouse prematurely.

Target architecture:

Transactional tables
-> reusable analytics service
-> optimized aggregate queries
-> batched dashboard response
-> widget rendering

For scale, the architecture must leave room for:

Transactional DB
-> analytics/materialized tables
-> dashboard aggregation layer
-> widgets

No widget should execute its own uncontrolled database query.

Long-running analytics queries should be measurable and logged.

## 13. Security Requirements

P0:

- RBAC
- tenant isolation
- organizer ownership checks
- exhibitor ownership checks
- Event module enforcement
- widget permission enforcement
- IDOR/BOLA protection
- server-side configuration validation
- date-range abuse protection
- rate limiting where required
- no sensitive financial data to unauthorized roles
- audit logging for dashboard configuration changes if persistence is introduced

Changing an event ID, organizer ID, dashboard ID or widget ID in a request must never expose another tenant's analytics.

## 14. Data Correctness Rules

Dashboard values must reconcile against source-of-truth records.

Examples:

Ticket revenue:
- paid payments/orders
- minus refunds where applicable
- clearly identify gross vs net

Check-ins:
- valid EventTicketCheckIn records
- duplicate check-ins excluded according to business rules

Stalls:
- total stalls
- confirmed/sold
- reserved
- available
- cancelled/expired where relevant

Leads:
- active/non-archived leads
- status-based counts
- conversion denominator explicitly defined

Every metric must document its denominator. A label such as "conversion rate" is not sufficient without defining what counts as a conversion and what population is measured.

## 15. UX Requirements

Default dashboard:
- useful out of the box
- no blank BI canvas
- role-appropriate widgets
- consistent KPI cards
- clear date/filter context
- visible data freshness
- responsive layout

Customize mode:
- Add widget
- Remove widget
- Reorder
- Resize
- Hide/show
- Reset to default

Widget states:
- loading
- empty
- error
- no permission
- module disabled
- stale/processing data where applicable

Accessibility:
- keyboard-accessible customization
- meaningful chart summaries
- non-color-only status communication
- adequate contrast
- responsive/mobile fallback
- accessible data tables for important chart information

## 16. Explicit V1 Non-Goals

Do not build in FD-01/V1:

- arbitrary SQL/custom query builder
- custom calculated formulas
- AI forecasting
- predictive analytics
- data warehouse
- scheduled report automation
- advanced cohort analysis
- multi-currency analytics
- multi-country analytics
- unrestricted custom BI designer

These can be later phases.

## 17. Required Dependencies

Before FD-02 implementation:

1. Complete/confirm the Event canonical read migration for metrics that should no longer depend on Exhibition.
2. Confirm payment/reconciliation source-of-truth rules for organizer revenue.
3. Confirm Event module enum includes the Analytics module used by the route.
4. Confirm organizer/exhibitor authorization helpers cover dashboard scope.
5. Inventory existing analytics tests and identify missing metric reconciliation tests.

## 18. FD-01 Acceptance Criteria

FD-01 is complete when:

- current dashboard surfaces are inventoried
- current analytics APIs are inventoried
- legacy Exhibition vs canonical Event responsibilities are documented
- metric ownership/source-of-truth rules are documented
- persona scope is defined
- widget registry contract is defined
- dashboard persistence model is defined
- filter contract is defined
- RBAC/module enforcement requirements are defined
- performance strategy is defined
- V1 widget scope is defined
- explicit non-goals are documented
- implementation dependencies are identified
- no configurable dashboard code has been added prematurely

## 19. Recommended Implementation Sequence After FD-01

FD-02: Canonical Metric Foundation
1. Inventory/reconcile existing metric implementations.
2. Identify duplicate calculations.
3. Define metric IDs and contracts.
4. Move reusable calculations into a stable analytics service.
5. Add reconciliation tests.

FD-03: Widget Registry
1. Define typed registry.
2. Add role/permission/module metadata.
3. Add configuration schemas.
4. Add registry tests.

FD-04: Dashboard Persistence
1. Add Dashboard model.
2. Add DashboardWidget model.
3. Add migrations.
4. Add scoped CRUD.
5. Add authorization tests.

FD-05+: Build the approved widgets incrementally.

## 20. Architecture Decision

**Decision:** Fancy Dashboards will be a configurable presentation layer over a canonical analytics/metric layer, not a separate analytics implementation.

**Decision:** Event is the canonical cross-module scope for new analytics, while Exhibition remains supported for legitimate exhibition-module data and migration compatibility.

**Decision:** Widget definitions are centrally registered and permission/module aware.

**Decision:** V1 uses approved metrics and configurations only. It does not expose arbitrary query construction.

**Decision:** Server-side authorization is mandatory for every dashboard and analytics request.

**Decision:** Financial metrics must reconcile against payment/refund/reconciliation source-of-truth rules before being exposed as authoritative dashboard KPIs.
