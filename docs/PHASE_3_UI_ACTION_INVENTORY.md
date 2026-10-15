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
| ORG-NAV-01 | Organizer dashboard | Every visible sidebar destination | Each link opens its intended route without 404 or access-denied UI | PR #640 Browser E2E passed with non-empty main content, generic route-error rejection, exact access-denied check, URL retention and uncaught `pageerror` assertions for each visible sidebar destination. | PASS |
| ORG-QA-01 | Organizer dashboard | Dashboard quick actions | Quick actions navigate to their intended organizer workflow | Current PR #653 Browser E2E passed `e2e/dashboard-navigation-audit.spec.ts`, which opens each quick action and rejects 404/access-denied destinations. | PASS |
| ORG-SEARCH-01 | Organizer header | Search | Non-empty search stays within organizer route space; empty search does not navigate | PR #653 Browser E2E passed `e2e/dashboard-header-actions.spec.ts` assertions for non-empty organizer search and whitespace-only input. | PASS |
| ORG-MENU-01 | Organizer header | Profile, settings, sign out | Profile/settings open the correct workspace; sign out calls logout and clears client session | PR #653 Browser E2E passed `e2e/dashboard-header-menu-actions.spec.ts` route/logout assertions plus keyboard open, Escape dismissal, and focus-return checks. | PASS |
| ORG-EVENT-01 | Organizer events list | Open event | Opens the selected universal event overview, not the legacy Exhibition route | PR #653 Browser E2E passed `e2e/organizer-events.spec.ts` route and universal workspace assertions for a non-Exhibition event. | PASS |
| ORG-EVENT-02 | Organizer events list | Edit event | Opens the correct event editor and keeps the universal event route | PR #653 Browser E2E passed `e2e/organizer-events.spec.ts` editor route, heading, module visibility, and legacy-route exclusion assertions. | PASS |
| ORG-EVENT-03 | Create Event | Type selection, category selection, draft submit and API failure recovery | Type selection reveals details; valid details submit to API and navigate to the created event; invalid required details/date/category are rejected without creating a record; server failures are visible and entered values remain available for retry | Current merged `main` Browser E2E run for PR #639 passed, including controlled HTTP 500 coverage, visible error, no success message, preserved values, and enabled retry. Existing cases cover missing required fields, reversed dates, missing/nonexistent category and valid create/publish. | PASS |
| ORG-EVENT-04 | Event overview | Publish action and status | Publish persists and the UI shows PUBLISHED | Create/publish browser flow passed on the final browser run; the resulting event status was asserted. | PASS |
| ORG-ROLE-01 | Organizer event overview/editor | Edit and lifecycle actions for read-only team member | Read-only role cannot see edit, pause, complete, or cancel controls | PR #653 Browser E2E passed UI visibility assertions in `e2e/organizer-events.spec.ts`; merged PRs #642/#643 cover direct mutation API denial. | PASS |
| ORG-SET-01 | Organizer settings | Profile, notification preferences, appearance | Changes apply and persist; clipboard failure is surfaced | PR #653 Browser E2E passed `e2e/organizer-settings-actions.spec.ts` persistence, API save failure, and clipboard failure assertions. | PASS |
| ORG-TEAM-01 | Organizer team | Member access and owner protection | Cross-organizer member access is denied; last active owner cannot be removed in violation of policy | PR #645 Browser E2E passed cross-organizer access denial, denied cross-tenant role changes/removal, and last-owner demotion/removal protection. | PASS |
| ORG-TEAM-02 | Organizer team | Remove team member | Removal requires explicit confirmation; Cancel leaves membership intact; confirmation removes membership in UI and API | PR #645 Browser E2E passed confirmation dialog, cancel/no-mutation assertion, and confirmed removal persistence assertion. | PASS |
| EXH-NAV-01 | Exhibitor dashboard | Every visible sidebar destination | Links open the intended exhibitor route without 404 or access denied | PR #640 Browser E2E passed with non-empty main content, generic route-error rejection, exact access-denied check, URL retention and uncaught `pageerror` assertions for each visible sidebar destination. | PASS |
| EXH-ACT-01 | Exhibitor dashboard | Profile completion, View All, confirmed participation / Browse Exhibitions | Each action opens the correct destination; empty and populated states remain valid | PR #653 Browser E2E passed `e2e/dashboard-navigation-audit.spec.ts` checks for profile completion, View All, and populated/empty participation destinations. | PASS |
| EXH-PROFILE-01 | Company Profile | Save Changes with invalid required fields | Validation is visible and invalid data is not persisted | `e2e/dashboard-navigation-audit.spec.ts` asserts required-field validation and unchanged persisted company name. | PASS |
| EXH-PROFILE-02 | Company Profile | Cancel | Unsaved edits are discarded and validation state resets | `e2e/dashboard-navigation-audit.spec.ts` asserts Cancel restores the persisted company name and clears invalid state. | PASS |
| EXH-PROFILE-03 | Company Profile | Save Changes with API failure | API failure is visible; no false success is shown; unsaved values remain available for correction and retry | PR #646 Browser E2E passed on head `0075f168`: the test fills all required fields, injects HTTP 500 for PUT /api/business, asserts the visible error, absence of success feedback, preserved edited value, and enabled retry. | PASS |
| EXH-UPLOAD-01 | Company Profile | Company logo upload | Unsupported type and files over 2 MB are rejected before upload begins | `e2e/dashboard-navigation-audit.spec.ts` asserts GIF and >2 MB files produce validation errors and no uploading state. | PASS |
| EXH-LEAD-01 | Exhibitor lead detail | Lead pipeline and follow-up fields | Updates persist and leads from another business remain isolated | PR #653 Browser E2E passed status/priority/notes/follow-up persistence, cross-business update denial, and visible save-failure recovery in `e2e/exhibitor-lead-management.spec.ts`. | PASS |
| EXH-STATUS-01 | Exhibitor business / bank-tax | Payout availability messaging | UI must not promise unavailable payout functionality | PR #653 Browser E2E passed `e2e/dashboard-navigation-audit.spec.ts` assertions that dashboard and profile do not promise unavailable payout processing. Payment-provider work remains out of scope. | PASS |
| EXH-SEARCH-01 | Exhibitor header | Search | Search stays within exhibitor route space; empty search does not navigate | PR #653 Browser E2E passed `e2e/dashboard-header-actions.spec.ts` assertions for non-empty exhibitor search and whitespace-only input. | PASS |
| EXH-MENU-01 | Exhibitor header | Profile, settings, sign out | Correct workspace navigation; logout clears client session and calls API | PR #653 Browser E2E passed `e2e/dashboard-header-menu-actions.spec.ts` route/logout assertions plus keyboard open, Escape dismissal, and focus-return checks. | PASS |
| VIS-AUTH-01 | Visitor registration / login | Signup and session setup | Unauthenticated deep link redirects to auth; signup preserves the protected destination; valid session survives reload; protected routes respect authentication | PR #647 Browser E2E passed on head `2b8cc27`: direct /my-tickets access redirects to auth, signup returns to the intended route, and the session remains valid after reload. | PASS |
| VIS-TICKET-01 | My Tickets | View Ticket and event-ticket list recovery | Visitor sees their own ticket and a working detail destination; event-ticket list API failures are visible and retryable | `e2e/my-tickets.spec.ts` passed in the PR #640 Browser E2E run: list failure is announced, manual retry recovers, ticket ownership is enforced, and View Ticket reaches the detail page. | PASS |
| VIS-TICKET-02 | Event Ticket Detail | QR load and Retry QR code | Temporary QR API errors are announced and retry can recover | `e2e/my-tickets.spec.ts` passed in the PR #640 Browser E2E run: injected QR 503 is announced and Retry QR code loads the QR image successfully. | PASS |
| VIS-ACCESS-01 | Visitor / public routes | Direct access to protected admin routes and platform APIs | Non-admin visitor is denied by UI and server for protected reads and writes; legacy role flags cannot bypass canonical authorization | PR #655 Browser E2E passed direct visitor 403 assertions for GET categories, GET settings, POST category, and PATCH settings, plus UI route denial when a legacy `platformAdmin` flag is present without canonical `platformRole`. | PASS |
| PUB-ANALYTICS-01 | Public homepage / recommendations | Recommendation impression and click telemetry | Invalid event IDs or telemetry API failures must not create uncaught browser exceptions or interrupt browsing | Final public-screen smoke test passed after the telemetry guard was added. Invalid IDs are skipped and telemetry failures are contained. | PASS |
| ADMIN-NAV-01 | Platform Admin dashboard | Every visible sidebar destination | Each link opens its intended platform route without 404 or access denied | PR #640 Browser E2E passed with non-empty main content, generic route-error rejection, exact access-denied check, URL retention and uncaught `pageerror` assertions for each visible sidebar destination. | PASS |
| ADMIN-CAT-01 | Platform Admin / event categories | Create category | Valid category is persisted and shown as Active | PR #653 Browser E2E passed `e2e/platform-admin-auth.spec.ts` creation and reload-persistence assertions. | PASS |
| ADMIN-CAT-02 | Platform Admin / event categories | Archive, filter archived, restore | Archived item is hidden from active-only list, can be found with archived filter, and restored | PR #653 Browser E2E passed `e2e/platform-admin-auth.spec.ts` reload-persistence assertions for archive and restore lifecycle states. | PASS |
| ADMIN-CAT-03 | Platform Admin / event categories | Previous / Next pagination | Native buttons change pages, are disabled at boundaries, and do not use placeholder `href="#"` destinations | Final browser run passed the pagination test: page 1/2, Next to page 2, disabled boundary states, and Previous back to page 1. | PASS |
| ADMIN-CAT-04 | Platform Admin / event categories | Search debounce versus pagination | Initial page render must not reset a user-selected page; pagination resets only when the normalized search term actually changes | Final browser run passed after the debounce fix; pagination no longer races against the initial no-op debounce. | PASS |
| ADMIN-CAT-05 | Platform Admin / event categories | Category list API failure, accessible announcement and retry | Failure is announced through an alert role; Try again reloads the category list and restores usable controls | PR #655 Browser E2E passed injected 503, visible retry, another GET request, cleared error, and recovered category controls. This follow-up adds an explicit `role="alert"` assertion. | PARTIAL PASS |
| ADMIN-SET-01 | Platform Admin settings | Try again after API failure | Error state is visible and retry triggers another request and recovers to usable settings | PR #653 Browser E2E passed the retry-recovery test merged in PR #652 and the new label/save/reset/failure assertions in PR #653. | PASS |
| ALL-AFF-01 | All four dashboards | Accessible names, form labels, placeholder links | Visible controls have accessible names, form controls have labels, and links do not use placeholder destinations | Covered by `e2e/dashboard-interactive-affordance-contract.spec.ts` | PARTIAL PASS |
| ALL-LOAD-01 | Public and authenticated pages | Lazy-route loading state | Route transitions show an accessible loading status while lazy content loads | App-level fallback has `role=status` and `aria-live=polite`; full transition behavior requires browser verification | PARTIAL PASS |
| ALL-ERR-01 | Dashboard pages | API failure handling | Errors are visible and recoverable where retry is supported | Explicit assertions exist for account settings, platform settings, QR tickets, and organizer settings clipboard failures; remaining pages require targeted checks | PARTIAL PASS |
| ALL-MOBILE-01 | Public pages | Phone viewport overflow / runtime exceptions | Public pages render without uncaught browser exceptions or horizontal overflow at the tested phone viewport | `e2e/public-screen-smoke.spec.ts` passed on the final browser run across its listed public routes at the tested phone viewport. | PASS |
| ALL-MOBILE-02 | Authenticated dashboards | Phone viewport content and horizontal overflow | Organizer, exhibitor, visitor, and platform admin pages render meaningful content at 390px without horizontal overflow or uncaught browser errors | PR #644 Browser E2E passed authenticated phone-width checks for all four personas, including meaningful content, overflow, and uncaught page-error assertions. | PASS |

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
- PR #646: **MERGED** — [PR](https://github.com/Vijay-soni-ig/eventpass-india/pull/646), merge commit `aae351437e5b3412711122edc02c9f5b9639b026`. PR-head CI: **PASS** — [run](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/38693378670); Browser E2E: **PASS** — [run](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/38693378702); Dependency Audit: **PASS** — [run](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/38693378662). Post-merge `main` checks are separate and must finish before claiming main-branch verification.
- PR #639 CI: **PASS** — [run](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/38563630649).
- PR #639 Browser E2E: **PASS** — [run](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/38563630970).
- PR #639 Dependency Audit: **PASS** — [run](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/38563630370).
- PR #640 CI: **PASS** — [run](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/38566173698).
- PR #640 Browser E2E: **PASS** — [run](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/38566173600).
- PR #640 Dependency Audit: **PASS** — [run](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/38566173611).
- PR #644 CI: **PASS** — [run](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/38583101817).
- PR #644 Browser E2E: **PASS** — [run](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/38583101819).
- PR #644 Dependency Audit: **PASS** — [run](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/38583101861).
- PR #645 CI: **PASS** — [run](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/38587054901).
- PR #645 Browser E2E: **PASS** — [run](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/38587054931).
- PR #645 Dependency Audit: **PASS** — [run](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/38587054905).
- CI: **PASS** — [run](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/38524996936).
- Browser E2E: **PASS** — [run](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/38524997004).
- PR #647: **MERGED** — [PR](https://github.com/Vijay-soni-ig/eventpass-india/pull/647), merge commit `1f03a7a74bcabc32c4fc5deda80f2f512f7b1c64`. CI: **PASS** — [run](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/38699365986); Browser E2E: **PASS** — [run](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/38699365611); Dependency Audit: **PASS** — [run](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/38699365960). The visitor signup/session scenario is now PASS based on that exact Browser E2E run.
- PR #655: **MERGED** — https://github.com/Vijay-soni-ig/eventpass-india/pull/655, merge commit `fd378ad854aec7a03cc8f24d251ff3aec59b9b25`. CI (all 8 checks): **PASS** on head `2e0ae49379c7ad8f8dcb09e5f89f05e9ae162d9f`; Browser E2E: **PASS** — https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/38724872182; Dependency Audit: **PASS** — https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/38724872060.
- These green runs confirm the existing regression suite on that exact `main` commit. They do **not** turn inventory rows marked PARTIAL PASS into PASS automatically; a PASS requires an explicit behavioral assertion for the entire expected behavior.

