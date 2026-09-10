# UI-27 Unified UX/UI Phase

## Objective
Bring the Platform Admin, Organizer, Exhibitor and Visitor experiences under one consistent production UX/UI system without changing established business-critical backend behavior.

## Delivery strategy
UI-27 is a targeted production UX pass, not a ground-up redesign. Existing production-quality functionality is classified as **KEEP** and left unchanged. Only **POLISH**, **FIX**, and **BLOCKER** findings are implemented. Working API/data/business logic is reused.

Planning target: **~40 hours**, expected range **32–44 hours**, with **~50 hours as contingency**. The objective is to finish earlier whenever the existing implementation allows it.

## Baseline observed
- Platform dashboard already has KPI cards, date range control, loading skeleton, error/retry state, revenue/activity charts, performance tables, attention items, activity feed, quick actions and platform health.
- Platform shell already has responsive navigation and route-level lazy loading.
- Organizer has a dedicated dashboard shell and event workspace with overview, details, content, applications, floor plan, tickets and attendees, plus exhibitors, stalls, visitors, tickets, check-in, leads, payments, analytics and team routes.
- Exhibitor has dedicated dashboard routes covering business/profile/team, participations/payments, documents, leads, exhibitions, sales, tickets, stalls, attendees, scanner, analytics and settings.
- Visitor has discovery, exhibition detail, booking flow, ticket detail and My Tickets flows, plus saved events and support.
- Global accessibility foundation is already present, including visible focus treatment, skip-link support and reduced-motion handling.
- Shared UI primitives already exist; the first shared-foundation change corrected semantic accent/success badge styling instead of introducing a parallel component system.

## Classification rules
- **KEEP:** production-quality; no unnecessary changes.
- **POLISH:** visually or ergonomically inconsistent but functionally sound.
- **FIX:** real UX/functionality issue that can be corrected within existing product rules.
- **BLOCKER:** P0 issue affecting security, permissions, payments, data integrity, booking/ticket integrity, check-in, or another production-critical path.

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

## Progress
### Completed
- Phase setup and working branch established.
- Initial baseline audit recorded.
- Shared Badge primitive normalized so `accent` uses the semantic accent foreground token and `success` uses the dedicated success token rather than primary styling.

### Verification
- Change is additive to existing Badge variants and preserves the existing variant API.
- Full lint/build execution remains **NOT VERIFIED** in this connector-only step and must be checked by CI/local execution before the affected area is marked PASS.

## Status
**IN PROGRESS**
