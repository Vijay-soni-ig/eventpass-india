# FD-04 — Dashboard Storage

## Objective

Persist user-owned dashboard configurations safely without coupling persistence to widget query logic.

## Data model

### Dashboard

- `id`: UUID primary key.
- `ownerType`: PLATFORM, ORGANIZER or EXHIBITOR.
- `ownerId`: polymorphic owner identifier; null only for the shared platform dashboard.
- `name`: user-facing dashboard name.
- `isDefault`: default dashboard marker.
- `version`: optimistic-concurrency version for future API updates.
- `archivedAt`: soft-delete/archive marker.
- timestamps.

### DashboardWidget

- `id`: UUID primary key.
- `dashboardId`: foreign key to Dashboard, cascade on dashboard deletion.
- `widgetType`: canonical FD-03 widget ID.
- `x/y/width/height`: persisted layout.
- `configuration`: JSON configuration, validated by the API against the widget registry in FD-05.
- `isVisible`: visibility flag.
- `archivedAt`: soft-delete/archive marker.
- timestamps.

## Integrity rules

- Platform dashboards have no owner ID.
- Organizer/exhibitor dashboards require an owner ID.
- Only one active default dashboard is allowed per organizer/exhibitor.
- Only one active shared platform default exists.
- Widget width is 1–12 columns and height is 1–20.
- Widget coordinates cannot be negative and a widget cannot exceed the 12-column grid.
- Dashboard/widget records are soft-archivable.
- Dashboard widget rows cascade when the parent dashboard is physically deleted.
- Dashboard ownership is polymorphic by design; server-side RBAC and tenant resolution are mandatory because SQL foreign keys cannot enforce a polymorphic owner.

## Security

FD-05 must enforce:

1. Owner resolution from authenticated membership, never from a client-supplied owner ID alone.
2. Organizer dashboards may only be read/modified by users with the corresponding organizer permission.
3. Exhibitor dashboards may only be read/modified by users authorized for that exhibitor business.
4. Platform dashboards require platform-admin authorization.
5. Dashboard IDs and widget IDs must be checked for ownership on every mutation to prevent IDOR/BOLA.
6. Widget type and configuration must be validated against FD-03 before persistence.
7. Dashboard changes should be recorded through the existing audit-log mechanism.

## Non-goals

No dashboard API, query execution, analytics calculation, drag-and-drop UI, or migration of existing dashboard screens is included in FD-04.
