# ExhibitTix V2 — Phase 20A: Commercial Model & Pricing Decision Audit

**Read-only analysis. No source code, schema, migration, environment variable, or dependency was modified in producing this report.**

Date: 2026-09-04

---

## 1. Executive Summary

ExhibitTix has a genuinely mature **product** and a genuinely dormant **business model**. The operational core — exhibition/stall/ticket management, the exhibitor application→approval→stall→payment lifecycle, QR check-in, lead capture/export/analytics, multi-role RBAC, and now (Phase 19A/19B) a correct, server-authoritative pricing and refund engine — is real, tested, and production-shaped. But **zero commercial functionality is active**: the `Plan` and `Subscription` tables added in Phase 19A are not read or written by a single line of application code anywhere in the repository (confirmed by a repo-wide search for `prisma.plan.` / `prisma.subscription.` — zero matches), the platform admin's own Subscriptions page still renders *"No billing/subscription model exists in this platform yet — every organizer currently has unrestricted access regardless of plan"* (`src/App.tsx:184-192`, `server/src/routes/platform.ts:140-143`), and the one seeded `Plan` row (`plan-custom-unconfigured`, ₹0.00, `active: false`) exists purely to satisfy a foreign key, not as an offer.

This is exactly the state Phase 19A intentionally left things in — a correct, safe *foundation* with no enforcement — and this phase's job is to recommend what fills it in next, not to build anything.

**Headline recommendation**: adopt **Model A — Organizer-First SaaS** (subscription/per-event fee to the organizer; tickets and stalls stay commission-free), reaffirming and sharpening Phase 18's original recommendation now that the architecture to support it actually exists. A **3-tier plan structure** (Starter / Growth / Enterprise) mapped directly onto the `Plan` model's existing limit fields, a **per-event-with-annual-option** pricing basis, a **free-first-exhibition trial** (not a calendar-day trial — exhibitions take months to prepare), and **zero ticket/stall transaction commission** for the foreseeable future. GST, merchant-of-record, and exact pricing figures remain business/legal decisions this report identifies precisely but does not make.

---

## 2. Current Product Capability Audit

Full audit methodology: direct inspection of every route file under `server/src/routes/`, every page under `src/pages/{organizer,exhibitor,platform}/`, `server/src/lib/permissions.ts`, and `server/prisma/seed.ts`, cross-checked against `src/App.tsx`'s route table for placeholder ("Coming Soon") pages.

### 2.1 Organizer-facing

| Capability | Backend | Frontend | Status |
|---|---|---|---|
| Exhibition management | `routes/exhibitions.ts` (379 lines) — full CRUD, cover/floor-plan upload | `organizer/exhibitions/{ExhibitionsList,CreateExhibition,ExhibitionEdit}.tsx` | **Production-ready** |
| Venue/floor-plan | Cover/floor-plan upload endpoint in `exhibitions.ts`; stall geometry (x/y/width/height) on `Stall` | `organizer/stalls/Stalls.tsx` | **Real**, file-upload based, not a visual designer |
| Stall management | `exhibitions.ts` stall sub-resource (create/update/delete) | `organizer/stalls/Stalls.tsx` | **Production-ready** |
| Ticket-type management | `exhibitions.ts` ticket-type sub-resource | `organizer/tickets/Tickets.tsx` | **Production-ready** |
| Exhibitor application/approval | `exhibitions.ts` (`GET/PATCH .../exhibitors`) + `routes/exhibitorParticipations.ts` (252 lines, full apply→approve→stall→pay lifecycle) | `organizer/exhibitors/Exhibitors.tsx` | **Production-ready** |
| Visitor list | **None** — no organizer-scoped visitor route exists | `ComingSoon` at `/organizer/visitors` — *"Visitor profiles and history. Coming soon."* | **Placeholder** |
| Team management / RBAC | `routes/organizerMembers.ts` + `teamMembers.ts`, 6 roles (owner/admin/operations/finance/marketing/scanner) | `organizer/team/Team.tsx` | **Production-ready** |
| Scanner/check-in | `bookings.ts` (`lookup/:qrCode`, `PATCH .../check-in` with override support, `/checkins` history) | `organizer/checkin/Scanner.tsx` (shared component with exhibitor) | **Production-ready** |
| Leads (organizer view) | `routes/organizerLeads.ts` — analytics aggregation only | `organizer/leads/Analytics.tsx` | **Partial** — no organizer-level lead list/export (that exists exhibitor-side) |
| Analytics | `routes/organizerAnalytics.ts` — role-gated dashboard + per-exhibition analytics, revenue/leads visibility scoped by permission | `organizer/analytics/Analytics.tsx` | **Production-ready** |
| Payments | `routes/organizerPayments.ts` (227 lines, extended in Phase 19B) | `organizer/payments/Payments.tsx` (built in Phase 19B) | **Production-ready** |
| Refunds | `lib/refundService.ts`, full/partial, idempotent, concurrency-safe | Refund dialog inside `organizer/payments/Payments.tsx` | **Production-ready** |
| Marketing | None | `ComingSoon` at `/organizer/marketing` — *"Campaigns and promotions. Coming soon."* | **Placeholder** |
| Settings | Reuses `exhibitor/settings/Settings.tsx` | Same file, mounted at `/organizer/settings` | **Real but generic** — no organizer-distinct settings page |
| Documents/KYC | `routes/documents.ts` exists but only reachable exhibitor-side | None organizer-facing found | **Exhibitor-only today** |

**Confirmed placeholder pages** (`ComingSoon`, `src/App.tsx`): `/organizer/visitors`, `/organizer/marketing`, `/platform/subscriptions`, `/platform/reports`, `/platform/support`, `/platform/settings` — all six render explicit in-code admissions the feature doesn't exist, not silently broken pages.

### 2.2 Exhibitor-facing

All pages under `src/pages/exhibitor/` are real and functional — no stubs found:

