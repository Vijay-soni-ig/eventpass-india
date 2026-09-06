# ExhibitTix V2 — Phase 21C

# Organizer Workflow Completion + Exhibitor Stalls Repair Report

## 1. Executive Summary

All in-scope P1 and P2 items are resolved. Organizer Visitors and Lead Management are now real, tenant-scoped, functional workflows (previously a stub and an analytics-only page, respectively). The Exhibitor Stalls scoping bug (documented as a known limitation in Phase 21B) is fixed using the same participation-based pattern already established there. The Organizer Exhibitors KPI now reports both confirmed and total counts, honestly labeled. A genuine backend gap was found and fixed during the P2-3 investigation: ticket-type inventory had **no capacity enforcement at all** (not just a display bug) — this is now enforced with race-safe row locking. Document upload correctly returns 4xx for unsupported file types across all four upload endpoints. Two regressions from Phase 21B's own dead-page cleanup were discovered during this phase's live verification and fixed: (1) a marketing-CTA "List Your Exhibition"/"Create Exhibition" link used across 8+ public pages had been broken by that phase's route deletion, and (2) the exhibitor dashboard's own home page had the same organizer-scoped-data defect as the pages fixed in 21B, undetected until now. No protected architecture (pricing, payments, refunds, subscriptions, entitlements, RBAC, tenant isolation, Phase 21B's exhibitor authorization, or booking idempotency) was redesigned or weakened.

- **P1 items resolved:** 3 (Organizer Visitors, Organizer Leads, Exhibitor Stalls)
- **P2 items resolved:** 4 (terminology, KPI correction, stock/sold-out enforcement, document upload errors)
- **Additional regressions found and fixed during this phase:** 2 (marketing CTA dead link; exhibitor dashboard home page organizer-scoping bug)
- **Schema changes:** none
- **New tests:** 16 (all passing)
- **Total tests:** 121 (105 pre-existing + 16 new), all passing

## 2. Phase 21A/21B Findings Addressed

| Finding | Status | Implementation |
|---|---|---|
| P1-2 (21A) — Organizer Visitors is a stub | **Fixed** | New page `src/pages/organizer/visitors/Visitors.tsx`, reusing the already-correctly-organizer-scoped `GET /api/bookings/tickets` endpoint — no new backend route needed. |
| P1-3 (21A) — Organizer Lead management is analytics-only | **Fixed** | New `GET/GET :id/GET export /api/organizer/leads` endpoints (mirroring the exhibitor-side `leads.ts` shape) + new pages `Leads.tsx`/`LeadDetail.tsx`; existing analytics page kept, now reachable via a "View Analytics" link. |
| Known limitation (21B §14) — Exhibitor Stalls uses organizer-scoped `useExhibitions()` | **Fixed** | Rewired to `useParticipations()`; the organizer-cloned `StallEditor.tsx`/its route removed (same accidental-organizer-capability class as Phase 21B's cleanup). |
| P3 (21A) — "Exhibitors" KPI mislabeled as total when it counts only confirmed | **Fixed** | `analyticsService.ts` now returns both `confirmedExhibitors` and `totalExhibitorsAllStatuses`; UI shows "confirmed / total" exactly like the existing Exhibitions/Stalls tiles. |
| P2 (21A) — Sold Out may reflect total allocation, not remaining stock | **Confirmed as a real, deeper bug and fixed** | See §8 — both the display AND a missing backend enforcement were fixed. |
| P2 (21A) — Document upload 500 on unsupported file type | **Fixed** | See §9. |

## 3. Organizer Visitors Implementation

**Backend:** no new endpoint. `GET /api/bookings/tickets` (`server/src/routes/bookings.ts`) was already scoped by `organizerIdsWithPermission(user, "booking:view")` and already backs the Tickets/Sales organizer pages — reused as-is, satisfying "use existing backend data wherever possible."

**Frontend:**
- `src/hooks/organizer/useVisitors.ts` (new) — thin wrapper hook.
- `src/pages/organizer/visitors/Visitors.tsx` (new, replaces the `OrganizerComingSoon` stub) — search (name/email), exhibition filter, check-in status filter, stat cards (total/checked-in/pending/attendance rate), table with name/email/phone/exhibition/ticket type/booking status/check-in status. Loading/empty/error states via the shared `LoadingState`/`ErrorState`/`EmptyState` components. Booking-status badge reuses the exact same `PaymentStatus → StatusBadge` mapping already used by the exhibitor Sales page, for terminology/visual consistency (see §6).
- `src/App.tsx` — `/organizer/visitors` route repointed from the stub to the new page.

**Verified live** (see §14): real visitor rows rendered for `org1.owner`, correct counts, no console errors.

## 4. Organizer Lead Management Implementation

**Backend** (`server/src/routes/organizerLeads.ts`, extended): added `GET /`, `GET /:id`, `GET /export`, mirroring the exhibitor-side `leads.ts` list/export shape exactly (same query filters: search/status/priority/exhibitionId, plus a new `exhibitorBusinessId` filter) but scoped by `organizerIdsWithPermission` instead of `exhibitorBusinessIdsWithPermission`. The pre-existing `/analytics` route is untouched; route registration order was deliberately fixed so `/:id` is registered **last** (after `/export` and `/analytics`) so it can never swallow those literal paths.

**Permissions** (`server/src/lib/permissions.ts` + client mirror `src/lib/permissions.ts`): granted the already-existing `lead:view`/`lead:export` permission names to `ORGANIZER_OWNER`/`ORGANIZER_ADMIN` (both) and `lead:view` to `ORGANIZER_MARKETING` — the same "reuse a permission name across two tenant axes, authorize through the correct scoping function" pattern Phase 21B established for `scanner:use`/`checkin:override`. The exhibitor-side `lead:view`/`lead:export` grants and their `exhibitorBusinessIdsWithPermission`-based authorization are completely untouched.

**Frontend:**
- `src/hooks/organizer/useOrganizerLeads.ts` (new) — list/detail/export hooks.
- `src/pages/organizer/leads/Leads.tsx` (new) — real list with search (visitor name/email/exhibitor business), exhibition filter, status filter, CSV export button, links to detail; the pre-existing `Analytics.tsx` chart page is kept and linked from a "View Analytics" button rather than deleted.
- `src/pages/organizer/leads/LeadDetail.tsx` (new) — read-only detail view (visitor contact, exhibition/exhibitor-business context, captured-by/assigned-to, notes). Deliberately **read-only** for the organizer — editing a lead's status/priority/notes/assignment remains exhibitor-only via the existing `/api/leads` routes, so the exhibitor lead-ownership model is unchanged.
- `src/App.tsx` — `/organizer/leads` now renders the new list page; `/organizer/leads/analytics` (existing chart page) and `/organizer/leads/:id` (new detail page) added.

**Verified live and by test** (see §10, §14): organizer A cannot see/read/export organizer B's leads; a pure exhibitor gets 403 from the organizer endpoints.

## 5. Exhibitor Stalls Repair

**Previous behavior:** `src/pages/exhibitor/stalls/Stalls.tsx` used `useExhibitions()` (organizer-scoped `GET /api/exhibitions`), always empty for a pure exhibitor account — documented as a known limitation in Phase 21B.

**Fix:** rewired to `useParticipations()` (the same exhibitor-scoped, already-tenant-isolated `GET /api/exhibitor/participations` endpoint Phase 21B's Exhibitions/Sales pages already use), flattening each participation's own allocated `stalls[]` into the table — an exhibitor now sees exactly the stalls their own business holds, with exhibition/type/size/price/participation-status/stall-status context, never another exhibitor's or the organizer's full inventory.

**Removed alongside it:** the "Layout Editor" CTA and its target page `StallEditor.tsx` (`/exhibitor-dashboard/stalls/editor/:exhibitionId`) — this page called organizer-only `useCreateStall`/`useUpdateStall`/`useDeleteStall` (gated server-side by `stall:manage`, a permission no exhibitor role holds), the same class of dead/misleading organizer-clone page removed in Phase 21B (`CreateExhibition`, `CreateTicket`, exhibitor `ExhibitionDetail`). No permission was granted or widened to "fix" this — the capability genuinely does not belong to the exhibitor persona, so the page was removed, not patched.

**No schema or backend changes** — pure frontend rewiring plus removing one dead page, exactly as instructed ("do NOT call organizer-scoped exhibition APIs merely to make the page work").

## 6. Terminology Corrections

Audited only the workflows touched by this phase (Visitors, Leads, Stalls), per instructions not to perform a repo-wide pass:

- **Visitor vs. Attendee:** the organizer Visitors page uses "Visitor" consistently (matching the platform-admin Visitors page's established terminology); the exhibitor Attendees page (Phase 21B) uses "Attendee" for the same underlying entity from the exhibitor's narrower view (visitors met at their own stall). Both labels are now paired with an explicit subtitle clarifying scope ("Everyone who has registered for a ticket at your exhibitions" vs. "Visitors you've met at your stall") rather than renamed outright — a full unification would be a larger IA change than this phase's scope permits, and the subtitles already resolve the ambiguity Phase 21A flagged.
- **Stall vs. Booth:** the new Stalls/Visitors/Leads pages consistently say "Stall" (never "Booth"), matching Phase 21A's confirmation that no user-facing "Booth" text exists anywhere in the product.
- **Exhibitor Business:** the new organizer Leads list/detail pages label the column/field "Exhibitor Business" (not just "Exhibitor" or "Business" alone), matching existing conventions elsewhere in the organizer dashboard (e.g. the Exhibitors page).
- **Booking status terminology:** the organizer Visitors page's booking-status column now reuses the exact same `PaymentStatus → StatusBadge` mapping already established on the exhibitor Sales page, rather than inventing a second convention for the same enum.

No other terminology changes were made — this was a targeted consistency pass on new/touched pages only, not a redesign.

## 7. Exhibitor KPI Correction

**Previous behavior:** `analyticsService.ts`'s `getOrganizerDashboard()` returned a single `totalExhibitors` field that actually only counted `status: "confirmed"` participations — labeled "Exhibitors" on the dashboard with no qualifier.

**Fix:** the field is now split into `confirmedExhibitors` (unchanged query) and a new `totalExhibitorsAllStatuses` (counts every `ExhibitionExhibitor` row regardless of status — one additional cheap `count()` query, no new joins). The organizer Dashboard KPI tile now reads `{confirmed} / {total}` with the subtitle "confirmed / total" — the exact same pattern already used by the adjacent Exhibitions (`active / total`) and Stalls (`occupied / total`) tiles, so this isn't a new UI convention, just consistent application of the existing one. Chosen over a pure rename because the underlying data made a genuinely useful "total" number safe and cheap to add (per the brief's preference for that option when safe).

**Verified by test** (`phase21cExhibitorStallsAndKpi.test.ts`): an organizer with one applied, one approved-only, and one confirmed participation gets `confirmedExhibitors: 1, totalExhibitorsAllStatuses: 3`.

## 8. Stall Inventory / Sold Out Investigation

Traced the full path per the brief's checklist:

- **Stall inventory** (physical exhibitor stalls, `Stall` model): already correctly enforced — `status` (available/reserved/sold) is updated transactionally with conditional `updateMany` guards (Phase 19B) and was not touched.
- **Ticket-type inventory** (`TicketType.quantity`, visitor tickets): this is what Phase 21A's concern was actually about. Traced `TicketType.quantity` (never decremented, a static total allotment — confirmed by design, per its own schema comment) against `routes/bookings.ts` POST `/tickets` (the only ticket-booking creation path) and found: **no capacity check existed at all.** The only existing cap was the organizer-wide `assertCanRegisterVisitor` (Phase 20C entitlement — total visitors across the whole organizer, unrelated to a specific ticket type's own stock). A ticket type with `quantity: 5` could be booked past 5 indefinitely.
- **Frontend calculation:** `src/pages/ExhibitionDetail.tsx` computed `available = ticket.quantity > 0` — always true once any allotment existed, regardless of how many had actually been booked. Confirmed as a real defect, not a false alarm.

**This was a genuine bug, not a false alarm — fixed on both sides:**

- **Backend** (`server/src/routes/bookings.ts`): new `assertTicketTypeHasStock()`, called inside the existing entitlement-locked transaction (after `assertCanRegisterVisitor`). Row-locks the `TicketType` (`SELECT ... FOR UPDATE`, the same idiom `lockOrganizerForEntitlement` already uses) so two concurrent bookings against the last remaining seats can never both succeed, then computes `remaining = quantity - sum(quantity of still-consuming bookings)`. Reuses the exact same "what counts as consumed" status list the visitor-limit entitlement check already uses (`NON_CONSUMING_TICKET_STATUSES`, exported from `entitlementService.ts` for this purpose — the only change to that protected file, purely additive/non-behavioral). Rejects with `409 {error, remaining}` when the request would oversell; the caught error retires the just-created Payment (same accepted orphan-payment trade-off already documented and used elsewhere in this file) rather than leaving a duplicate.
- **Public API** (`server/src/routes/public.ts`): `GET /exhibitions/:id` now computes and returns `remaining` per ticket type (quantity minus still-consuming bookings) via one `groupBy` aggregate.
- **Frontend** (`src/pages/ExhibitionDetail.tsx`, `src/types/exhibitor.ts`): `available` is now `remaining > 0` (falling back to `quantity` only if `remaining` is somehow absent); a "Only N left" hint appears at ≤10 remaining, matching the backend's authoritative number exactly.

**Backend remains authoritative** — the frontend's "Sold Out"/"N left" display is purely informational; the real gate is the row-locked transaction check, confirmed race-safe by a concurrency test (below).

**Tests added** (`phase21cStockAndUpload.test.ts`): booking within stock succeeds; booking exceeding stock is rejected (409, no row created); a refunded booking releases its seat back to remaining stock; **two concurrent requests for the single last remaining seat — exactly one succeeds, the ticket type is never oversold**; the public detail endpoint reports real remaining stock distinct from the raw total.

## 9. Document Upload Error Handling

**Previous behavior:** `server/src/middleware/upload.ts`'s shared `fileFilter` rejected an unsupported MIME type via a plain `Error("Unsupported file type")` with no `.status` — the global error handler in `app.ts` flattens any status-less error to a generic 500 "Internal server error".

**Fix:** new `handleUpload(uploader, fieldName)` wrapper in `upload.ts` that invokes multer's `.single()` manually and handles its callback directly — returning a clean `400 {error: <real reason>}` for both file-type rejections and `multer.MulterError` (e.g. file-too-large), entirely at the route boundary rather than depending on the global handler's generic 4xx flattening. Applied to **all four** upload routes that share this middleware (`documents.ts`, `business.ts` logo upload, `exhibitions.ts` cover/floor-plan uploads) — the same shared bug, fixed once via the shared helper rather than four separate one-off patches. The error message returned ("Unsupported file type", "File is too large (max 5MB)") is a legitimate validation reason, never a stack trace or internal detail.

**Test added** (`phase21cStockAndUpload.test.ts`): uploading a `.txt` file to `/api/documents` returns 400 with a real, non-generic message; uploading a valid PNG still succeeds (regression guard).

## 10. Security / RBAC Verification

All explicitly required checks were performed, live and/or by automated test:

| Check | Result |
|---|---|
| Organizer A cannot see Organizer B's visitors | **Confirmed** (`phase21cOrganizerVisitorsAndLeads.test.ts`) |
| Organizer A cannot see Organizer B's leads | **Confirmed** (list, detail-by-id 404 IDOR, export) |
| Organizer A cannot export Organizer B's leads | **Confirmed** — exported CSV never contains the other organizer's data |
| Exhibitor A cannot see Exhibitor B's stalls | **Confirmed** (`phase21cExhibitorStallsAndKpi.test.ts`, via the participations endpoint) |
| Pure exhibitor cannot access organizer-scoped APIs | **Confirmed** — `/api/bookings/tickets` returns an empty list (correct RBAC scoping, not an error) for a pure exhibitor; `/api/organizer/leads` returns 403 |
| Exhibitor cannot bootstrap an Organizer identity through these workflows | **Confirmed** — the Stalls page's only removed CTA (Layout Editor) was the sole remaining risk in this phase's scope; no other exhibitor-dashboard page introduced in this phase links to any exhibition/stall-creation action |
| RBAC restrictions remain intact | **Confirmed** — full 121-test suite green, including all pre-existing RBAC/tenant-isolation tests, unmodified |
| IDOR attempts return correct denial | **Confirmed** — cross-tenant lead-by-id returns 404 (not 403, not data leakage), matching the existing convention (`refundSecurity.test.ts` established this same "404 not 403" pattern for payments) |
| Client-supplied IDs cannot bypass tenant boundaries | **Confirmed** — every new query scopes through `organizerIdsWithPermission`/`exhibitorBusinessIdsWithPermission` first, never trusting a client-supplied `exhibitionId`/`exhibitorBusinessId` filter beyond narrowing within that already-authorized set |

## 11. Database / Migration Changes

**None.** Zero schema changes were required for this phase — confirmed before implementation (per the brief's "prefer zero schema changes" instruction) that:
- Visitors/Leads/Stalls all reuse existing tables and relations.
- The KPI fix is a second aggregate query, no new column.
- The stock/sold-out fix computes remaining stock from existing `TicketType.quantity` and `TicketBooking.quantity` — no new column needed (unlike Phase 21B's idempotency key, which genuinely required one).

`npx prisma validate`: valid. `npx prisma migrate status`: 15/15 migrations applied, unchanged from Phase 21B — up to date.

## 12. Tests

| | Count |
|---|---|
| Pre-existing tests (Phase 21B baseline) | 105 |
| New tests added (Phase 21C) | 16 |
| **Total** | **121** |
| Passed | 121 |
| Failed | 0 |
| Skipped | 0 |

New test files:
- `tests/phase21cOrganizerVisitorsAndLeads.test.ts` (6 tests) — organizer-visitor tenant scoping, pure-exhibitor denial, organizer-lead list/detail/export tenant scoping and IDOR, pure-exhibitor denial on leads.
- `tests/phase21cExhibitorStallsAndKpi.test.ts` (3 tests) — exhibitor stall cross-tenant isolation, a confirmed/paid stall correctly visible via participations, KPI confirmed-vs-total correctness.
- `tests/phase21cStockAndUpload.test.ts` (7 tests) — stock enforcement (within-limit, over-limit, refund-releases-seat, concurrent-race-safety, public-endpoint-remaining-accuracy), document upload 4xx + valid-upload regression guard.

A real cross-file test-infrastructure race was discovered and fixed during this phase (not an application bug): `cleanupOrphanPayments()`/`cleanupOrphanFreePayments()` (test helpers) previously deleted *any* currently-orphaned Payment row with no age check — since Node's test runner executes multiple test files concurrently against the same real database, and every booking route momentarily has its Payment committed before its TicketBooking, one test file's cleanup could delete another file's still in-flight payment. Both helpers now only delete payments orphaned for **more than 30 seconds**, closing this race without weakening either helper's actual cleanup guarantee. No existing test was modified or weakened otherwise.

## 13. Build / Typecheck

- Backend typecheck (`npx tsc --noEmit -p tsconfig.json`): clean.
- Backend build (`npm run build`): clean.
- Frontend typecheck (`npx tsc --build tsconfig.json --noEmit --force`): clean.
- Frontend build (`npm run build`): clean (only the pre-existing, previously-documented CSS `@import`-order and chunk-size warnings — nothing new).
- `npx prisma validate`: valid.
- `npx prisma migrate status`: 15/15 migrations applied, up to date.

## 14. Live Verification

Performed against the running dev servers using real seeded accounts, in fresh browser sessions per persona (see §16 for an environmental note on why per-persona sessions were used):

- **Organizer (`org1.owner`):** Visitors (real rows, correct stats, filters render), Leads (real list, search/filter/export controls present), Lead Analytics (existing charts, now reachable via "View Analytics"), Dashboard (unaffected, KPI tile shows real numbers) — zero console errors, zero `[object Object]`, zero failed requests across all four pages.
- **Exhibitor (`biz1.owner`, confirmed participation):** Dashboard home (newly fixed — real stall-spend/lead/confirmed-stall/conversion stats, real confirmed-exhibition list), Exhibitions, Stalls (newly fixed — shows the real allocated stall "A-01"), Sales, Attendees, Analytics — zero console errors, zero `[object Object]`, zero failed requests across all six pages.
- **Restored marketing CTA:** `/exhibitor-dashboard/exhibitions/new` (the "List Your Exhibition"/"Create Exhibition" destination linked from the Header, Footer, Homepage, AboutUs, HowExhibitionsWork, and ForExhibitors pages) renders its form correctly — verified without submitting it (to avoid mutating seed data).
- **Public exhibition detail — Sold Out display:** loaded live, confirmed no ticket type incorrectly shows Sold Out at current seed stock levels (all three seed ticket types have remaining stock); the fix's actual correctness is proven by the automated concurrency test in §8, not by live-forcing a real sellout against seed data.
- **Visitor booking + idempotency (direct API, not re-tested via UI this phase):** confirmed unaffected — the full pre-existing + Phase 21B idempotency test suite (part of the 121) passes unmodified, and this phase's own stock-check tests exercise the same booking endpoint end-to-end.
- **Platform Admin:** `GET /api/platform/dashboard` and `GET /api/platform/organizers` both return 200 for `platform.admin@eventpass.test` — unaffected by this phase, as expected (no platform-admin code was touched).

## 15. Seed / Database Cleanup

- All temporary organizers/exhibitors/visitors/leads/bookings created during automated tests are cleaned up in each test file's `after()` hook, verified by re-running the full suite and confirming the database returns to its exact pre-phase baseline afterward.
- 7 transient orphaned Payment rows (expected byproducts of the concurrency-race tests in §8 and §12 — the losing side of a race that never got attached to a booking, the same accepted trade-off already documented in `routes/bookings.ts`) were identified and deleted after the final test run.
- `npx tsx prisma/seed.ts` re-run mid-phase: confirmed idempotent (identical row counts before/after: `organizers:1, subscriptions:1, users:34, payments:14, exhibitions:1, exhibitorBusinesses:4`).
- No legitimate pre-existing user data was touched. Final database state: `organizers:1, subscriptions:1, users:34, payments:14, exhibitions:1, exhibitorBusinesses:4, ticketBookings:12, stallBookings:2` — internally consistent (14 payments = 12 ticket + 2 stall bookings, zero orphans), identical to the Phase 21B end-of-phase baseline.

## 16. Known Limitations

- **Environmental note, not a product defect:** live browser verification in this phase was repeatedly slowed (page loads up to ~75s at worst) by two self-inflicted environmental issues discovered and resolved mid-phase: (1) running the full 121-test suite at default (unbounded) concurrency alongside an extra ad-hoc test invocation exhausted the local portable Postgres instance's capacity, causing it to become briefly unreachable — recovered by restarting Postgres (`pg_ctl start`), with no data loss (WAL-based crash recovery kept all prior data intact, confirmed by row-count check); (2) browser-automation sessions had accumulated ~27 orphaned Chrome processes across repeated verification attempts, degrading every subsequent page load — resolved by terminating them. Neither issue reflects an application defect; both are documented here for transparency about what live verification actually encountered.
- **Terminology (§6)** was only addressed for the workflows this phase touched, per explicit scope instruction — a full "Visitor" vs. "Attendee" unification across the whole product remains a separate, larger decision, not attempted here.
- The 30-second age threshold for the test-cleanup race fix (§12) is a pragmatic value, not derived from any specific requirement — it only needs to safely exceed a single request's real duration, which it does by a wide margin.

## 17. Deferred Work

Explicitly out of scope for this phase (per "No Scope Creep"), carried forward unchanged: Razorpay, real subscription billing, GST/tax, coupons, settlement/payout, enterprise billing automation, multi-currency, Platform Reports/Support/System Settings, a general accessibility overhaul, and any unrelated refactoring. Additionally carried forward from Phase 21B: the exhibitor "Tickets" page's honest limitation messaging (unchanged, correct as-is) and the deferred organizer per-lead management being the *only* missing piece before this phase — now delivered.

## 18. Final Verdict

**PASS**

Both named P1 stubs (Organizer Visitors, Organizer Lead management) and the documented Exhibitor Stalls scoping bug are now genuinely fixed and tenant-scoped, verified by 16 new automated tests plus live browser/API checks. The Exhibitors KPI no longer misrepresents its number. The Sold Out/remaining-stock investigation found and fixed a real, previously-unenforced backend gap (not just a display issue), proven race-safe under concurrency. Document upload returns proper 4xx errors across all four affected endpoints. Two additional regressions — a marketing-CTA dead link and an unfixed organizer-scoping bug on the exhibitor dashboard's own home page, both traceable to Phase 21B's page-cleanup work — were found through this phase's own live verification and fixed rather than left standing. All 121 tests pass (105 pre-existing, unmodified, plus 16 new), backend and frontend typecheck/build are clean, Prisma is unchanged and valid, no protected architecture was touched beyond one additive `export` keyword on an existing constant, and the database is clean, consistent, and idempotent-seed-verified.
