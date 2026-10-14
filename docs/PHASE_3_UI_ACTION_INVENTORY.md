# Phase 3 — UI Action Inventory

Scope: primary Organizer, Exhibitor, Visitor, and Platform Admin dashboards plus the public entry points required by those workflows. Payment-provider integration is out of scope. This inventory records controls with explicit behavioral assertions in the browser regression suites; a DOM scan alone is not treated as proof that an action works.

## Result definitions

- **PASS** — expected behavior was asserted successfully in the latest recorded browser run.
- **FAIL** — a behavioral assertion failed.
- **PARTIAL PASS** — only part of the expected behavior was verified.
- **BLOCKED** — test execution was blocked by environment, fixture, or infrastructure.
- **NOT TESTED** — no reliable behavioral evidence exists yet.

A control is not counted as PASS from source inspection alone. Retest results must be updated from the CI run for the current PR head, and then verified on `main`.

## Action inventory

| ID | Persona / page | Control or action audited | Expected behavior | Actual behavior / evidence | Result |
|---|---|---|---|---|---|
| ORG-NAV-01 | Organizer dashboard | Every visible sidebar destination | Each link opens its intended route without 404 or access-denied UI | Covered by `e2e/dashboard-navigation-audit.spec.ts`; latest recorded run before the fixture fix passed this assertion set | PARTIAL PASS |
| ORG-QA-01 | Organizer dashboard | Dashboard quick actions | Quick actions navigate to their intended organizer workflow | Covered by `e2e/dashboard-navigation-audit.spec.ts` | PARTIAL PASS |
| ORG-SEARCH-01 | Organizer header | Search | Non-empty search stays within organizer route space; empty search does not navigate | Covered by `e2e/dashboard-header-actions.spec.ts` | PARTIAL PASS |
| ORG-MENU-01 | Organizer header | Profile, settings, sign out | Profile/settings open the correct workspace; sign out calls logout and clears client session | Covered by `e2e/dashboard-header-menu-actions.spec.ts` | PARTIAL PASS |
| ORG-EVENT-01 | Organizer events list | Open event | Opens the selected universal event overview, not the legacy Exhibition route | Covered by `e2e/organizer-events.spec.ts` | PARTIAL PASS |
| ORG-EVENT-02 | Organizer events list | Edit event | Opens the correct event editor and keeps the universal event route | Covered by `e2e/organizer-events.spec.ts` | PARTIAL PASS |
| ORG-EVENT-03 | Create Event | Type selection, category selection, draft submit and API failure recovery | Type selection reveals details; valid details submit to API and navigate to the created event; invalid required details/date/category are rejected without creating a record; server failures are visible and entered values remain available for retry | Existing tests cover missing required details, reversed dates, missing/nonexistent category and valid create/publish. Added `e2e/organizer-events.spec.ts` coverage for a controlled HTTP 500 during create, asserting visible error, no success message, preserved form values and enabled retry. Keep PARTIAL PASS until current-head Browser E2E passes. | PARTIAL PASS |
| ORG-EVENT-04 | Event overview | Publish action and status | Publish persists and the UI shows PUBLISHED | Create/publish browser flow passed on the final browser run; the resulting event status was asserted. | PASS |
| ORG-ROLE-01 | Organizer event overview/editor | Edit and lifecycle actions for read-only team member | Read-only role cannot see edit, pause, complete, or cancel controls | Covered by `e2e/organizer-events.spec.ts` | PARTIAL PASS |
| ORG-SET-01 | Organizer settings | Profile, notification preferences, appearance | Changes apply and persist; clipboard failure is surfaced | Covered by `e2e/organizer-settings-actions.spec.ts` | PARTIAL PASS |
| ORG-TEAM-01 | Organizer team | Member access and owner protection | Cross-organizer member access is denied; last active owner cannot be removed in violation of policy | Covered by `e2e/organizer-team-permissions.spec.ts` | PARTIAL PASS |
| EXH-NAV-01 | Exhibitor dashboard | Every visible sidebar destination | Links open the intended exhibitor route without 404 or access denied | Covered by `e2e/dashboard-navigation-audit.spec.ts` | PARTIAL PASS |
| EXH-ACT-01 | Exhibitor dashboard | Profile completion, View All, confirmed participation / Browse Exhibitions | Each action opens the correct destination; empty and populated states remain valid | Covered by `e2e/dashboard-navigation-audit.spec.ts` | PARTIAL PASS |
| EXH-PROFILE-01 | Company Profile | Save Changes with invalid required fields | Validation is visible and invalid data is not persisted | Covered by `e2e/dashboard-navigation-audit.spec.ts` | PARTIAL PASS |
| EXH-PROFILE-02 | Company Profile | Cancel | Unsaved edits are discarded and validation state resets | Covered by `e2e/dashboard-navigation-audit.spec.ts` | PARTIAL PASS |
| EXH-UPLOAD-01 | Company Profile | Company logo upload | Unsupported type and files over 2 MB are rejected before upload begins | Covered by `e2e/dashboard-navigation-audit.spec.ts` | PARTIAL PASS |
| EXH-LEAD-01 | Exhibitor lead detail | Lead pipeline and follow-up fields | Updates persist and leads from another business remain isolated | Covered by `e2e/exhibitor-lead-management.spec.ts` | PARTIAL PASS |
| EXH-STATUS-01 | Exhibitor business / bank-tax | Payout availability messaging | UI must not promise unavailable payout functionality | Covered by `e2e/dashboard-navigation-audit.spec.ts`; payment-provider work remains out of scope | PARTIAL PASS |
| EXH-SEARCH-01 | Exhibitor header | Search | Search stays within exhibitor route space; empty search does not navigate | Covered by `e2e/dashboard-header-actions.spec.ts` | PARTIAL PASS |
| EXH-MENU-01 | Exhibitor header | Profile, settings, sign out | Correct workspace navigation; logout clears client session and calls API | Covered by `e2e/dashboard-header-menu-actions.spec.ts` | PARTIAL PASS |
| VIS-AUTH-01 | Visitor registration / login | Signup and session setup | Valid registration returns a usable session; protected routes respect authentication | Covered by dashboard contract, ticket, and platform route-guard specs | PARTIAL PASS |
| VIS-TICKET-01 | My Tickets | View Ticket and event-ticket list recovery | Visitor sees their own ticket and a working detail destination; event-ticket list API failures are visible and retryable | Added `e2e/my-tickets.spec.ts` coverage for repeated 503 responses through automatic query retries, followed by successful manual retry; closure depends on PR Browser E2E evidence. | PARTIAL PASS |
| VIS-TICKET-02 | Event Ticket Detail | QR load and Retry QR code | Temporary QR API errors are announced and retry can recover | Covered by `e2e/my-tickets.spec.ts` | PARTIAL PASS |
| VIS-ACCESS-01 | Visitor / public routes | Direct access to protected admin routes | Non-admin visitor is denied; legacy role flags cannot bypass canonical authorization | Covered by `e2e/platform-admin-auth.spec.ts` | PARTIAL PASS |
| PUB-ANALYTICS-01 | Public homepage / recommendations | Recommendation impression and click telemetry | Invalid event IDs or telemetry API failures must not create uncaught browser exceptions or interrupt browsing | Final public-screen smoke test passed after the telemetry guard was added. Invalid IDs are skipped and telemetry failures are contained. | PASS |
| ADMIN-NAV-01 | Platform Admin dashboard | Every visible sidebar destination | Each link opens its intended platform route without 404 or access denied | Covered by `e2e/dashboard-navigation-audit.spec.ts` | PARTIAL PASS |
| ADMIN-CAT-01 | Platform Admin / event categories | Create category | Valid category is persisted and shown as Active | Covered by `e2e/platform-admin-auth.spec.ts` | PARTIAL PASS |
| ADMIN-CAT-02 | Platform Admin / event categories | Archive, filter archived, restore | Archived item is hidden from active-only list, can be found with archived filter, and restored | Covered by `e2e/platform-admin-auth.spec.ts` | PARTIAL PASS |
| ADMIN-CAT-03 | Platform Admin / event categories | Previous / Next pagination | Native buttons change pages, are disabled at boundaries, and do not use placeholder `href="#"` destinations | Final browser run passed the pagination test: page 1/2, Next to page 2, disabled boundary states, and Previous back to page 1. | PASS |
| ADMIN-CAT-04 | Platform Admin / event categories | Search debounce versus pagination | Initial page render must not reset a user-selected page; pagination resets only when the normalized search term actually changes | Final browser run passed after the debounce fix; pagination no longer races against the initial no-op debounce. | PASS |
| ADMIN-SET-01 | Platform Admin settings | Try again after API failure | Error state is visible and retry triggers another request | Covered by `e2e/platform-admin-auth.spec.ts` | PARTIAL PASS |
| ALL-AFF-01 | All four dashboards | Accessible names, form labels, placeholder links | Visible controls have accessible names, form controls have labels, and links do not use placeholder destinations | Covered by `e2e/dashboard-interactive-affordance-contract.spec.ts` | PARTIAL PASS |
| ALL-LOAD-01 | Public and authenticated pages | Lazy-route loading state | Route transitions show an accessible loading status while lazy content loads | App-level fallback has `role=status` and `aria-live=polite`; full transition behavior requires browser verification | PARTIAL PASS |
| ALL-ERR-01 | Dashboard pages | API failure handling | Errors are visible and recoverable where retry is supported | Explicit assertions exist for account settings, platform settings, QR tickets, and organizer settings clipboard failures; remaining pages require targeted checks | PARTIAL PASS |
| ALL-MOBILE-01 | Public pages | Phone viewport overflow / runtime exceptions | Public pages render without uncaught browser exceptions or horizontal overflow at the tested phone viewport | `e2e/public-screen-smoke.spec.ts` passed on the final browser run across its listed public routes at the tested phone viewport. | PASS |