- **Business profile**: `business/{MyBusiness,CompanyProfile,BankTax,TeamRoles}.tsx`, backed by `routes/business.ts` + `exhibitorMembers.ts`.
- **Participation lifecycle**: `participations/{MyParticipations,PaymentHistory}.tsx`, backed by `exhibitorParticipations.ts` (apply, cancel, select stall, pay, payment history).
- **Documents**: `documents/Documents.tsx`, real upload/list/delete via `routes/documents.ts`.
- **Leads**: `leads/{Leads,LeadDetail}.tsx`, backed by `routes/leads.ts` (270 lines — list, export, analytics, detail, capture, update).
- **Exhibitor-side analytics**: `analytics/Analytics.tsx`.
- **Scanner**: `scanner/Scanner.tsx` — the canonical implementation, reused by the organizer scanner page too.

**Important structural finding**: `src/pages/exhibitor/` *also* contains `exhibitions/{CreateExhibition,ExhibitionsList,ExhibitionDetail}.tsx`, `tickets/`, `sales/Sales.tsx`, `attendees/Attendees.tsx` — an exhibitor-typed user can run their *own* exhibitions. This is not a UI accident: `server/src/routes/exhibitions.ts`'s `POST /` explicitly allows a `userType: "exhibitor"` account to auto-bootstrap its own `Organizer` tenant (`resolveOrganizerId`), the same path `requireOrganizerAccess` gates on. **This dual-role capability directly affects plan design** — see §7 and §12.

### 2.3 Visitor-facing

- **Registration/login**: `src/pages/Auth.tsx` + `routes/auth.ts`.
- **Browsing**: `ExhibitionListing.tsx`, `ExhibitionDetail.tsx`.
- **Ticket booking + payment**: `BookingFlow.tsx` (667 lines) — real, server-authoritative (Phase 19A), backed by `bookings.ts`.
- **Stall booking (direct)**: `StallBookingFlow.tsx` is a **deliberate redirect stub**, not a placeholder — in-code comment: *"Stalls are no longer bought directly by visitors here — they're allocated to exhibitor businesses through an application/approval workflow."* The route exists only to redirect a visitor to the right place. This is intentional prior product direction, not unfinished work — flagged here only because it looks, from the route table alone, like a working feature.
- **QR ticket / My Tickets**: `Dashboard.tsx` + `GET /tickets/mine`, `GET /tickets/:id/qr`.

### 2.4 Platform Admin

`routes/platform.ts` (257 lines), all `requirePlatformAdmin`-gated: dashboard metrics, organizer list/detail/suspend (with audit logging), organizer sub-views (exhibitions/team/usage/**subscription**/audit), cross-tenant read-only views (exhibitions/exhibitors/visitors/payments), audit-log search. All map 1:1 to real pages under `src/pages/platform/`.

The `/organizers/:id/subscription` endpoint is the single most direct piece of evidence in this entire audit: it is coded today, in Phase 19B-era code, to unconditionally return `{hasSubscriptionSystem: false}` (`platform.ts:140-143`) — a comment/response that predates Phase 19A's `Plan`/`Subscription` models and was never updated to reflect them. **The data model exists; the operational system does not.**

**Stubs**: `/platform/subscriptions`, `/platform/reports`, `/platform/support`, `/platform/settings` — internal/admin-facing, not customer-facing gaps.

### 2.5 RBAC maturity (`server/src/lib/permissions.ts`)

A single centralized `can(role, permission)` matrix — 11 roles (`PLATFORM_ADMIN` wildcard + 6 organizer roles + 3 exhibitor roles + `VISITOR`), 25 permissions. Deliberate, documented design choices found in-code: `ORGANIZER_FINANCE` excludes operational permissions ("must not automatically receive operational permissions"), `ORGANIZER_MARKETING` gets only read-only lead analytics ("no marketing/campaign features exist yet"), `VISITOR` has an empty permission set (ownership-based access instead). This reads as genuinely production-grade infrastructure, not a placeholder — and it is exactly what a plan-limit enforcement layer (Phase 20C) would hook into.

### 2.6 Seed data

`server/prisma/seed.ts` (533 lines): 1 platform admin, 1 organizer (all 6 roles), 4 exhibitor businesses, 1 live exhibition, 20 visitors, a spread of ticket/payment/refund states, check-ins including a manual override, leads across every status. A deliberately modest single-tenant scenario — sufficient to exercise every workflow once, not a volume/multi-tenant stress dataset.

---

## 3. Current Commercial Architecture

Answering Step 2's questions directly, against the actual code (not the schema's existence):

| # | Question | Answer | Evidence |
|---|---|---|---|
| 1 | Can an organizer currently subscribe? | **No** | No route creates a `Subscription` row anywhere |
| 2 | Can an organizer be charged a SaaS subscription? | **No** | No subscription-payment code path exists at all (correctly deferred — see Phase 19A/19B scope) |
| 3 | Can the system enforce plan limits? | **No** | `Plan.eventLimit`/`visitorLimit`/etc. are schema-only; zero routes read them |
| 4 | Can the system distinguish Free/Starter/Professional/Enterprise? | **No** | One `Plan` row exists (`plan-custom-unconfigured`, inactive, ₹0) — a FK placeholder, not a real tier |
| 5 | Can the system track subscription status? | **Schema only** | `SubscriptionStatus` enum exists; nothing writes it |
| 6 | Can the system enforce feature access? | **No** | RBAC (§2.5) gates *actions*, not *plan tier* |
| 7 | Can the system generate invoices? | **No** | No invoice model or route exists |
| 8 | Can the system calculate platform revenue? | **Partially** | `Payment.platformRevenueAmount` exists and is computed correctly per-transaction (Phase 19A), but is always ₹0 today (`platformFeeType: none`) and nothing aggregates it into a reporting view |
| 9 | Can the system charge transaction fees? | **Architecturally yes, operationally no** | `calculatePricing()` supports `fixed`/`percentage`/`percentage_plus_fixed`, but the active `PricingVersion` has `platformFeeType: none` |
| 10 | Can the system support upgrades/downgrades? | **No** | No plan-change route exists |
| 11 | Can the system support cancellation? | **No** | No subscription-cancellation route exists |
| 12 | Can the system support trials? | **No** | `Subscription.trialEndsAt` is a schema field only, never set or checked |

**Net position**: the commercial *foundation* (Plan/Subscription/PricingVersion/Payment-breakdown/Refund) is real, correct, and tested (46 automated tests across Phase 19A/19B, all passing at the time of writing) — but it is a foundation with nothing built on it yet. This is the accurate, literal state of "commercial architecture" today, not an assumption from the models' existence.

