# UI-27 Unified UX/UI Phase

## Objective
Bring the Platform Admin, Organizer, Exhibitor and Visitor experiences under one consistent production UX/UI system without changing established business-critical backend behavior.

## Baseline observed
- Platform dashboard already has KPI cards, date range control, loading skeleton, error/retry state, revenue/activity charts, performance tables, attention items, activity feed, quick actions and platform health.
- Platform shell already has responsive navigation and route-level lazy loading.
- Organizer has a dedicated dashboard shell and event workspace with overview, details, content, applications, floor plan, tickets and attendees, plus exhibitors, stalls, visitors, tickets, check-in, leads, payments, analytics and team routes.
- Exhibitor has dedicated dashboard routes covering business/profile/team, participations/payments, documents, leads, exhibitions, sales, tickets, stalls, attendees, scanner, analytics and settings.
- Visitor has discovery, exhibition detail, booking flow, ticket detail and My Tickets flows, plus saved events and support.
- Global accessibility foundation is already present, including visible focus treatment, skip-link support and reduced-motion handling.

## Implementation order
1. Shared design-system contract: typography, spacing, surface hierarchy, tables, forms, status badges, dialogs, drawers, toasts and responsive primitives.
2. Platform/Admin UX: information hierarchy, global search, entity management consistency, filters/sort/bulk-action patterns, status states and operational clarity.
3. Organizer UX: dashboard and event workspace consistency, event setup, venue/hall/stall flows, exhibitors, bookings, ticketing, payments/refunds, check-in, leads and analytics.
4. Exhibitor UX: business profile, applications, stall/payment/invoice workflows, representatives, leads/follow-ups and analytics.
5. Visitor UX: discovery, event detail, ticket purchase, checkout/payment, QR ticket, My Tickets, cancellation/refund and check-in, with mobile-first review.
6. Cross-persona regression: verify navigation, RBAC visibility, loading/error/empty/success states, keyboard access, responsive behavior and critical lifecycle continuity.

## Non-negotiables
- No fake data where real API/data already exists.
- No frontend-only payment success assumptions.
- No weakening of RBAC, tenant isolation, ticket capacity, stall concurrency, refund or check-in rules.
- Important financial/operational records remain archive/soft-delete oriented where applicable.
- Reuse shared components instead of creating visually divergent page-specific controls.
- Do not declare a UI area complete until the relevant UI, API/data wiring, permissions, validation, states, accessibility and regression behavior are verified.

## Status
**IN PROGRESS**

Initial phase setup completed on `ui-27-unified-ux`. Product implementation starts with the shared UX/UI foundation and highest-risk operational screens, then expands across all personas.
