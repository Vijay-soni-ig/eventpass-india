# FD-06 — Dashboard Data Resolution

## Objective

Turn persisted FD-05 dashboard configurations into a secured, batched dashboard-data response without exposing arbitrary queries or widget-specific SQL endpoints.

## Scope

FD-06 supports the currently registered V1 organizer and exhibitor widgets from FD-03.

Endpoint:

- `GET /api/dashboards/:id/data`

Supported filters:

- `from`
- `to`
- `eventId`
- `ticketTypeId`
- `exhibitorBusinessId`
- `venueId`

The date range defaults to the previous 30 days and is capped at 366 days.

## Security

The dashboard ID is resolved through FD-05 ownership/RBAC checks first.

Additional rules:

1. Event filters must belong to the dashboard's organizer.
2. Event widgets require the widget's declared Event module to be enabled.
3. Only registered widgets are resolved.
4. Hidden/unauthorized widgets are not resolved.
5. Unsupported filters for a widget return a validation error rather than silently pretending the filter applied.
6. Platform dashboard data is explicitly deferred until platform metrics are added to the canonical registry.
7. No arbitrary SQL, formulas, or user-defined query expressions are accepted.

## Response contract

The response contains:

- dashboard ID
- dashboard version
- generation timestamp
- normalized filters
- resolved widget entries
- metric values with units
- numerator/denominator for percentage metrics
- daily series for trend widgets

Widget states:

- `READY`
- `NO_DATA`

## Data correctness

Current FD-06 calculations use:

- canonical Event registration/ticket/check-in/order records for Event widgets;
- Exhibition/Stall compatibility records for exhibition-specific organizer metrics;
- legacy Lead records for the current organizer/exhibitor lead widgets.

Gross and refunded ticket revenue are kept separate before net calculation.

FD-06 does not claim that the legacy Exhibition financial/lead metrics have been fully migrated to Event-canonical sources. That reconciliation remains a tracked architecture task.

## Performance

The endpoint resolves all active dashboard widgets in one request, with bounded date ranges. V1 does not introduce a warehouse or materialized analytics layer.

Trend data is currently grouped in application memory after bounded date-range reads. A future scale phase should replace this with indexed database aggregation/materialized analytics if production volume requires it.

## Non-goals

- dashboard UI/editor
- drag/drop rendering
- platform dashboard data
- arbitrary BI/query builder
- scheduled reports
- predictive/AI analytics
- replacing existing analytics endpoints

## Acceptance criteria

- authenticated dashboard data endpoint exists;
- dashboard owner isolation is enforced;
- Event scope is tenant checked;
- Event module requirements are enforced;
- filter validation is bounded;
- all registered V1 widgets can resolve their declared metric(s) or return an explicit no-data state;
- trend widgets return deterministic daily buckets;
- unsupported filters do not silently pass;
- CI, Browser E2E and dependency audit pass.