---

## 4. Competitive Positioning

Phase 18 (`docs/PHASE_18_COMMERCIAL_PRICING_ARCHITECTURE.md §8-9`) already performed live competitor research; summarized here for context, not repeated:

- **Transaction-fee incumbents** (Eventbrite 3.7%+$1.79/ticket, Townscript ~1.99%+₹10, Explara ~4%, EventTitans 3.4%+$0.30) — crowded, resented at volume by price-sensitive Indian organizers.
- **Enterprise license models** (Cvent $10k-$100k+/mo, ExpoPlatform ~$2,000/mo or ~$5,000/event) — monetize via subscription/license, not per-ticket, because their buyers run exhibitions as a paid service.
- **Exiwik** — the single closest direct comparable (Indian, exhibition-specific, organizer+exhibitor product): **0% ticket/stall commission**, ₹24,999-₹55,000/event or ₹18,500/month unlimited, free exhibitor CRM/lead-capture bundled in. This is the strongest evidence available that a subscription/per-event, commission-free model is not just theoretically sound but already commercially proven in exactly this market segment.
- **"0% commission" niche** (Ticmint, Zoho Backstage, EventGateTicket) — a genuine, viable positioning in India specifically, not a gimmick.

Nothing in this phase's own inspection contradicts Phase 18's research; if anything, ExhibitTix's Phase 19A/19B build (server-authoritative pricing, immutable pricing versions, full refund architecture) now gives it the *technical* credibility to make the same "0% commission, predictable SaaS fee" claim Exiwik makes, where six months ago it could not have (Phase 18 found the frontend and backend charged *different* amounts).

---

## 5. Business Model Comparison

