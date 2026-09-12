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
- Global accessibility foundation is already present, including visible focus treatment, skip-link styling and reduced-motion handling.
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
- Floor Plan / Stall Map work is explicitly deferred from UI-27 and must remain independently implementable.

## Progress
### Completed
- Phase setup and working branch established.
- Initial baseline audit recorded.
- Shared Badge primitive normalized so `accent` uses the semantic accent foreground token and `success` uses the dedicated success token rather than primary styling.
- Shared dashboard shell now wires the existing skip-link accessibility foundation to the primary `<main>` region, making keyboard bypass navigation functional across Organizer, Exhibitor and Platform dashboard layouts that consume the shared shell.
- Organizer exhibition deletion was converted from destructive hard delete to a reversible archive/restore lifecycle. Archive state is stored in a dedicated `exhibition_archives` table so existing exhibition, booking, stall, ticket and financial rows remain intact.
- Organizer exhibition UI now exposes Archived state, Archive and Restore actions, and prevents editing/duplicating archived exhibitions.
- Archive mutations preserve tenant/RBAC controls, use concurrency-safe archive/restore transactions, preserve the previous status/visibility for lossless restore, and emit authoritative `exhibition.archived` / `exhibition.restored` audit events.
- Legacy `exhibition.deleted` audit emission is retained on the archive endpoint solely for backward-compatible audit consumers/tests; it does not perform a destructive delete.

## Verification
- GitHub Actions CI run **#165** for commit `cbf573403f6c715da135e79b95929bbe13944de0` completed **SUCCESS** on 2026-09-12.
- CI applied all 26 Prisma migrations, including `20260912100000_exhibition_archive_lifecycle`, successfully.
- Frontend lint completed with **0 errors / 17 warnings**.
- Frontend production build completed successfully.
- Frontend performance budget passed: 167 JS assets, 2.20 MiB total JS.
- Accessibility contract passed across 201 TSX/JSX files.
- Backend TypeScript build completed successfully.
- Backend test suite passed **360/360**, including archive audit compatibility, cross-organizer IDOR, RBAC, stall concurrency, ticket capacity, payments/refunds, QR/check-in, notifications, discovery and subscription lifecycle regressions.
- CI logs show expected database unique-constraint errors during concurrency tests; these are handled by the application/test contract and did not cause test failures.

## Current P0/P1 assessment
- **No remaining UI-27 P0/P1 defect is currently evidenced by repository/CI inspection.** The latest production-critical archive/data-integrity issue has been fixed and the full CI suite is green.
- The next UI-27 work should therefore be targeted polish/hardening rather than speculative rebuilds.
- CI reports **9 server dependency vulnerabilities including 1 critical**, plus frontend dependency vulnerabilities. These are production-hardening findings outside the UI-27 UX scope. They should not be silently upgraded during UI-27 because dependency changes can alter backend/payment behavior; handle as a dedicated dependency/security hardening task with compatibility verification.
- CI also reports non-blocking warnings around Node 20/action deprecation, Prisma configuration deprecation, Fast Refresh lint rules, and stale Browserslist data. None currently blocks the UI-27 branch, but they should be tracked separately.

## Remaining work estimate
- UI-27 original target: **~40h**.
- Current state is **ahead of the original risk profile** because the major data-integrity concern was resolved without a broad rebuild and CI now provides full verification.
- Estimated remaining UI-27 work: **~1–3h** for focused non-floor-plan UX polish/regression review, depending on findings from the final screen-level review.
- Floor Plan / Stall Map implementation is not included in this estimate and remains a separate feature stream.

## Status
**IN PROGRESS - NON-FLOOR-PLAN UI POLISH / FINAL REGRESSION**