## Existing regression suites included in the Phase 3 CI gate

- `e2e/dashboard-navigation-audit.spec.ts`
- `e2e/dashboard-interactive-affordance-contract.spec.ts`
- `e2e/dashboard-header-actions.spec.ts`
- `e2e/dashboard-header-menu-actions.spec.ts`
- `e2e/interactive-affordance-contract.spec.ts`
- `e2e/organizer-events.spec.ts`
- `e2e/organizer-settings-actions.spec.ts`
- `e2e/account-settings-actions.spec.ts`
- `e2e/exhibitor-lead-management.spec.ts`
- `e2e/organizer-team-permissions.spec.ts`
- `e2e/my-tickets.spec.ts`
- `e2e/platform-admin-auth.spec.ts`
- `e2e/public-screen-smoke.spec.ts`

## Latest verification record

- Repository: `Vijay-soni-ig/eventpass-india`
- Phase 3 implementation PR: [#602](https://github.com/Vijay-soni-ig/eventpass-india/pull/602) — merged on 2026-10-12.
- Latest verified `main` commit at this audit: `726b278adc9c6447f502854889394423f8d21596`.
- CI: **PASS** — [run](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/38524996936).
- Browser E2E: **PASS** — [run](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/38524997004).
- These green runs confirm the existing regression suite on that exact `main` commit. They do **not** turn inventory rows marked PARTIAL PASS into PASS automatically; a PASS requires an explicit behavioral assertion for the entire expected behavior.

## Remaining Phase 3 closure work

The Phase 3 audit is not fully closed until the remaining partial rows are either covered by a passing behavioral test or recorded as a genuine blocker with reproducible evidence.

| Priority | Remaining gap | Required closure evidence |
|---|---|---|
| P1 | Organizer create-event validation and server-error recovery | Invalid required fields and invalid date/category combinations are rejected; a server failure is visible, no false success is announced, entered values remain available, and retry stays enabled |
| P1 | Organizer/exhibitor/admin navigation and role-specific actions | Every visible destination is visited under the correct role; no dead route, 404, or unauthorized action; results attached to current CI |
| P1 | Organizer settings, team permissions, exhibitor profile and lead actions | Save/cancel, persistence, permission denial, upload validation and cross-tenant isolation assertions pass |
| P1 | Visitor authentication and ticket recovery | Signup/session, protected-route access, ticket ownership, QR failure and retry behavior pass |
| P1 | API error/loading/empty states | Remaining dashboard screens are tested under empty data, loading and controlled API failure; errors are accessible and recovery actions retry |
| P1 | Responsive authenticated dashboards | Organizer, exhibitor, visitor and platform-admin critical flows are checked at desktop, tablet and phone widths, including overflow and unreachable controls |
| P1 | Accessibility | Keyboard operation, visible focus, accessible names/labels, dialog/select behavior and status announcements are verified on the critical flows |
| P1 | Final inventory accuracy | Every row has current evidence and a truthful PASS / FAIL / PARTIAL PASS / BLOCKED / NOT TESTED result; no source-inspection-only PASS |

### Closure rule

Do not label Phase 3 100% complete while any critical workflow remains PARTIAL PASS, BLOCKED, or NOT TESTED. The next audit pass must target only the gaps above, reuse the existing E2E suites, and avoid duplicating coverage that is already green.