| Criterion | Model A — Organizer-First SaaS | Model B — Transaction-First | Model C — Hybrid |
|---|---|---|---|
| Indian market fit | 9 | 5 | 7 |
| Exhibition industry fit | 9 | 4 | 8 |
| Ease of explaining to customers | 9 | 7 | 4 |
| Revenue predictability | 8 | 4 | 6 |
| Scalability | 7 | 8 | 8 |
| Customer acquisition friction | 6 | 9 | 5 |
| Product complexity (to build) | 8 (low complexity = high score) | 6 | 3 |
| Operational complexity | 8 | 6 | 4 |
| Refund complexity | 8 (refunds don't touch a fee) | 5 | 5 |
| Tax complexity | 7 | 5 | 4 |
| Competitive differentiation | 8 (matches Exiwik's proven wedge) | 3 (crowded) | 7 |
| Long-term revenue potential | 7 | 6 | 9 |
| **Total /120** | **94** | **68** | **70** |

Scoring rationale mirrors Phase 18 §10 (unchanged assessment; re-scored here on the required rubric rather than repeated as prose). Model A wins decisively on every dimension a pre-revenue, India-focused, exhibition-specific product should weight most heavily (market fit, explainability, refund/tax simplicity, differentiation) and only loses ground on raw long-term revenue ceiling and zero-friction acquisition — both addressable later via Model C's optional add-on layer without rearchitecting (see §11 "Deferred").

---

## 6. Recommended Business Model

**Model A — Organizer-First SaaS.**

- **Pricing basis**: per-event fee, with an annual/unlimited-events option for frequent organizers (§9).
- **Who pays ExhibitTix**: the organizer.
- **What they pay for**: platform access to run an exhibition — exhibition/stall/ticket-type setup, the exhibitor application→approval→stall→payment workflow, QR check-in, lead capture, analytics — not a cut of what they sell.
- **Ticket transactions**: commission-free (§9).
- **Stall transactions**: commission-free (§10).
- **Transaction fees**: none by default. The architecture (`PricingVersion.platformFeeType`) is already built to support one later without a rearchitecture — it is a configuration change, not a code change — but nothing in this audit justifies turning it on now.
- **Fee payer, if a transaction fee is ever introduced**: configurable per `PricingVersion` (`feePaidBy: organizer | attendee | split` already exists in the schema) — not decided here, deliberately, per §14.
- **SaaS billing cadence**: per-event as the primary unit (§7), with an annual/unlimited tier as an upsell for high-frequency organizers — not a pure monthly subscription, because exhibitions are episodic, not continuous, for most of this product's target customers.

**Why**: every dimension in §5 favors it; it's the only model with a genuine, proven direct comparable in this exact market (Exiwik); it generates revenue even from a fully free exhibition (a transaction-fee model earns literally ₹0 on one, and the seed data itself includes a free ticket type — this is not a hypothetical edge case); and it requires no change to the payment/refund architecture Phase 19A/19B already built and tested — only *configuration* (a real `Plan` row, a `Subscription` lifecycle) on top of it.

**What this report does not decide** (see §14 for the full list): exact final pricing figures, GST/tax treatment, merchant-of-record, and settlement model. These require business ownership and, for tax, professional legal/accounting sign-off — inventing them here would be exactly the mistake Phase 19A was explicitly built to avoid repeating (its "no arbitrary ₹4,999 Pro Plan" instruction, referencing an earlier phase's actual mistake).

---

## 7. Plan Structure

**Recommend 3 tiers — Starter, Growth, Enterprise — not 5.** A "Free" tier and "Starter" would be redundant given the trial strategy in §12 (a free first exhibition already serves the free-tier role); "Professional" and "Enterprise" would be redundant given how few organizers in this market run enough concurrent, large exhibitions to need four paid gradations. Every limit below maps directly onto a field that **already exists** on the `Plan` model (`eventLimit`, `visitorLimit`, `exhibitorLimit`, `stallLimit`, `teamMemberLimit`) — no schema change is implied by this recommendation.

| | **Starter** | **Growth** | **Enterprise** |
|---|---|---|---|
| Price basis | Per event | Per event, or annual/unlimited-events bundle | Custom/negotiated |
| Active exhibitions | 1 at a time | Up to 5 at a time | Unlimited |
| Exhibitor limit | 25 | 150 | Unlimited |
| Visitor limit | 1,000 | 10,000 | Unlimited |
| Stall limit | 25 | 150 | Unlimited |
| Team member limit | 3 | 10 | Unlimited |
| Ticket types | Unlimited | Unlimited | Unlimited |
| QR check-in | Included | Included | Included |
| Lead management (capture/export/analytics) | Included | Included | Included |
| Analytics (organizer + exhibitor) | Included | Included | Included, plus (future) exportable/scheduled reports |
| Documents/KYC | Included | Included | Included |
| Marketing tools | Not yet built (§2.1) — N/A at any tier until it exists | Same | Same |
| Support level | Community/email | Priority email | Dedicated account contact |
| Data retention | Standard (no deletion policy exists today either way — see §13 note) | Standard | Extended, negotiated |

**Deliberately NOT restricted**: ticket types, QR check-in, lead management, analytics, and documents are identical across all three tiers. There is no product or competitive reason to gate a currently-free, currently-working feature behind a higher tier just to create differentiation — Exiwik's own positioning (free exhibitor CRM at every tier) validates this, and the phase brief itself instructs against artificial restrictions. The only things that scale with tier are the **volume limits** (events/exhibitors/visitors/stalls/team) and **support level** — both organizer-understandable, both already representable in the schema exactly as-is.

---

## 8. Pricing Recommendation

Indian-market pricing, anchored against Exiwik (the closest direct comparable: ₹24,999/event Pro, ₹55,000/event Max, ₹18,500/month unlimited) and the enterprise/quote-based tier ExpoPlatform represents. **These are recommendations for business-owner decision, not implemented or committed values** — no code, schema, or seed data reflects any of these figures.

### Option 1 — Conservative

| | Starter | Growth | Enterprise |
|---|---|---|---|
| Per-event | Free (first event — see §12) / ₹9,999 thereafter | ₹19,999/event | Custom (₹1,50,000+/year indicative) |
| Monthly equiv. (if annual Growth bundle) | — | ~₹8,300/mo (₹99,000/yr, ~6 events) | — |
| Expected customer | First-time/small community organizer | Regular mid-size exhibition organizer | Large multi-venue/franchise organizer |
| Advantages | Lowest barrier to entry, easy "yes" | Still clearly affordable next to Exiwik's ₹24,999+ | Custom terms reduce sales friction for big accounts |
| Risks | May underprice relative to actual support cost per event; hard to raise later without friction | Leaves money on the table against the proven Exiwik anchor | Revenue depends entirely on a small number of large deals |

### Option 2 — Recommended

| | Starter | Growth | Enterprise |
|---|---|---|---|
| Per-event | Free (first event) / ₹14,999 thereafter | ₹24,999/event, or ₹1,49,000/year unlimited | Custom (₹3,00,000+/year indicative) |
| Monthly equiv. (annual Growth bundle) | — | ~₹12,400/mo | — |
| Expected customer | Small/occasional organizer (1-2 events/year) | Regular exhibition organizer (3-8 events/year) — the core target | Multi-venue, franchise, or B2B exhibition management company |
| Advantages | Matches Exiwik's own Pro per-event price almost exactly — validated market price, not invented | The annual-unlimited option directly mirrors Exiwik's ₹18,500/mo (~₹2,22,000/yr) pattern, priced slightly below it as a challenger-entrant discount | Room for real negotiation without looking arbitrary |
| Risks | Still requires the organizer's second event to be a paid conversion — needs a strong trial experience (§12) to earn that | None significant — this is the market-validated zone | Requires a real sales motion ExhibitTix doesn't have yet (no sales/support tooling exists — see §2.4) |

### Option 3 — Premium

| | Starter | Growth | Enterprise |
|---|---|---|---|
| Per-event | Free (first event) / ₹24,999/event thereafter | ₹49,999/event, or ₹2,50,000+/year unlimited | Custom (₹5,00,000+/year indicative) |
| Advantages | Signals a premium, full-service positioning above Exiwik | Highest revenue-per-event of the three options | Positions ExhibitTix near ExpoPlatform's enterprise tier |
| Risks | Prices out exactly the price-sensitive segment §4/§5 identified as ExhibitTix's best-fit customer; undermines the "0% commission, fair SaaS fee" story this report is built around | Real risk of losing to Exiwik on a like-for-like comparison | No enterprise feature set (custom SSO, dedicated support, SLAs) yet exists to justify the premium |

**Recommendation: Option 2.** It prices at parity with the one proven direct comparable rather than guessing, gives ExhibitTix room to compete on product depth (lead CRM, analytics, RBAC — all more mature than what's publicly known about Exiwik) rather than undercutting on price alone, and keeps the free-first-event trial (§12) as the actual conversion mechanism rather than trying to win on being cheaper. **These specific rupee figures require business-owner sign-off before being entered anywhere as a real `Plan` row** — this section is a recommendation, not a decision.

---

## 9. Exhibition-Specific Pricing Metric

Evaluated against "simple enough for a salesperson to explain in one sentence":

| Metric | Simplicity | Fit |
|---|---|---|
| Per active exhibition/event | **High** — "one price per event you run" | **Best fit** — matches the product's natural unit (an `Exhibition` is already the top-level tenant-scoped entity everything else hangs off), matches Exiwik's proven pattern, and is trivially representable via `Plan.eventLimit` |
| Number of stalls | Medium | Weak — stalls vary 8x within the seed data alone (4-15 per exhibition); would need per-stall-tier pricing an organizer can't predict before setup |
| Number of exhibitors | Medium | Weak — same volatility issue, and exhibitor count isn't known until after the event is mostly configured |
| Number of visitors | Low | Poor fit — genuinely unknowable in advance (that's the whole point of running an event), penalizes success, and directly contradicts the "predictable cost" pitch this report is built around |
| Exhibition duration | Low | Poor fit — no evidence organizers think in per-day terms; `Exhibition.startDate`/`endDate` exist but nothing in the product treats duration as a pricing lever |
| Number of active exhibitions (concurrent) | Medium | Reasonable as a **tier-differentiator** (§7's Starter/Growth/Enterprise split), not as the base pricing unit itself |
| Revenue generated by exhibition | Low | Reintroduces exactly the transaction-fee complexity/resentment §5 scores Model B poorly on |
| Features used | Low | Complex, hard to explain, and nothing in the current product is gated by feature today anyway (§7) |

**Recommendation: price per active exhibition/event**, with the *number of concurrent exhibitions allowed* as the tier differentiator (§7) and an annual/unlimited-events bundle as the volume discount for frequent organizers. This is the one metric an organizer can state and understand before the event even exists.

---

## 10. Ticket Fee Policy

| Option | Fit |
|---|---|
| A — 0% commission | **Recommended** |
| B — Percentage commission | Rejected — re-introduces the crowded, resented Model B dynamic §5 scores lowest |
| C — Fixed fee per ticket | Rejected for now — still a transaction-linked cost the organizer-first positioning is built to avoid; revisit only if Model C is pursued later |
| D — Percentage + fixed | Rejected, same reasoning as B/C combined |
| E — Organizer chooses who pays | Architecturally already possible (`feePaidBy` exists on `PricingVersion`) but moot while the fee itself is 0% |

**Recommendation: Option A, 0% ExhibitTix commission on ticket sales**, consistent with Model A (§6) and Exiwik's proven positioning. The architecture already protects this correctly regardless of policy — `calculatePricing()` computes the charge server-side from the DB-stored ticket price every time (Phase 19A `security.test.ts` proves a client-supplied amount is always ignored); this recommendation is a business-policy configuration of the existing `PricingVersion.platformFeeType` field (`none`, which is also its current, already-shipped default), not a proposal to build anything new or to relax any client-controlled-pricing protection.

---

## 11. Stall Fee Policy

Phase 18 already found no exhibition-specific competitor charges stall commission (Exiwik explicitly avoids it: *"organizers keep 100% of... stall sales"*). Nothing in this phase's inspection changes that finding. Comparing the four options:

- **0% commission**: matches every exhibition-specific competitor researched; stalls are a B2B, relationship-driven organizer↔exhibitor transaction ExhibitTix's own SaaS fee already monetizes at the organizer level.
- **Fixed fee**: would sit awkwardly on top of the organizer's own stall pricing (₹4,000-₹15,000 in the seed data) with no comparable precedent.
- **Percentage**: directly contradicts the "0% commission" positioning this report recommends building the whole pitch around — inconsistent to keep tickets commission-free but tax stalls.
- **Premium exhibitor services** (featured listing, lead enrichment, etc.): a real future lever, but it's *exhibitor* monetization, not *stall-transaction* monetization — see §12, kept structurally separate.

**Recommendation: keep stall transactions commission-free, indefinitely, as a structural product decision, not a "for now" placeholder.** This is one of the few recommendations in this report with no meaningful counter-argument found in either Phase 18's research or this phase's own inspection.

---

## 12. Exhibitor Monetization

**Core product (must stay free at every plan tier, per §7)**: lead capture, lead export, lead analytics, documents/KYC, team membership, scanner access, participation/stall workflow. All of these are already-shipped, already-expected features (per Phase 18's own §16 finding, unchanged) — gating any of them now would break something organizers and exhibitors already rely on and would contradict Exiwik's proven "free exhibitor CRM" wedge this report leans on for competitive positioning.

**Future monetization** (none built, none recommended for this or the next phase — listed for Phase 20B/20C planning only):

| Candidate | Best-fit model | Reasoning |
|---|---|---|
| Featured/priority exhibitor listing | Add-on, organizer-controlled | Raises a fairness question (does paying for visibility disadvantage other exhibitors at the same event) — a product-design question worth flagging, not just a pricing one |
| Advanced/AI lead insights | Add-on | Genuinely new capability, doesn't touch existing free lead analytics |
| Additional staff seats beyond the plan's team-member limit | Add-on, per-seat | Natural extension of the existing `ExhibitorMembership` model, no new concept needed |
| Digital catalogue placement | Add-on | New capability |
| Post-event marketing campaigns | Add-on, or bundled once `/organizer/marketing` (currently a stub, §2.1) is actually built | Depends on marketing being built at all first |
| Sponsored/premium visibility (organizer-level, not per-exhibitor) | Organizer-level add-on | Distinct from the exhibitor-level version above — organizer selling extra visibility to their own exhibitors is a different product decision than ExhibitTix selling it directly |

**Do not build any of this in Phase 20B or 20C** — every item above assumes Model A's core subscription system exists and is validated with real paying organizers first (§16).

---

## 13. Trial Strategy

**Reject a calendar-day trial (14 or 30 days).** Exhibitions in this product's own data model take months to prepare — `Exhibition.startDate`/`endDate` in the seed data show multi-week runs planned far in advance, and the entire organizer workflow (create exhibition → open exhibitor applications → approve → stall selection → ticket sales → the event itself) is not something a 14-day clock meaningfully covers. A calendar trial would very plausibly expire *before* the organizer's first real exhibition even opens for ticket sales, guaranteeing a bad first impression of the product's value.

**Recommended: free first exhibition**, capped at a small but genuinely usable scale (e.g., the Starter tier's limits from §7 — 25 exhibitors, 1,000 visitors, 25 stalls), full feature access (no artificially crippled trial experience), no calendar expiry — the trial "ends" when the organizer's first exhibition concludes or they attempt to create a second one, whichever comes first. This:
- matches how this specific market actually operates (episodic, months-long lead time per event, not continuous SaaS usage);
- gives a real, complete product experience rather than a truncated demo, which matters for a product this operationally deep (an organizer needs to see the *whole* lifecycle — application review, check-in day, post-event leads — to judge the product, not just the first 14 days of setup);
- mirrors the existing free-ticket architecture's own philosophy (Phase 19A: a free ticket is a first-class, fully-functional path, not a crippled one) — extend the same principle to the first exhibition itself.

**Not recommended**: a permanent free plan (undermines the SaaS revenue model entirely for a segment — small/occasional organizers — that Model A specifically depends on converting), demo-only (too weak given the operational depth worth showing), no free tier at all (too high a barrier given §5's finding that upfront-payment friction is Model A's one real weakness).

---

## 14. Grandfathering

**Absolute, non-negotiable constraints already enforced by the existing architecture** — this section describes how the *current* state satisfies them, not new work:

- **Historical `Payment`/`Refund` amounts**: cannot be rewritten by anything proposed in this report. Phase 19A's `PricingVersion` immutability (no update function exists at all — `lib/pricingVersion.ts`) and Phase 19B's `Refund.amount`/`Payment.refundedAmount` design already make this structurally impossible, not just policy-discouraged.
- **Existing `PricingVersion` rows** (`pv-legacy-unversioned`, `pv-launch-2026`): remain exactly as they are. Introducing real plan pricing (§8) requires creating a *new* `PricingVersion` if and when a ticket/stall platform fee is ever turned on (§10/§11 recommend it stay at 0%, so this may never actually be needed) — never editing an existing one, per the established pattern.
- **Existing organizations/exhibitions**: when plan enforcement (Phase 20C) eventually ships, every organizer that existed *before* enforcement went live should be automatically placed on a plan whose limits are set to (at minimum) their current actual usage — never retroactively blocked from continuing to operate an exhibition they already created under "everyone has unrestricted access" (the platform admin UI's own current, honest description of today's state). This is a Phase 20C implementation detail to get right, not a Phase 20A decision — flagged here so it isn't forgotten.
- **Existing seed/development data**: `server/prisma/seed.ts` is explicitly excluded from the production build (`tsconfig.json`) and is dev/test tooling only — no grandfathering concern applies to it; it should simply keep working as a development fixture, same as it always has.
- **Existing refund history**: Phase 19B already backfilled the one pre-19B "refunded" payment's `refundedAmount` to match its `amount` (`legacyCompat`-style migration discipline) — no further action implied by this report.

---

## 15. GST/Tax Technical Requirements

**No legal or tax claim is made in this section.** Structured exactly as instructed — technical requirement vs. business/legal decision, kept strictly separate, per Phase 18's own §14 (reaffirmed, not re-litigated, here).

### Technical requirements (the system must be *able* to represent these; it already can)
- A `taxBasis` (base amount only, or base + platform fee) — `PricingVersion.taxBasis` already exists.
- A `taxMode` distinguishing "not yet configured" from "configured at 0%" — `PricingVersion.taxMode` already exists and is the correct pattern (Phase 19A's explicit design goal: never conflate "undecided" with "zero").
- A per-ticket-type tax rate — `TicketType.taxPercent` already exists, seeded at 18% on paid ticket types, but **deliberately not read by the pricing engine** (Phase 19A's own schema comment: wiring it in without a real decision would mean guessing at a tax rate).
- Tax-inclusive vs. tax-exclusive pricing representation — not yet a field on `PricingVersion`; would need to be added *if and when* the tax decision below is made, following the same additive-migration, versioned-config discipline already established.
- Separate tracking of tax on ExhibitTix's own SaaS/platform fee vs. tax on the organizer's ticket/stall revenue — these may be two legally distinct taxable supplies; the `Payment` breakdown fields (`platformFeeAmount`, `taxAmount`) already keep these numerically separate, which is the necessary (not sufficient) technical precondition.

### Business/legal decisions (require a qualified Indian tax/accounting professional — not decided here, and this report will not guess)
- Whether ExhibitTix's SaaS/platform fee is itself a separately GST-invoiced taxable supply.
- Whether GST on a ticket/stall sale should be computed on the base price only, or base + any future platform fee.
- Who is the legal "seller of record" for GST purposes on a ticket — the organizer or ExhibitTix — which depends on the merchant-of-record/settlement-model decision (Phase 18 §13, still open, not re-decided here).
- Whether ExhibitTix needs its own GST registration and must issue tax invoices for its SaaS fee, or whether that stays entirely the organizer's responsibility.
- **Whether the seeded 18% `TicketType.taxPercent` value reflects an actual prior tax decision or is a plausible-looking placeholder** — Phase 18 flagged this as unresolved; this audit found nothing new that resolves it. It should not be treated as a decision merely because it exists in seed data.
- Refund tax treatment (credit notes, reversing GST on a refunded transaction) — not yet relevant operationally, since no tax is currently ever charged, but becomes real the moment the above questions are answered.

**Do not hard-code 18% (or any rate) as a business assumption anywhere in Phase 20B/20C** — this is a direct carry-forward of Phase 18 and Phase 19A's explicit instruction, restated here because it remains exactly as unresolved as it was then.

---

## 16. Unit Economics

**Illustrative only, using Option 2 pricing (§8) as the assumption set — not a revenue forecast or guarantee.** All figures below are scenario modeling, clearly labeled as assumptions.

### Small organizer — 1 exhibition/year, 100 exhibitors, 2,000 visitors
- Plan fit: Starter (exhibitor/visitor/stall limits comfortably cover this).
- SaaS revenue to ExhibitTix: **₹0 in year 1** (free first exhibition, §13) → **₹14,999/event** from year 2 onward if they run one more event.
- Ticket-fee revenue: **₹0** (§10, 0% commission).
- Stall-fee revenue: **₹0** (§11, 0% commission).
- **Total illustrative annual revenue to ExhibitTix: ₹0 (yr 1) → ₹14,999 (yr 2+)**, assuming exactly one event/year and conversion after the free trial.

### Medium organizer — 3 exhibitions/year, 300 exhibitors, 10,000 visitors
- Plan fit: Growth (per-exhibition exhibitor/visitor counts — ~100/~3,300 average — fit comfortably; the *plan's* 150/10,000 caps are per-active-exhibition-at-a-time limits, not annual totals, so this remains Growth as long as exhibitions don't overlap heavily).
- SaaS revenue, per-event pricing: 3 × ₹24,999 = **₹74,997/year**.
- SaaS revenue, annual-unlimited alternative: **₹1,49,000/year flat** — the organizer would likely prefer this once running 3+ events/year, since it's cheaper than 3 × per-event (₹74,997) only if they run 6+ events; at exactly 3 events/year, per-event pricing (₹74,997) is actually the better deal for this organizer, illustrating that the crossover point for the annual bundle is real and should be shown transparently, not just offered.
- Ticket/stall-fee revenue: **₹0** (structural, §10/§11).
- **Total illustrative annual revenue to ExhibitTix: ~₹74,997/year** at this organizer's actual event frequency.

### Large organizer — 10 exhibitions/year, 1,000+ exhibitors, 50,000+ visitors
- Plan fit: Enterprise (exceeds Growth's per-exhibition caps and, at 10 events/year, is exactly the frequent-organizer profile the annual-unlimited bundle or a custom Enterprise contract targets).
- SaaS revenue: **Custom** (§8) — illustratively, an Enterprise contract priced above the Growth annual bundle (~₹2,00,000-₹4,00,000/year indicative range, informed by §8 Option 2's Enterprise figure, not a quote).
- Ticket/stall-fee revenue: **₹0** (structural).
- **Total illustrative annual revenue to ExhibitTix: ~₹3,00,000/year indicative**, entirely dependent on a real negotiated contract this report cannot predict.

**Explicit caveat, restated**: none of the above accounts for actual conversion rates, churn, event cancellation, or whether an organizer renews after their free first event — these are illustrative unit-economics scenarios to sanity-check that the pricing in §8 produces sensible, explainable numbers at each organizer size, not a business forecast.

---

## 17. Phase 20B Requirements

**Design/build the Subscription *lifecycle* — do not enforce anything yet (that's Phase 20C).**

1. **Real `Plan` records** replacing the placeholder `plan-custom-unconfigured` — Starter/Growth/Enterprise (§7), with actual `eventLimit`/`visitorLimit`/`exhibitorLimit`/`stallLimit`/`teamMemberLimit`/`price` values once §8's figures get business sign-off. No schema change needed — the `Plan` model already has every field this requires.
2. **Subscription lifecycle states actually used**: `trialing` (the free-first-event state, §13) → `active` → `cancelled`/`expired`. `SubscriptionStatus` already has all four values; nothing currently transitions between them.
3. **Trial state wiring**: `Subscription.trialEndsAt` needs a real meaning — per §13, likely event-completion-based rather than a fixed date, which may mean this field's semantics need revisiting (a date field doesn't naturally represent "ends when the exhibition concludes") — flag this as a design question for Phase 20B, not something to guess at here.
4. **Plan assignment on organizer creation**: every organizer bootstrapped via `resolveOrganizerId` (§2.2 — including the exhibitor-dual-role path) should get a `Subscription` row in `trialing` state pointing at Starter, automatically, at creation time.
5. **Billing period tracking**: `currentPeriodStart`/`currentPeriodEnd` already exist on `Subscription` — need real values once a plan has an actual billing cadence (§9's per-event vs. annual distinction).
6. **Event entitlement concept**: given §9's per-event pricing recommendation, Phase 20B needs to define *what specifically* an organizer is entitled to per paid unit — e.g., does buying "one event" on Starter entitle them to exactly one `Exhibition` row, or one *concurrently active* exhibition (allowing sequential reuse)? This is a real product-design question this report surfaces but does not answer.
7. **Plan metadata / feature definitions**: `Plan.features` (JSON field, already exists) needs an actual schema/contract defined for what it can contain, even though nothing reads it yet.
8. **Subscription audit history**: reuse the existing `AuditLog`/`logAudit()` infrastructure (already proven in Phase 19B for refunds) for every plan assignment/change/cancellation — no new audit mechanism needed, just new call sites.
9. **Platform admin UI**: update `/organizers/:id/subscription` (`platform.ts:140-143`) to actually read real `Subscription` data instead of hard-returning `{hasSubscriptionSystem: false}`, and give the `/platform/subscriptions` list page (currently a `ComingSoon` stub) a real implementation once there's real data to show.

**Explicitly NOT Phase 20B**: any payment collection for a subscription (Razorpay is not configured — §0/Phase 19B "Known Issues" — and Step 16 defers this explicitly), any enforcement of the limits being tracked (Phase 20C).

---

## 18. Phase 20C Requirements

**Enforcement.** Backend must remain authoritative in every case — the frontend may show a limit warning as a UX courtesy, but the server is what actually blocks an action, exactly mirroring the existing "server always recomputes, never trusts the client" principle Phase 19A/19B already established for pricing and refunds.

| Limit | Where enforcement belongs | Enforcement point |
|---|---|---|
| Exhibition limit | **Backend** (authoritative) + Frontend (pre-flight UX warning) | `POST /api/exhibitions` — check the caller's active `Subscription`'s plan `eventLimit` against their current active-exhibition count before creating |
| Exhibitor limit | **Backend** + Frontend | Exhibitor *application acceptance* (`PATCH .../exhibitors/:id` approval step in `exhibitions.ts`), not application submission — an organizer should be able to see interest even past the limit, just not approve past it |
| Visitor limit | **Backend** + Frontend | Ticket booking creation (`bookings.ts POST /tickets`) — check against the exhibition's own organizer plan limit |
| Stall limit | **Backend** + Frontend | Stall creation (`exhibitions.ts` stall sub-resource) |
| Team member limit | **Backend** + Frontend | Organizer/exhibitor member invite (`organizerMembers.ts`/`exhibitorMembers.ts`) |
| Feature permissions (once any exist — none do today, §7) | **Backend** + Frontend | Would extend the existing `can(role, permission)` matrix (§2.5) with a plan-tier dimension, not replace it |
| Storage limits (documents) | **Backend** | `documents.ts` upload — no limit currently tracked at all, would need a new aggregate check |
| Analytics limits | Not recommended (§7 — analytics stays included at every tier) | N/A |
| Marketing limits | N/A until marketing itself is built (§2.1 — currently a stub) | N/A |

**Critical implementation note carried forward from Phase 19A/19B's own established pattern**: every limit check must be a real-time database query against current usage at the moment of the write, using the same race-safe conditional-update pattern already used for stall reservation and payment/refund concurrency (`updateMany` with a guard clause, or a row lock) — never a cached or client-reported count. This is not new advice; it's the same principle this codebase has consistently applied since well before this report.

---

## 19. Deferred Items

Per Step 16, explicitly not in scope for Phase 20B or 20C unless a dependency below forces otherwise (none were found):

- Razorpay / any live payment gateway configuration.
- Subscription payment collection (charging an organizer for their plan).
- Automated recurring billing.
- Coupons / discount engine.
- Full double-entry accounting ledger (Phase 18 §21's finding stands: only justified if `PLATFORM_SETTLEMENT` is ever chosen over `DIRECT` settlement — an open decision, §15).
- Platform settlement (ExhibitTix holding and paying out organizer funds).
- Complex exhibitor monetization (§12's "future" table — build none of it yet).
- Multi-currency (the `Payment.currency` field exists, is always `"INR"`, and nothing here requires changing that).
- Enterprise custom billing automation (Enterprise stays a manual/negotiated process, §8).

**No dependency found in this audit that requires pulling any of the above forward.** Model A (§6) can be fully represented — plans defined, subscriptions tracked, limits enforced — without touching any item on this list, exactly as Phase 18 originally anticipated.

---

## 20. Commercial Readiness Score

Scored out of 100, weighted roughly evenly across the 12 dimensions (≈8.3 points each), based strictly on what exists today vs. Phase 18's baseline (which scored effectively 0/100 — "no commercial architecture at all").

| Dimension | Current | After Phase 20B | After Phase 20C |
|---|---|---|---|
| Pricing clarity | 6/8 (engine is clear; final ₹ figures undecided, §8) | 8/8 | 8/8 |
| Commercial architecture | 8/8 (Plan/Subscription/PricingVersion/Payment/Refund all real, tested) | 8/8 | 8/8 |
| Subscription architecture | 2/8 (schema only, unused) | 7/8 (lifecycle real, no billing collection yet) | 7/8 |
| Revenue model | 5/8 (model decided in this report; not yet operational) | 6/8 | 8/8 (limits actually enforced = real leverage) |
| Plan structure | 3/8 (recommended here, not implemented) | 8/8 | 8/8 |
| Feature packaging | 6/8 (naturally clean — most features already tier-agnostic, §7) | 7/8 | 8/8 |
| Payment readiness | 7/8 (mock-provider-complete; Razorpay credential-blocked, per Phase 19B) | 7/8 | 7/8 (unchanged — Razorpay remains deferred) |
| Refund readiness | 8/8 (Phase 19B: full/partial, idempotent, concurrency-safe, tested) | 8/8 | 8/8 |
| Tax readiness | 3/8 (technical fields exist; legal decision entirely open, §15) | 3/8 | 4/8 (only moves once tax basis is legally resolved — not a 20C task by itself) |
| Billing readiness | 1/8 (no collection mechanism exists at all, deferred, §19) | 2/8 (lifecycle exists, still no payment collection) | 2/8 |
| Sales readiness | 2/8 (no pricing page, no sales collateral, no support system — §2.4 stubs) | 3/8 | 4/8 (real plans to point a sales conversation at) |
| Competitive positioning | 7/8 (Model A + 0% commission is a genuine, evidenced differentiator) | 7/8 | 8/8 (enforceable limits make the tiers real, not aspirational) |
| **Total /96, scaled to /100** | **58/100** | **74/100** | **80/100** |

**Reading the ceiling honestly**: even after Phase 20C, this scores 80/100, not 100 — because actual subscription *payment collection* (Razorpay) and the tax *legal* decision are both explicitly out of scope through Phase 20C, and neither can be closed by engineering work alone. Full commercial readiness requires those two external dependencies to resolve, not further phases of the kind this report can plan.

---

## 21. Final Recommendation

## Recommended ExhibitTix Commercial Model

### Business model
**Model A — Organizer-First SaaS.** Organizers pay ExhibitTix for platform access; ticket and stall sales stay commission-free.

### Pricing basis
Per-event, with an annual/unlimited-events bundle for frequent organizers (§9).

### Plans
Three tiers — **Starter, Growth, Enterprise** (§7) — mapped directly onto the `Plan` model's existing `eventLimit`/`visitorLimit`/`exhibitorLimit`/`stallLimit`/`teamMemberLimit` fields. No new schema required.

### Ticket fee
**0% commission** (§10). Server-authoritative pricing already guarantees this is enforceable and unspoofable regardless of policy.

### Stall fee
**0% commission, structurally, indefinitely** (§11) — no exhibition-specific competitor found charges one, and it would contradict the model's own positioning to introduce one on stalls while keeping tickets free.

### Exhibitor monetization
Keep the entire current exhibitor feature set free at every tier (§12). Future add-ons (featured listing, AI lead insights, extra seats) are real options for a later phase, never a reason to gate anything working today.

### Trial
**Free first exhibition**, capped at Starter-tier limits, full feature access, no calendar expiry (§13) — not a 14/30-day trial, which doesn't fit this market's months-long event-preparation cycle.

### GST/legal dependency
Merchant-of-record, settlement model, and GST treatment (including whether the seeded 18% `TicketType.taxPercent` reflects a real decision) remain **open business/legal decisions requiring a qualified Indian tax professional** — not resolved by this report, and not to be guessed at in Phase 20B/20C (§15).

### Phase 20B
Build real `Plan` records, an active `Subscription` lifecycle (trial→active→cancelled/expired), automatic plan assignment on organizer creation, and wire the platform admin subscription views to real data (§17). No billing collection.

### Phase 20C
Enforce the plan limits (§18) at the actual write points (exhibition/exhibitor-approval/ticket-booking/stall-creation/team-invite), backend-authoritative with frontend UX warnings — the same real-time, race-safe pattern already used for stall reservation and refund concurrency.

### Deferred
Razorpay, subscription billing collection, recurring billing, coupons, a full ledger, platform settlement, complex exhibitor monetization, multi-currency, enterprise billing automation (§19) — none blocked on anything in this report.

---

## 22. Commercial Readiness Score (summary)

- **Current: 58/100**
- **After Phase 20B: 74/100**
- **After Phase 20C: 80/100** (ceiling until Razorpay credentials and the GST legal decision are resolved externally)

---

## Validation

Confirmed for this phase:
- ✅ No application files modified.
- ✅ No Prisma schema modified.
- ✅ No migrations created.
- ✅ No payment or refund behavior modified.
- ✅ No Razorpay configuration added.
- ✅ No dependencies or package files modified.
- ✅ No environment variables modified.
- ✅ Report created successfully at `docs/PHASE_20A_COMMERCIAL_MODEL_REPORT.md`.

Method: this phase performed read-only inspection only (`Read`, `Grep`, `Bash` limited to `ls`/`grep`/read-only `node -e` queries against the already-running dev database for confirmation of existing data, ripgrep searches, and one read-only research subagent) plus review of the three prior phase reports (`PHASE_18`, `PHASE_19A`, `PHASE_19B`) already present in `docs/`. No `Edit`, `Write` (other than this report), or destructive command was issued against any file other than this report.

## Files Changed

- `docs/PHASE_20A_COMMERCIAL_MODEL_REPORT.md` (created)

No other file in the repository was modified.

## Final Status

**PASS**