## Remaining Phase 3 closure work

The Phase 3 audit is not fully closed until the remaining partial rows are either covered by a passing behavioral test or recorded as a genuine blocker with reproducible evidence.

| Priority | Remaining gap | Required closure evidence |
|---|---|---|
| P1 | Organizer/exhibitor/admin role-specific actions and mutation permissions | Verify representative owner/admin/read-only action visibility and API authorization; test unauthorized direct API calls, not only hidden controls |
| P1 | Organizer/exhibitor/admin navigation and role-specific actions | Every visible destination is visited under the correct role; no dead route, 404, or unauthorized action; results attached to current CI |
| P1 | Organizer settings, team permissions, exhibitor profile and lead actions | Save/cancel, persistence, permission denial, upload validation and cross-tenant isolation assertions pass |
| P1 | Visitor authentication and ticket recovery | Signup/session, protected-route access, ticket ownership, QR failure and retry behavior pass |
| P1 | API error/loading/empty states | Remaining dashboard screens are tested under empty data, loading and controlled API failure; errors are accessible and recovery actions retry |
| P1 | Responsive authenticated dashboards | Organizer, exhibitor, visitor and platform-admin critical flows are checked at desktop, tablet and phone widths, including overflow and unreachable controls |
| P1 | Accessibility | Keyboard operation, visible focus, accessible names/labels, dialog/select behavior and status announcements are verified on the critical flows |
| P1 | Final inventory accuracy | Every row has current evidence and a truthful PASS / FAIL / PARTIAL PASS / BLOCKED / NOT TESTED result; no source-inspection-only PASS |

### Closure rule

Do not label Phase 3 100% complete while any critical workflow remains PARTIAL PASS, BLOCKED, or NOT TESTED. The next audit pass must target only the gaps above, reuse the existing E2E suites, and avoid duplicating coverage that is already green.
