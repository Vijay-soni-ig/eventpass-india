# FD-03 — Dashboard Widget Registry

## Objective

Create a typed, server-owned widget registry that sits between the canonical metric registry and dashboard persistence/UI.

Flow:

`Transactional data → canonical metrics → widget registry → dashboard configuration → UI`

## Rules

- Widgets are approved product capabilities, not arbitrary SQL.
- Every widget references one or more canonical metric IDs.
- Scope, role, permission and optional event-module requirements are explicit.
- UI layout defaults live in the registry; persisted dashboards may override position/size only within server validation limits.
- Widget configuration must be validated by the server before use.
- Widget data must be resolved through canonical metric services; widget definitions must not embed raw Prisma queries.
- Hidden/disabled widgets must never bypass authorization through direct API requests.
- V1 supports KPI, progress, trend, breakdown and funnel-style presentation metadata.
- No arbitrary formulas, custom SQL, forecasting, AI-generated metrics or unrestricted BI.

## V1 widget categories

- KPI: single business metric.
- Progress: percentage metric with numerator/denominator.
- Trend: metric over time.
- Breakdown: metric grouped by an approved dimension.
- Funnel: approved conversion sequence.

## Default layout

Desktop uses a 12-column grid. Widget dimensions are bounded to prevent invalid or abusive layouts.

## Acceptance criteria

- Widget IDs are unique and typed.
- Every referenced metric exists in the canonical metric registry.
- Widget scope matches the referenced metric scope.
- Required permissions are explicit.
- Optional required modules are explicit.
- Default width/height are bounded.
- Supported filters are explicit.
- Registry validation fails on duplicate IDs, missing metric references, scope mismatches or invalid dimensions.
- Tests cover registry integrity and representative lookups.
