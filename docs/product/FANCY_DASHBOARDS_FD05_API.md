# Fancy Dashboards FD-05 — Dashboard API Foundation

## Scope

FD-05 exposes authenticated dashboard persistence APIs on top of the FD-04 storage layer.

Included:
- Dashboard list/create/read/update/archive/restore.
- Dashboard widget create/update/archive.
- Server-side owner resolution for platform, organizer, and exhibitor dashboards.
- RBAC and tenant isolation.
- Widget registry and permission validation.
- Optimistic concurrency using Dashboard.version.
- Default-dashboard uniqueness handled by the database.
- Audit logging for dashboard and widget mutations.
- Archived records are excluded from normal reads.

## Endpoints

- GET /api/dashboards
- POST /api/dashboards
- GET /api/dashboards/:id
- PUT /api/dashboards/:id
- DELETE /api/dashboards/:id
- POST /api/dashboards/:id/restore
- POST /api/dashboards/:id/widgets
- PUT /api/dashboards/:id/widgets/:widgetId
- DELETE /api/dashboards/:id/widgets/:widgetId

The API is intentionally separate from analytics metric execution. Widget data resolution and dashboard UI are subsequent phases.

## Authorization

Owner IDs are never trusted by themselves:
- PLATFORM requires platform-admin authorization.
- ORGANIZER requires active organizer membership with dashboard permission.
- EXHIBITOR requires active exhibitor-business membership with dashboard permission.
- Widget reads are filtered by the caller's current role and every permission required by the widget.
- Dashboard ownership cannot be transferred through update; create a new dashboard instead.
- Every dashboard/widget mutation re-checks ownership to prevent IDOR/BOLA.

## Concurrency

Dashboard writes use version as an optimistic concurrency token. A stale version returns HTTP 409 instead of silently overwriting another user's changes.

Widget mutations increment the parent dashboard version so clients can detect layout/configuration changes.

## Validation

- Dashboard names: 1–100 trimmed characters.
- Widget layout: 12-column grid, non-negative coordinates, bounded width/height.
- Widget type must exist in the FD-03 registry.
- Widget owner role must match the dashboard owner type.
- Widget configuration must be a JSON object no larger than 16 KB.
- Unknown widget types return HTTP 422.
- Invalid payloads return HTTP 400.

## Error semantics

- 400 — malformed payload/query or invalid version shape.
- 401 — unauthenticated.
- 403 — authenticated but not authorized for the owner/widget.
- 404 — dashboard/widget not found or archived outside restore flow.
- 409 — stale version or default-dashboard uniqueness conflict.
- 422 — unsupported widget type/owner-role combination.

## Audit

Mutations write to the existing AuditLog with actor user, action, entity type/id, and relevant metadata.

## Explicit non-goals

- No arbitrary SQL or user-defined analytics queries.
- No visitor dashboards.
- No dashboard data warehouse.
- No frontend drag-and-drop editor.
- No replacement of existing analytics endpoints yet.