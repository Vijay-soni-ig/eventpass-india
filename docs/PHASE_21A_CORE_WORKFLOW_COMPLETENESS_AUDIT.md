# Phase 21A — Core Workflow Completeness Audit

**Status:** READ-ONLY audit. No application code, schema, migrations, routes, or UI were modified during this phase. This document is the only file created.

**Date:** 2026-09-05

## 1. Executive Summary

ExhibitTix V2's **Public/Visitor** and **Organizer** workflows are, on the whole, real, server-authoritative, and usable end-to-end — the commercial architecture built in Phases 19A-20D (pricing, refunds, subscriptions, entitlements) is confirmed live, enforced, and correctly surfaced in the UI with no fake data or `[object Object]` errors found anywhere in this audit. The **Platform Admin** surface is honest about what is and isn't built, and every stub page accurately describes its own limitations rather than overclaiming.

The **Exhibitor** workflow is the major weak point discovered in this phase: a pure exhibitor account (the platform's second most important persona) hits several organizer-scoped API endpoints that were never adapted for exhibitor-only auth context, producing silent wrong-data (not error) results across Exhibitions, Tickets, Sales, Attendees, Scanner, and Analytics nav items. Additionally, the stall-payment retry path for any exhibitor in `payment_pending`/abandoned-payment state is a genuine dead end.

- **P0 (critical):** 4
- **P1 (high):** 3
- **P2 (medium):** 5
- **P3 (low/cosmetic):** 9

**Major blockers:** Exhibitor Scanner cannot check in any ticket for a pure-exhibitor account (always "Ticket Not Found"); exhibitors stuck in `payment_pending` have no way to retry payment; exhibitor Analytics page always shows zeros despite a working analytics endpoint existing.

**Major strengths:** commercial/pricing/refund/subscription/entitlement architecture is fully real and correctly gated everywhere it was tested; Visitor booking→QR→check-in→refund lifecycle works end-to-end including correct rejection of refunded tickets at check-in; Platform Admin suspend/reactivate is a real, enforced control; no fabricated homepage/dashboard statistics found; branding is clean on all user-facing surfaces.

## 2. Audit Scope

Read-only, current-codebase audit of 5 areas: Public/Visitor, Organizer, Exhibitor, Platform Admin, and Cross-System workflows, using live browser automation, direct authenticated API calls, source review, and direct (non-destructive, cleaned-up) database queries. Conducted via 4 parallel audit passes plus firsthand verification of the commercial/Quality-Gate layer. No Phase 16 report exists in this repository (see Section 15); historical baseline instead anchored on Phase 18/19A/19B/20D documentation, which is the earliest and most detailed prior-state record actually present in `docs/`.

## 3. Current Architecture Snapshot

- **Backend:** Express + Prisma + PostgreSQL 17.11 (local), 14 hand-written additive migrations, all applied (`prisma migrate status`: up to date).
- **Frontend:** Vite + React + TypeScript, single SPA with role-based route trees for `/organizer/*`, `/exhibitor-dashboard/*` (routes still literally named `exhibitor` in places, `platform/*`.
- **Personas:** Organizer (owns Exhibitions, Stalls, Teams), Exhibitor (`ExhibitorBusiness`, participates via `ExhibitionExhibitor`), Visitor (buys tickets), Platform Admin (`platformRole: "super_admin"`, cross-tenant oversight).
- **Commercial layer (Phases 19A-20D, protected/not redesigned this phase):** real `Plan`/`Subscription` model (Starter/Growth/Enterprise with enforced limits), immutable `PricingVersion`, shared `calculatePricing()` engine, `Payment` breakdown fields, idempotent row-locked `Refund` model, `entitlementService.ts` (enforces limits at every write path via `SELECT ... FOR UPDATE`), `subscriptionService.ts` lifecycle (`trialing→active/cancelled`, `active→cancelled/expired`), unified structured error contract `{error:{code,message,resource,currentUsage,limit,plan,action}}`.
- **Quality gate (this session, firsthand):** backend test suite 88/88 passing; backend typecheck clean; backend build clean; `prisma validate` clean; `prisma migrate status` — 14/14 applied; frontend typecheck (`tsc --build --force`) clean; frontend build clean (only pre-existing, previously-documented CSS `@import`-order/chunk-size warnings, nothing new).
- **Seed data (`server/prisma/seed.ts`):** deterministic, `upsert`-based, confirmed idempotent this phase (re-run produced identical row counts: `organizers:1, subscriptions:1, users:34, payments:13, exhibitions:1, exhibitorBusinesses:4`).

## 4. End-to-End Workflow Map

```
Organizer signs up → auto-bootstraps Organizer + Starter trialing Subscription (free-first-exhibition, lifetime-consumed)
  → Organizer creates Exhibition (entitlement-checked: 1 free exhibition on Starter)
    → Exhibition published with ticket types + stall inventory

Exhibitor discovers Exhibition (public listing/detail) → "Apply to Exhibit"
  → POST /api/exhibitor-participations (bootstraps ExhibitorBusiness if new) → status: applied
    → Organizer reviews (Exhibitors page) → Approve (entitlement-checked: exhibitor-slot limit) → status: approved
      → Exhibitor selects stall → status: stall_reserved
        → Exhibitor initiates payment → status: payment_pending
          → [BROKEN: no retry path if this step fails/abandons — see P0-1]
          → mock-complete success → status: confirmed
            → Exhibitor dashboard unlocks (participation-scoped features)

Visitor discovers Exhibition (homepage/listing/detail) → selects ticket type
  → POST /api/bookings/tickets (server-priced via usePricingQuote, no client math)
    → free ticket: paymentStatus=paid immediately; paid ticket: paymentStatus=created → mock-complete → paid
      → QR generated → visible in My Tickets
        → Organizer/Exhibitor scans QR at entry → check-in (gated: paymentStatus==="paid", duplicate-gated, override-gated)
          → (if refunded later) paymentStatus=refunded → check-in gate correctly rejects re-entry

Exhibitor leads captured during event → Leads page (exhibitor-scoped, real) → exported/analyzed
  → Exhibitor Analytics [BROKEN: wired to wrong/organizer-scoped endpoint, always zero — see P0-4]
Organizer Analytics (real, aggregate) + Organizer Lead view (analytics-only, no per-lead detail — see P1-2)

Platform Admin: cross-tenant oversight (organizers, exhibitions, exhibitors, visitors, payments, audit logs), suspend/reactivate (real, enforced), per-organizer subscription management (real).
```

Per-transition detail for each arrow above (source screen → API → DB op → destination) is documented inline in Sections 5-8 evidence columns rather than repeated here, to avoid duplicating the same file:line citations twice in this document.

## 5. Public/Visitor Audit

| Area | Status | Evidence | Finding | Severity |
|---|---|---|---|---|
| Homepage | Working correctly end-to-end | `src/pages/Index.tsx:45,71-80` (`usePublicExhibitions`, real city-count derivation) | Only static content is a clearly decorative "Exhibitor Dashboard" preview mock (₹4,85,000 sample sales, lines 419-447) — not visitor-facing data, but could be mistaken for a real stat by a skeptical reviewer. | P3 |
| Exhibition listing | Fully functional | `src/pages/ExhibitionListing.tsx:91-147` | Search/city/category/price/date filters and sort all operate on live data. Client-side filtering only — fine at current seed scale, would need server-side pagination at scale. | P3 |
| Exhibition detail | Fully functional | `src/pages/ExhibitionDetail.tsx:33,64-80`, `usePublicExhibitions.ts:22-29` | Real venue/dates/tickets/stall floor plan; 404 handled cleanly. "Sold Out" gate uses `ticket.quantity > 0` (`:263`) — appears to check total allotment, not remaining stock; server-side remaining-stock enforcement not independently re-verified this pass. | P2 |
| Ticket booking flow | Fully functional, with a confirmed gap | `src/pages/BookingFlow.tsx:74-121` (server-priced via `usePricingQuote`, zero local fee/GST math), `server/src/routes/bookings.ts:28-109` | Live-tested free and paid ticket flows end-to-end successfully. **`POST /api/bookings/tickets` has no idempotency key**, unlike the refund endpoint which requires one — a resubmitted/retried booking request creates a second, distinct booking + payment + gateway order for the same ticket, and the first orphaned `created`-status booking has no cleanup path. | P1 |
| My Tickets / Dashboard | Fully functional | `src/pages/Dashboard.tsx:41-43,219`, `useBookings.ts:26-31,55-61` | Correctly buckets by status; QR fetch scoped to `buyerUserId`, foreign booking IDs 404 correctly. | — |
| QR check-in trace | Working correctly end-to-end | `server/src/routes/bookings.ts:130-219` | Live-verified full sequence: valid check-in → duplicate rejection → override with audit trail → unpaid-ticket rejection → refund → re-scan correctly rejected as "not paid," even with override. Cross-organizer scoping verified by code, not live-tested (only 1 organizer in seed data). | — |

## 6. Organizer Audit

| Area | Status | Evidence | Finding | Severity |
|---|---|---|---|---|
| Nav inventory | — | `DashboardLayout.tsx:22-36`, `App.tsx:135-167` | 13 items; 11 route to real pages, Visitors and Marketing are stubs. | — |
| Dashboard KPIs | Real | `analyticsService.ts:80-163` | All values matched live API 1:1 with rendered UI. "Exhibitors" KPI counts only `confirmed` participations (by design, consistent with lifecycle), but the unqualified label could read as "total exhibitors." | P3 |
| Exhibition management | Real | `exhibitions.ts:41-141`, `ExhibitionsList.tsx`, `ExhibitionEdit.tsx` | Entitlement blocking verified live — clean structured error, correct toast text, no exhibition created. | — |
| Stall management | Real | `Stalls.tsx:126-155`, `ExhibitionEdit.tsx` (`StallLayoutEditor`) | Full available→reserved→sold lifecycle real and backend-driven. Export button honestly disabled ("not implemented yet"). | — |
| Exhibitor management | Real | `exhibitions.ts:374-424` | Approve/Reject correctly gated to `applied`-status rows only; approval correctly entitlement-checked. | — |
| **Visitor management** | **Stub** | `App.tsx:141-150` (`OrganizerComingSoon`) | No visitor list/profile/contact/history page exists for organizers at all, despite "Visitors" being a top-level nav item and a live dashboard KPI source — organizer sees only a count, never who attended. | **P1** |
| **Lead management** | **Partial (analytics-only)** | `organizerLeads.ts:15-86`, `Analytics.tsx` (leads tab) vs. `leads.ts` (full exhibitor-side detail) | Organizer sees only aggregates; no per-lead list, visitor identity, contact info, or export — despite this data being fully exposed to exhibitors for their own leads. No way for an organizer to audit or resolve a dispute on an individual lead. | **P1** |
| Marketing | Honest stub | `App.tsx:154-163` | Entirely unbuilt, honestly labeled — expected/acceptable gap. | P2 |
| Team management | Real | `organizerMembers.ts:25-118`, `Team.tsx` | Invite entitlement-blocking verified live. Invite success toast honestly discloses "no email is actually sent yet" — no real notification workflow. | P2 |
| Payments/Refunds | Real | `Payments.tsx:1-100` | Refund button correctly gated to paid/partially-refunded status + permission; unpaid bookings correctly show no refund action. | — |
| Analytics | Real | `analyticsService.ts:212-314` | All charts backed by real Prisma/raw-SQL aggregates, matched dashboard numbers. | — |
| Settings | Real, no regression | `exhibitor/settings/Settings.tsx:32-33,63-217` (shared component) | All controls explicitly disabled with honest notice, no fake-save toast — prior fix holds. | — |

**Additional:** Check-in/Scanner page correctly falls back to manual entry when no camera is present (expected in headless testing, not a defect). Auth rate limiting on repeated login attempts confirmed working.

## 7. Exhibitor Audit

| Area | Status | Evidence | Finding | Severity |
|---|---|---|---|---|
| My Participations | Real, but with a critical gap | `MyParticipations.tsx:34-43,183-216` | Status copy and button gating correct for all 8 enum values. See P0-1. | — |
| **Payment retry (payment_pending / abandoned)** | **Dead end** | `exhibitorParticipations.ts:182-231` requires `status==="stall_reserved"` to initiate payment, but the first call already flipped status to `payment_pending`. Live-tested as biz2: retry returns `400 "Select and reserve a stall before starting payment"` forever. | Any exhibitor whose payment attempt is abandoned or fails is permanently stuck — the UI's own "Complete Payment" button for this exact status always throws this error. | **P0** |
| `stall_pending` enum value | Orphaned/dead | `schema.prisma:318-331`, never assigned by any route; `MyParticipations.tsx:38` has copy but no button ever renders for it | Harmless (unreachable) but confusing dead code. | P3 |
| Apply to new exhibition | Real | `exhibitorParticipations.ts:34-90`, `ExhibitionDetail.tsx:23,38-45,316-332` | Genuine browse-and-apply flow from the public exhibition page, correctly role-gated. | — |
| **Exhibitions / Tickets / Sales / Attendees nav items** | **Wrong data source (organizer-scoped endpoints)** | `exhibitor/{exhibitions,tickets,sales,attendees}/*.tsx` call `useExhibitions()`/`useTicketBookings()`/`useStallBookings()`, which hit endpoints gated by `organizerIdsWithPermission`. Live-tested as biz1 (pure exhibitor, no organizer membership): all return empty `200` results, never an error. | These pages silently show zero/empty state for every real exhibitor account rather than exhibitor-scoped data — looks like "no data" rather than "wrong page," which is more dangerous because it never surfaces as a visible bug. Clicking "Create Exhibition" from this context would additionally auto-bootstrap an unwanted Organizer identity for the exhibitor account. | **P0** |
| **Scanner** | **Broken for real exhibitor accounts** | `exhibitor/scanner/Scanner.tsx:26` uses an organizer-side permission check; underlying lookup (`GET /api/bookings/tickets/lookup/:qrCode`) is organizer-scoped. Live-tested as biz1 against a genuinely valid, paid seed ticket QR: `404 "Booking not found"`. | Every scan an exhibitor performs reports "Ticket Not Found," regardless of QR validity — the feature cannot function as shipped for a pure-exhibitor account. Camera capture itself untestable in this environment (documented limitation, not assumed working). | **P0** |
| **Exhibitor Analytics** | **Wired to wrong endpoint** | `exhibitor/analytics/Analytics.tsx:1-9` uses organizer-scoped hooks instead of the real, working `GET /api/leads/analytics` (`analyticsService.ts:393-434`, `getExhibitorAnalytics`) | Page always renders zeros for a real exhibitor even though a correct, lead-based analytics endpoint already exists and is unused — a wiring bug, not a missing feature. | **P0** |
| Business profile | Real | `business.ts:36-91` | Live PUT/GET round-trip confirmed; bank/tax fields correctly redacted for view-only roles. | — |
| Team management | Real, tenant-isolated | `exhibitorMembers.ts` | Live-tested cross-tenant isolation (biz1 cannot see biz2's roster) and invite/role/removal flows. | — |
| Documents | Real, with an error-handling bug | `documents.ts`, `upload.ts:9-18,36-42`, `app.ts:90-104` | Valid image/PDF upload/list/delete/ownership-scoping all correct. Rejecting an unsupported file type throws a plain `Error` with no `.status`, so the global error handler flattens it to a generic 500 instead of a 400 — looks like a server crash to the user for a `.docx`/`.csv`/`.txt` upload. | P2 |
| Leads | Real, correctly scoped | `leads.ts`, `exhibitor/leads/Leads.tsx` | One of the best-built areas — correct exhibitor scoping, live-tested capture/status-update/assignment/CSV export with audit logging. | — |
| Settings | Real, honest | `exhibitor/settings/Settings.tsx:27-33,191-203` | No regression; correctly shows "no organizer subscription/plan to show" for a pure-exhibitor account. | — |
| Permissions model | Real | `permissions.ts:32-97` | Owner/Admin/Staff roles sensibly scoped. | — |

## 8. Platform Admin Audit

| Area | Status | Evidence | Finding | Severity |
|---|---|---|---|---|
| Nav inventory | — | `platform/layout/DashboardLayout.tsx:25-37` | 11 items, 1:1 with route table, no dead links. | — |
| Dashboard | Real | `Dashboard.tsx`, `analyticsService.ts:338-389` | Live-verified aggregates match DB exactly; `platformRevenue` honestly hardcoded to 0 with a comment explaining no commission model exists yet — not fabricated. | — |
| Organizers list | Real | `Organizers.tsx` | Working search, real counts. | — |
| Organizer Detail — Suspend/Activate | Real, verified live | `access.ts:15-29`, `platform.ts:63-88` | Live end-to-end test: suspend → immediate loss of organizer role + 403 on write attempts → reactivate restored access. A real, enforced control. | — |
| Organizer Detail — Exhibitions/Team/Usage/Subscription tabs | Real | `OrganizerDetail.tsx:70-326`, `platform.ts:90-259` | Confirmed still fully wired per Phase 20D; not re-litigated further. | — |
| Cross-tenant Exhibitions/Exhibitors | Real, no search | `platform/Exhibitions.tsx`, `platform/Exhibitors.tsx` | Functional but missing search/filter (Organizers/Visitors/Audit Logs have it). | P3 |
| Cross-tenant Visitors | Real | `platform/Visitors.tsx` | Working search; honest scope copy. | — |
| Cross-tenant Payments | Real, filter only | `platform/Payments.tsx` | Status dropdown filter, no text search. | P3 |
| Audit Logs | Real | `platform/AuditLogs.tsx` | Filterable, functional. | — |
| Subscriptions (top-level stub) | Honest, copy verified accurate | `App.tsx:184-193` | Correctly describes the real per-organizer system and correctly scopes what's missing (cross-organizer list, payment collection) — no longer overclaims "no billing system exists." | — |
| Reports / Support / System Settings | Honest stubs | `App.tsx:194-223` | Each accurately states what is/isn't built; no overclaim. | — |

## 9. Cross-System Workflow Audit

- Organizer→Exhibitor approval correctly consumes an entitlement slot before persisting (`exhibitions.ts:410`).
- Visitor ticket purchase → check-in → refund chain is fully connected and correctly gates re-entry after refund (verified live, Section 5).
- Exhibitor lead capture → organizer lead visibility is **one-directional and incomplete**: organizer can only see aggregates, not the underlying leads exhibitors manage (Section 6, P1).
- Platform Admin suspend action correctly cascades to organizer-role loss in real time (Section 8).
- Exhibitor-side pages that accidentally call organizer-scoped endpoints (Section 7) are a cross-system wiring defect, not a design gap — the correct exhibitor-scoped endpoints already exist for Leads/Analytics and are simply unused by the Analytics page.

## 10. State Machine Findings

- `ExhibitionExhibitor.status`: `applied→approved→stall_reserved→payment_pending→confirmed`, with `rejected`/`cancelled` exits — all transitions reachable and correctly gated **except** `payment_pending` has no path back to `stall_reserved` on payment failure/abandonment (P0-1). `stall_pending` is a schema-defined but unreachable/orphaned state (P3).
- `PaymentStatus`/`RefundStatus`: confirmed correct and complete via live refund test (Section 5) and existing test suite (88/88 passing, including dedicated refund/subscription-hardening tests read this session).
- `Subscription` lifecycle (`trialing→active/cancelled`, `active→cancelled/expired`, invalid transitions like `cancelled→active` rejected): confirmed via `server/tests/subscriptionLifecycle.test.ts` (all cases covered and passing) and live-verified for a real organizer in Section 3.

## 11. API↔UI Contract Findings

- Structured error contract `{error:{code,message,...}}` renders correctly as human text everywhere tested (entitlement blocks, subscription transitions, team invites) — no `[object Object]` found.
- Exhibitor-side pages calling organizer-scoped endpoints (Section 7) is the one significant contract mismatch found: the API correctly returns empty results (not an error) for a caller with no organizer permissions, which is contractually "correct" per the endpoint's own authorization model, but wrong for the page that's calling it — the bug is in the frontend's endpoint selection, not the API contract itself.
- Document upload's unsupported-file-type rejection breaks contract by returning a bare 500 instead of a 400 (Section 7, P2).

## 12. RBAC / Tenant Isolation Findings

- Confirmed live: exhibitor team rosters are tenant-isolated (biz1 cannot view biz2's roster, 404).
- Confirmed live: platform admin suspend/reactivate correctly and immediately affects an organizer's live permission set.
- Confirmed live: organizer-scoped booking/exhibition endpoints correctly return nothing for a caller with zero organizer memberships — this is the *correct* RBAC behavior, but is the root cause of the exhibitor-side wiring bugs in Section 7 (the frontend should never have pointed a pure-exhibitor page at these endpoints in the first place).
- No IDOR found in any tested cross-tenant read/write path.

## 13. Error/Loading/Empty State Findings

- No `[object Object]` renders found anywhere tested.
- No infinite-loading or stale-success-toast cases found.
- Exhibition detail page correctly handles invalid IDs (404→friendly "Exhibition Not Found" after retry settles).
- Document upload of an unsupported file type surfaces as a generic 500 "Internal server error" rather than a friendly validation message (Section 7, P2).
- Exhibitor pages hitting organizer-scoped endpoints (Section 7) return a *technically valid* empty state (`{bookings: []}`, `{exhibitions: []}`) that is indistinguishable from "you truly have no data" — this is the most dangerous class of finding in this audit precisely because it never manifests as a visible error.

## 14. Navigation/IA Findings

- Organizer "Visitors" and "Marketing" nav items point to stubs (Visitors is misleading given it's also a dashboard KPI source — Section 6, P1; Marketing is honestly labeled, P2).
- Platform Admin nav is fully 1:1 with real routes, no dead links.
- Exhibitor nav items (Exhibitions, Tickets, Sales, Attendees, Scanner, Analytics) route to real pages that are functionally broken for the intended persona (Section 7) — this is worse for IA integrity than an honest stub, since the nav item implies a working feature.

## 15. Responsive/Accessibility Findings

Not deeply audited this phase beyond incidental observation during live browser testing by the 4 agents; no layout-breaking issues were reported as a side effect of any live page visit (org, platform, and visitor pages all rendered without console errors across the pages visited). A dedicated responsive/accessibility pass was outside the practical scope achievable alongside the 35-section functional audit and is recommended as a follow-up (Section 22).

## 16. Historical Finding Verification

**No `docs/PHASE_16*.md` (or any Phase 1-17 report) exists in this repository.** `docs/` contains only `INTEGRATION_TEST_CHECKLIST.md` and Phase 18 through 20D reports. Historical verification below is anchored on Phase 18/19A/19B/20D documentation — the earliest and most detailed record of prior product state actually present — rather than a fabricated Phase 16 finding list.

| Original finding (per Phase 18 report) | Current status | Evidence |
|---|---|---|
| Frontend booking total math disconnected from backend | **FIXED** | `BookingFlow.tsx:76-121` now uses `usePricingQuote`, zero local fee/GST math |
| Stall direct-booking dead-end | **NO LONGER RELEVANT — deliberate redesign** | `StallBookingFlow.tsx:9-31` is an intentional redirect to the exhibitor-application workflow, not a regression |
| Organizer Exhibitors page (cross-exhibition view) | **FIXED** | `organizer/exhibitors/Exhibitors.tsx:1-40`, real Approve/Reject wiring |
| Settings page fake "Settings saved successfully" toast | **FIXED** | `exhibitor/settings/Settings.tsx:27-47`, controls disabled, no Save button |
| Homepage fake data | **FIXED** | `Index.tsx:22,69,308`, comments confirm real-data-only derivation |
| Product branding (working-name leakage) | **PARTIALLY FIXED / cosmetic remnants only** | No user-facing "EventPass"/"ExhibitPro"/"ExhibitHub" leakage found; only a code-only `localStorage` key (`eventpass_token`) and an internal dev-only doc title still say "EventPass" |
| Navigation stub honesty | **FIXED** | Every `ComingSoon` stub (organizer + platform) gives an accurate, specific description |
| Subscription messaging ("no billing system exists") | **FIXED (Phase 20D)** | `App.tsx:184-193`, confirmed live this session |
| GST/pricing legal treatment | **COULD NOT VERIFY (business decision, not a code defect)** | Out of scope for a read-only code audit; the display-mismatch half of this finding is fixed |

**New findings not present in any historical doc** (i.e., genuinely new to this phase, not previously known/fixed/regressed): all 4 P0s (exhibitor payment retry dead end, exhibitor nav wrong-endpoint wiring, exhibitor scanner broken, exhibitor analytics wrong-endpoint wiring), the visitor-booking idempotency gap, and the organizer Visitors/Leads stub gaps.

## 17. P0 Findings

**P0-1 — Exhibitor payment retry is a permanent dead end.**
- Affected workflow: Exhibitor participation payment.
- Evidence: `server/src/routes/exhibitorParticipations.ts:182-231` requires `status==="stall_reserved"` to initiate payment; the first call already advances status to `payment_pending`. Live-tested as biz2 (seeded in exactly this state): retry returns `400 "Select and reserve a stall before starting payment"`.
- Impact: Any exhibitor whose payment attempt fails, times out, or is abandoned (a routine gateway scenario) is permanently unable to complete payment through the product — the exact "Complete Payment" button shown for this status always fails. This blocks exhibitor onboarding and directly blocks organizer revenue.
- Recommendation: Allow payment initiation from `payment_pending` when no active/successful payment exists for the participation (or add an explicit "retry"/"reset to stall_reserved" transition). Document only — not implemented this phase.

**P0-2 — Exhibitor Exhibitions/Tickets/Sales/Attendees pages call organizer-scoped endpoints.**
- Affected workflow: Exhibitor dashboard (multiple nav items).
- Evidence: `exhibitor/{exhibitions,tickets,sales,attendees}/*.tsx` use `useExhibitions()`/`useTicketBookings()`/`useStallBookings()`, gated server-side by `organizerIdsWithPermission`. Live-tested as biz1 (pure exhibitor): all return empty `200` results.
- Impact: A pure-exhibitor account silently sees empty dashboards across 4+ nav items with no error — the most dangerous class of bug because it never surfaces as a visible failure. Additionally risks accidental Organizer-identity bootstrap if "Create Exhibition" is clicked from this context.
- Recommendation: Repoint these pages to exhibitor-scoped data sources (participations, the exhibitor's own leads/analytics), or remove/relabel nav items that have no valid exhibitor-scoped equivalent. Document only.

**P0-3 — Exhibitor Scanner cannot check in any ticket.**
- Affected workflow: Exhibitor on-site check-in.
- Evidence: `exhibitor/scanner/Scanner.tsx:26` uses an organizer permission check; underlying `GET /api/bookings/tickets/lookup/:qrCode` is organizer-scoped. Live-tested as biz1 against a valid, paid seed ticket: `404 "Booking not found"`.
- Impact: The single feature exhibitors most need at a live event (scanning attendees) cannot function at all for a pure-exhibitor account, regardless of QR validity.
- Recommendation: Wire the exhibitor scanner to a participation/exhibition-scoped lookup consistent with the exhibitor's approved participations, not an organizer-membership check. Document only.

**P0-4 — Exhibitor Analytics page always shows zero despite a working analytics endpoint existing.**
- Affected workflow: Exhibitor analytics.
- Evidence: `exhibitor/analytics/Analytics.tsx:1-9` uses organizer-scoped hooks instead of the real, already-built `GET /api/leads/analytics` (`analyticsService.ts:393-434`).
- Impact: Exhibitors cannot see any of their own real lead/conversion analytics, even though the correct backend logic already exists and works (confirmed via the Leads page, which correctly uses it).
- Recommendation: Repoint the Analytics page to `useLeadAnalytics()`/`GET /api/leads/analytics` — this is a pure wiring fix, not new backend work. Document only.

## 18. P1 Findings

**P1-1 — Ticket booking has no idempotency protection.** `POST /api/bookings/tickets` accepts duplicate submissions and creates a second booking+payment+gateway order for the same intent. Recommend an idempotency key, mirroring the existing pattern on the refund endpoint. Business impact: risk of double-charge or duplicate-ticket confusion on any client retry/back-button/network hiccup.

**P1-2 — Organizer Visitors nav item is a full stub.** Despite being a top-level nav item and a live dashboard KPI source, there is no visitor list/profile/contact/history page for organizers. Business impact: organizers cannot identify, contact, or track individual attendees — a real operational gap for an event-ops tool.

**P1-3 — Organizer Lead management is analytics-only.** No per-lead list, visitor identity/contact, or export exists for organizers, despite this same data being fully exposed to exhibitors for their own leads. Business impact: organizers cannot audit or resolve disputes on individual exhibitor leads.

## 19. P2 Findings

- Exhibition detail "Sold Out" gate may check total ticket allotment rather than remaining stock (`ExhibitionDetail.tsx:263`) — not independently confirmed against server-side remaining-stock logic this pass.
- Marketing nav item is an honest, expected stub (not a defect, listed for completeness).
- Organizer Team invite does not send a real email (honestly disclosed in-UI, but no notification workflow exists).
- Document upload rejects unsupported file types with a generic 500 instead of a 400 (`upload.ts` `fileFilter` throws a plain `Error` with no `.status`).
- "Attendees" (exhibitor persona) vs. "Visitors" (organizer/platform persona) terminology split for the same underlying ticket-holder entity — not a bug, but a real cross-persona naming inconsistency worth standardizing.

## 20. P3 Findings

- Homepage's decorative "Exhibitor Dashboard" preview mock numbers could be mistaken for a real stat by a skeptical reviewer — consider labeling "Sample data."
- Exhibition listing filters/sort are client-side only — fine at current scale, would need server-side pagination at scale.
- Organizer Dashboard "Exhibitors" KPI label doesn't disambiguate that it counts only `confirmed` participations.
- `stall_pending` is an orphaned/unreachable schema enum value with dead partial frontend copy.
- Platform Exhibitions/Exhibitors pages have no search box (unlike Organizers/Visitors/Audit Logs).
- Platform Payments page has a status filter only, no text search.
- Shared auth rate limiter across signup/login (`auth.ts:14-20`) can lock out normal QA/support login testing for 15 minutes.
- `localStorage` key `eventpass_token` and `docs/INTEGRATION_TEST_CHECKLIST.md`'s title still say "EventPass"/"EVENTPASS" — code-only/internal-doc-only, no user-facing leakage.
- Cross-organizer QR-scan scoping is verified by code but not live-tested (only one organizer exists in seed data).

## 21. Deferred/Intentional Limitations (confirmed, not defects)

- Razorpay/real payment gateway integration: intentionally mocked (`mock-complete` pattern) — confirmed by design across all payment flows tested.
- Subscription billing/payment collection: intentionally deferred — Platform Admin's own Subscriptions stub page accurately states this.
- GST/tax legal registration: a business decision, not a code defect — pricing math itself is now server-authoritative and consistent (fixed).
- Coupons/discounts: no evidence of any partial/fake implementation found; simply not present.
- Settlement/payout to organizers or exhibitors: no evidence found; out of scope for this phase's commercial architecture as built.
- Enterprise billing/custom contracts: `Plan` model supports an Enterprise tier with custom/unlimited limits, but no dedicated UI beyond what Platform Admin already exposes — consistent with prior phases' scope.

## 22. Commercial Architecture Protection List

The following were verified as real, working, and enforced this phase and were **not** modified, redesigned, or second-guessed, per this phase's explicit read-only mandate: pricing engine (`calculatePricing()`), `PricingVersion` immutability, `Payment` breakdown fields, `Refund` model (idempotent, row-locked), `subscriptionService.ts` lifecycle, `entitlementService.ts` limit enforcement (exhibition/exhibitor/visitor/stall/team-member, all at every write path including alternate paths), RBAC (`permissions.ts`, `access.ts`), tenant isolation (verified live for exhibitor teams and organizer suspend). No issues were found in this layer that would require classification as frontend-integration/backend-workflow/data/architecture-issue or deferred-commercial-capability — this layer passed cleanly.

## 23. Test Results

- Backend test suite: **88/88 passing** (`npm run test`, ~13-17s), including dedicated subscription-lifecycle and subscription-hardening test files read and confirmed this session.
- Backend typecheck (`npx tsc --noEmit -p tsconfig.json`): clean.
- Backend build (`npm run build`): clean.
- `npx prisma validate`: valid.
- `npx prisma migrate status`: 14/14 migrations applied, up to date.
- Frontend typecheck (`npx tsc --build tsconfig.json --noEmit --force`): clean.
- Frontend build (`npm run build`): clean (only pre-existing, previously-documented CSS `@import`-order and chunk-size warnings).
- Seed idempotency: **confirmed** — re-ran `npx tsx prisma/seed.ts` after all 4 audit agents completed and cleaned up their test data; row counts identical before/after (`organizers:1, subscriptions:1, users:34, payments:13, exhibitions:1, exhibitorBusinesses:4`).
- Live browser/API verification: 4 parallel audit passes performed live authenticated testing (browser automation + direct API calls with real JWTs) across all 5 personas — homepage, listing, detail, full booking+payment+QR+check-in+refund cycle (visitor), all 13 organizer nav items, all exhibitor nav items and participation lifecycle states (biz1 confirmed / biz2 payment_pending / biz3 applied / biz4 rejected), all 11 platform admin nav items including a live suspend/reactivate cycle. All test data created during these live tests was deleted/reverted and independently confirmed removed (zero `phase21a-audit-*` rows remaining; DB counts back at seed baseline).
- No new tests were added; no production code was touched.

## 24. Recommended Next Phase

**Phase 21B — Exhibitor Workflow Repair.** The smallest logical next phase is to fix the 4 P0 exhibitor-side findings (payment retry dead end, wrong-endpoint wiring on Exhibitions/Tickets/Sales/Attendees, Scanner, Analytics) plus the P1 visitor-booking idempotency gap — all are wiring/logic fixes to existing endpoints and pages, none require new architecture, new schema, or touching the protected commercial layer. This is a much smaller, well-scoped phase than "build the organizer Visitors/Lead-detail pages" (P1-2/P1-3), which is a legitimate but separate follow-up (Phase 21C or later) since it requires new UI, not just rewiring.

## Final Verdict

**PASS WITH ISSUES.**

The product has a coherent, mostly real, end-to-end workflow for its Public/Visitor, Organizer, and Platform Admin personas, with a genuinely solid and well-tested commercial/pricing/subscription/entitlement foundation. However, the Exhibitor persona — the platform's second core user type — has 4 P0-severity defects that make several of its nav items (Scanner, Analytics, and 4 organizer-endpoint-wired pages) non-functional for real exhibitor accounts, and its payment-retry path is a genuine dead end. These are real, current, verified defects (not historical or already-fixed) that block Exhibitor go-live readiness, even though they do not affect the Visitor or Organizer experience already verified to work correctly.
