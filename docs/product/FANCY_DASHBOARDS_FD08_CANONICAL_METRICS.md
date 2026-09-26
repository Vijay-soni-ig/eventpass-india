# FD-08 — Canonical Dashboard Metric Reconciliation

## Objective
Prevent duplicate or misleading dashboard metrics while ExhibitTix transitions from Exhibition-first storage to the canonical Event model.

## Reconciliation rule
- If an Exhibition has a non-null `eventId`, visitor/ticket metrics use the canonical Event ticket/registration model where available.
- Legacy Exhibition ticket bookings are counted only for Exhibitions with `eventId = null`.
- Stall occupancy and stall-booking revenue remain Exhibition-module metrics because stalls and stall bookings are still Exhibition-owned.
- Event-filtered dashboard metrics must never silently fall back to unrelated legacy exhibitions.

## Delivered
- Organizer gross revenue combines canonical Event ticket orders, legacy ticket bookings for unlinked exhibitions, and stall-booking revenue.
- Organizer attendance combines canonical Event tickets/check-ins and legacy exhibition tickets/check-ins only for unlinked exhibitions.
- This preserves legacy compatibility without double-counting migrated Exhibition events.

## Remaining
- Organizer exhibitor/stall/lead aggregates still use Exhibition-module data by design.
- Platform metrics remain deferred until platform metric definitions are added.
- Trend aggregation remains bounded application-side work and should be revisited at larger scale.

## Acceptance criteria
1. Migrated Exhibitions contribute canonical Event ticket metrics exactly once.
2. Legacy Exhibitions without an `eventId` continue contributing their existing ticket/check-in metrics.
3. Organizer revenue does not double-count migrated event ticket orders.
4. Event-scoped queries remain tenant-bound.
5. Exhibition-only stall and lead workflows remain functional.
