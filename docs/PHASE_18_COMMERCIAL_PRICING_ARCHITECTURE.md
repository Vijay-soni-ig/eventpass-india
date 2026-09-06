# EXHIBITTIX V2 — Phase 18: Commercial & Pricing Architecture Report

**Read-only analysis. No source code, schema, or configuration was modified in producing this report.**

---

## 1. Executive Summary

ExhibitTix currently has **no commercial architecture at all** — not a partial or misconfigured one, a genuinely absent one. The `Payment` model has a single `amount` field with no concept of platform fee, gateway fee, tax, or discount; the backend charges the bare ticket/stall price with nothing added; the frontend independently displays a fabricated "convenience fee + GST" breakdown that has never matched what's actually charged; and the platform earns **₹0** from every transaction that has ever run through it, by construction, not by policy choice. Platform Admin's own UI already says this plainly: *"No billing/subscription model exists in this platform yet — every organizer currently has unrestricted access regardless of plan."*

This is not a defect to patch — it's the reason this phase exists. The technical foundation (multi-tenant RBAC, real Razorpay/mock provider abstraction, webhook idempotency, audit logging) is solid and genuinely reusable for a commercial layer; what's missing is the commercial layer itself, and the business decisions that must precede building it.

Closest direct comparable found in competitor research: **Exiwik** (India, AI-native exhibition platform) explicitly markets **zero commission on ticket/stall sales plus free exhibitor CRM**, monetizing instead through **per-event or subscription SaaS fees** (₹24,999–₹55,000/event, or ₹18,500/month unlimited). This is close to what ExhibitTix's existing architecture (organizer-owned tenants, exhibitor participation lifecycle, lead CRM already built) is naturally positioned to do — a fact that materially shapes the recommendation in §11.

---

## 2. Current Commercial Architecture

**There is none.** Concretely:
- No `Subscription`, `Plan`, `Invoice`, `Ledger`, `Settlement`, `Discount`, or `Coupon` model exists anywhere in `server/prisma/schema.prisma`.
- No platform fee, gateway fee, or tax is ever added to a charged amount, backend or frontend, for either tickets or stalls.
- No admin UI or API exists to configure a fee, plan, or tax rate. Platform Admin's `/platform/subscriptions` route is an explicit, honestly-labeled stub.
- The only "pricing" concept that exists at all is the raw price the *organizer* sets per `TicketType`/`Stall` — i.e., 100% of every transaction, before any gateway cost, is currently the organizer's.
- One real monetary lever exists but is entirely unused: `TicketType.taxPercent` (a `Decimal(5,2)` field, organizer-settable at ticket-type creation) is persisted and never read anywhere in any calculation.

## 3. Current Ticket Money Flow

Traced end to end, file and line:

1. **Frontend display** (`src/pages/BookingFlow.tsx:100-104`, prior to the Phase 17 UI-honesty pass which only touched the payment-*method* selector, not this math):
   ```
   subtotal = ticketPrice × quantity
   convenienceFee = round(subtotal × 0.02)      // 2%, invented, no backing field
   gst = round(convenienceFee × 0.18)            // 18% of the fee, not of the subtotal
   total = subtotal + convenienceFee + gst
   ```
   This `total` is what the visitor sees as "Pay ₹X".
2. **API request**: `POST /api/bookings/tickets` sends only `{exhibitionId, ticketTypeId, quantity, attendee...}` — **no amount, fee, or tax field is ever sent from the client.** This is correct and important defensively (the server never trusts a client-supplied amount) — but it also means the inflated frontend total has no channel to reach the backend even if someone wanted it to.
3. **Backend calculation** (`server/src/routes/bookings.ts:40-41`):
   ```
   unitPrice = ticketType.price   // read fresh from DB, not from the request
   amount = unitPrice × quantity
   ```
   **No fee. No tax. `TicketType.taxPercent` is not read.** This `amount` is the true, sole determinant of what gets charged.
4. **Gateway order**: `createOrderForPayment({amount, ...})` (`server/src/lib/paymentService.ts`) creates a `Payment` row with `amount` = the bare backend figure, then calls the configured provider's `createOrder()`. Razorpay's own amount conversion (`server/src/lib/payments/razorpay.ts`, `Math.round(amount * 100)` for paise) just forwards this same under-taxed figure — **the frontend/backend mismatch would carry through unchanged into a real production Razorpay charge.**
5. **Actual charged amount** = the bare backend `amount`, verified via signed checkout callback or webhook (`server/src/routes/payments.ts`, `server/src/routes/paymentWebhooks.ts`) — never the frontend's inflated total.
6. **Payment record**: `Payment.amount` = bare subtotal. `TicketBooking.amountPaid` = same bare subtotal (mirrored for legacy-field reasons).
7. **Organizer revenue**: 100% of `amount` — there is no code path that ever subtracts anything from what the organizer is credited with (organizers aren't credited in any tracked way at all; see §18, no settlement ledger exists).
8. **ExhibitTix revenue**: **₹0**, always, by construction — there is no field, no calculation, and no code path anywhere that computes or stores a platform-retained amount.

**The mismatch, stated plainly:** a visitor is shown "₹509" (₹499 + ~₹10 fee/tax) and is charged exactly ₹499. The organizer receives what looks like the full sticker price with nothing subtracted, and the "extra" the visitor thinks they're paying for platform/tax costs is never collected by anyone.

## 4. Current Stall Money Flow

Identical pattern, traced through `server/src/routes/exhibitorParticipations.ts` (`POST /:id/payment`):
```
amount = Number(stall.price)   // no fee, no tax, no commission
```
`createOrderForPayment({amount, ...})` — same provider path as tickets. Stall bookings have no frontend price-breakdown UI at all (unlike tickets, which at least *show* a fabricated fee/tax split) — the exhibitor sees only the bare stall price throughout. **Organizer keeps 100% of stall revenue too; ExhibitTix earns ₹0 on stalls as well.**

## 5. Current Refund Flow

More built than expected, but incomplete and stall-only:
- `POST /api/organizer/payments/:paymentId/refund` (`server/src/routes/organizerPayments.ts:84-115`) exists, is permission-gated (`payment:manage`), calls the configured provider's real `refund()` method (Razorpay's actual refund API when configured; the mock provider returns `status: "pending"` rather than pretending money moved), and only marks the payment `"refunded"` in the database if the provider itself confirms `status: "processed"` — a genuinely careful implementation.
- **This route only queries `StallBooking`** (`prisma.stallBooking.findFirst(...)`) — **there is no equivalent refund endpoint for ticket bookings at all.**
- **No partial refund support** — the amount refunded is always `Number(booking.payment.amount)`, the full original amount.
- **No frontend UI anywhere calls this endpoint** — confirmed via full-codebase search of `src/`; the only appearances of the word "refund" in the frontend are a `PaymentStatus` type union member and static legal-page copy (`RefundPolicy.tsx`, `TermsOfService.tsx`). This is a backend-only, curl-reachable capability today.
- Cancelled-event and cancelled-booking flows exist structurally (`applyPaymentOutcome`'s `"refunded"` branch releases the stall back to `available` and cancels the participation), but nothing in the product actually *triggers* an event-level mass-refund — an organizer cancelling an entire exhibition today has no built-in way to refund every affected booking in bulk.

## 6. Current Free Ticket Flow

`server/src/routes/bookings.ts:50-56`: when `amount === 0`, the gateway is skipped entirely — a `Payment` row is created directly with `status: "paid"`, `provider: "free"`, `amount: 0`. No signature, no webhook, no order. This is clean and correct as far as it goes — but it also means **a completely free exhibition today generates literally zero revenue events of any kind for ExhibitTix**, by the current architecture. §12 addresses how that could still be monetized.

## 7. Current Data Model

| Entity | Current fields (commercial-relevant) | Commercial purpose today | Missing fields | Recommendation |
|---|---|---|---|---|
| `TicketType` | `price`, `quantity`, `taxPercent` (unused), `visible` | Organizer sets the sticker price | `platformFeeOverride`, `feeBasis` reference, `pricingVersionId` | Wire `taxPercent` into the actual calculation before anything else (§13); add a pricing-version reference once versioning exists (§21) |
| `Stall` | `price`, `status`, `stallType` | Organizer sets stall price | Same as `TicketType` — no fee/tax concept at all for stalls | Mirror whatever ticket pricing model is chosen |
| `Payment` | `amount` (single figure), `currency`, `provider`, `providerOrderId`/`providerPaymentId`, `status`, `metadata` (raw gateway JSON) | Records what was charged and its lifecycle | `baseAmount`, `platformFeeAmount`, `gatewayFeeAmount`, `taxAmount`, `discountAmount`, `organizerPayableAmount`, `platformRevenueAmount`, `feePaidBy`, `settlementStatus`, `settlementDate`, `pricingVersionId` | This is the single highest-leverage schema change — see §12/§17 |
| `PaymentEvent` | `provider`, `providerEventId` (unique), `eventType`, `payload` (raw) | Webhook idempotency | None for commercial purposes — this model is already correctly scoped to its job | No change needed |
| `TicketBooking` / `StallBooking` | `amountPaid`, `paymentStatus` (legacy mirror of `Payment`) | Convenience denormalization | Same gaps as `Payment`, inherited | Should stay a thin mirror; don't duplicate the full breakdown here — reference `Payment` |
| `ExhibitorBusiness` | `invoicePreference` (free-text string, unused anywhere in logic), `kycStatus`, `bankVerified`, `bankAccountName/Number/Ifsc` | Bank details exist for a payout/settlement flow that doesn't exist yet | `payoutAccountVerifiedAt`, `settlementModel` reference | The bank fields already collected are exactly what a `DIRECT` settlement model (§14) would need — don't recollect, just start using them |
| `Organizer` | `kycStatus`, `bankVerified`, `bankAccountName/Number/Ifsc`, `suspended` | Same as above, for the organizer as merchant | `planId`/`subscriptionId`, `merchantOfRecord` flag | Same bank-field reuse point |
| *(none)* | — | — | No `Subscription`, `Plan`, `Discount`, `Coupon`, `Invoice`, `Ledger`, `Settlement`, or `PricingVersion` model exists | See §18 for which of these are actually justified |

## 8. Competitor Research

Sourced via live web search (September 2026). Pricing marked **[VERIFIED]** where a source stated a specific current figure, **[ESTIMATED/RANGE]** where sources gave a range or "starting at," **[QUOTE-BASED]** where no public figure exists, **[UNAVAILABLE]** where search returned nothing usable.

| Competitor | Target customer | Pricing model | Subscription | Per-event fee | Ticket fee | Stall revenue | Exhibitor revenue | Key advantage |
|---|---|---|---|---|---|---|---|---|
| **Eventbrite** | General event organizers, global/US-centric | Transaction fee, attendee or organizer pays | No | No | **[VERIFIED]** 3.7% + $1.79/ticket + 2.9% payment processing; free for free events | N/A (not exhibition-focused) | N/A | Massive discovery/marketplace network effect |
| **Townscript** | Indian event organizers, ticketed public events | Transaction fee | No | No | **[VERIFIED]** ~1.99% + ₹10/ticket platform fee, plus ~1.99% gateway fee (attendee-facing ~2% total); free for free events | N/A | N/A | India-native payment gateways, INR-first |
| **Explara** | Small–mid orgs, associations/clubs/memberships | Transaction fee | Free tier | No | **[VERIFIED]** 4% via built-in gateway, or ~1% + external gateway on higher tiers; free up to first 25 registrations | N/A | N/A | Membership + events combined |
| **EventTitans** | SMB–mid event organizers | Freemium + payment pass-through | **[VERIFIED]** Free/Premium/Ultimate tiers, ~$99/yr special offer seen | Possible | **[VERIFIED]** 3.4% + $0.30/transaction, organizer choice to absorb or pass on | Some exhibitor booth features | Limited | Free tier for entry, low-friction trial |
| **Cvent** | Large enterprise, high-volume/complex events | Modular license + usage | **[ESTIMATED/RANGE]** $10,000–$100,000+/month reported by third-party cost guides | N/A | Per-registrant fee on top of license (**[QUOTE-BASED]**, not public) | Enterprise exhibitor/sponsor modules | Enterprise sponsor packages | Deep enterprise workflow depth, CRM/integration ecosystem |
| **ExpoPlatform** | Mid–large exhibition/trade-show organizers | Subscription or per-event, quote-based | **[ESTIMATED/RANGE]** "from $2,000/month" per third-party sources | **[ESTIMATED/RANGE]** "starting at $5,000/event" per third-party sources | **[QUOTE-BASED]** | Booth/floor-plan tools included | Lead retrieval, sponsorship management included | Full hybrid/virtual + in-person exhibition feature set, closest structural comparable to ExhibitTix's ambition |
| **Exiwik** | Indian exhibition organizers (direct comparable — AI-native, organizer + exhibitor) | Per-event or subscription SaaS fee, **zero transaction commission** | **[VERIFIED]** ₹18,500/month unlimited events (Max Unlimited, billed annually) | **[VERIFIED]** ₹24,999 (Pro) or ₹55,000 (Max) per event | **[VERIFIED]** 0% — "organizers keep 100% of ticket and stall sales" | Included, 0% commission | **[VERIFIED]** Free — "booth CRM and AI lead capture come included free with every event" | Explicit 0%-commission positioning + AI lead capture, closest direct competitor |
| **Ticmint / Zoho Backstage / EventGateTicket** | India, budget-conscious organizers | 0% commission + flat fee | Varies | Varies | **[VERIFIED, general pattern]** ₹7–₹9/ticket flat (EventGateTicket) or flat monthly, explicitly *not* percentage-of-sale | N/A | N/A | "0% commission" as the entire marketing pitch |

**General market pattern** (not one competitor, synthesized across the above): most mainstream ticketing platforms charge **3–15% per paid ticket** (commission model); a growing niche of India-focused platforms instead charge **flat per-ticket or flat monthly/per-event fees with an explicit "0% commission"** positioning, aimed specifically at organizers who resent variable-cost pricing on their own revenue. Enterprise exhibition platforms (Cvent, ExpoPlatform) skip transaction fees almost entirely and monetize through **subscription/license + per-event** pricing instead, because their buyers are organizations running exhibitions as a paid service, not selling low-margin general-admission tickets.

## 9. Market Pricing Patterns

1. **Two dominant models exist, and they don't mix well**: (a) **transaction-fee/commission** (Eventbrite, Townscript, Explara, EventTitans) — scales with the organizer's own revenue, easy to start free, but organizers increasingly resent it once volume grows; (b) **subscription/per-event SaaS fee** (Cvent, ExpoPlatform, Exiwik) — predictable for both sides, but requires upfront trust/commitment before the organizer has proven the event will sell.
2. **Common transaction fee shape**: percentage + small fixed component (Eventbrite's 3.7% + $1.79; Townscript's 1.99% + ₹10) — the fixed component protects the platform's revenue on low-priced tickets, where a pure percentage would round to nothing.
3. **Who pays**: overwhelmingly **attendee-facing by default**, with an organizer opt-in to absorb it instead (Eventbrite, EventTitans both explicitly frame it this way). This is a *default*, not a technical constraint — every platform researched lets the organizer choose.
4. **Fee pass-through to attendees is standard and expected** in the Indian market specifically — visible in Townscript's explicit "2% platform fee to attendees" language and Eventbrite's "added on top... but you can choose to absorb."
5. **Enterprise platforms monetize via license, not per-ticket** — Cvent and ExpoPlatform both because their exhibition customers run few, large, high-stakes events where a subscription/license relationship makes more sense than nickel-and-diming per registrant.
6. **Exhibition-specific platforms monetize exhibitors separately from ticketing** — Exiwik gives away exhibitor CRM/lead capture *free* specifically to make the organizer's sales pitch to exhibitors easier, and instead charges the organizer directly. No exhibition-specific competitor found charges the exhibitor a transaction fee on stall payments.
7. **"0% commission" is a genuine, viable positioning in India right now** — not a niche gimmick; multiple funded platforms (Ticmint, Zoho Backstage, EventGateTicket, Exiwik) lead with it, because Indian organizers are demonstrably price-sensitive about variable per-sale fees and receptive to flat/predictable costs instead.
8. **Per-event pricing is common specifically in the exhibition (not general-ticketing) segment** — Exiwik and ExpoPlatform both offer it, because exhibitions are naturally episodic (a handful of events per year, not continuous ticket sales) in a way general ticketing platforms' customers aren't.
9. **Subscription-only (no per-event, no transaction fee) is rare** in this exact segment — every competitor found blends at least two revenue mechanisms.
10. **Strongest-looking streams for ExhibitTix specifically**, based on this research: **(a)** a per-event or subscription SaaS fee to the organizer (proven viable by the single closest direct comparable, Exiwik), **(b)** a modest, clearly-attendee-facing ticket fee with organizer opt-out (the market-standard default), and **(c)** exhibitor-side monetization kept separate and optional, not bundled into the core transaction — mirroring what already differentiates Exiwik from generic ticketing platforms.

## 10. Three Business Models

### MODEL A — Organizer-First SaaS
- **Customer**: the organizer, paying directly for platform access.
- **Revenue source**: subscription and/or per-event fee. Ticket/stall transaction fee is zero or near-zero.
- **Pricing structure**: e.g. free/low tier for a small single event, paid tiers for volume/features, enterprise custom.
- **Advantages**: predictable MRR, doesn't penalize organizer success (no per-sale drag), easiest to explain, matches Exiwik's proven positioning in this exact market.
- **Disadvantages**: requires organizer to commit/pay before the event proves out — a real barrier for a first-time or small organizer testing the platform; free tickets and free exhibitions genuinely generate zero platform revenue unless a separate fee structure exists for them too.
- **Implementation complexity**: **Low** relative to the others — requires a `Plan`/`Subscription` concept and gating, but the transaction/payment path barely changes.
- **Scalability**: revenue scales with organizer count and plan tier, not event volume — very scalable operationally (no per-transaction processing overhead to justify), but growth is gated by sales/conversion of new organizers.
- **Customer resistance**: moderate — asking a small/first-time organizer to pay upfront before any ticket has sold is a real conversion barrier.
- **Competitive positioning**: directly matches Exiwik's proven model; differentiable via the already-built lead CRM, analytics, and RBAC depth.
- **Ticket-volume dependency**: **low** — revenue doesn't depend on how many tickets sell.
- **Exhibition-size dependency**: **moderate** — larger organizers with bigger/more frequent exhibitions are natural upsell targets for higher tiers.

### MODEL B — Transaction-First
- **Customer**: effectively both organizer and attendee, since fees are attached to each transaction.
- **Revenue source**: percentage and/or fixed fee per ticket and/or per stall payment.
- **Pricing structure**: e.g. X% + ₹Y per ticket, similarly for stalls; fee payer configurable.
- **Advantages**: zero-friction entry (organizer pays nothing upfront, free events cost nothing), revenue scales automatically with success, matches the majority market pattern (Eventbrite/Townscript/Explara/EventTitans all do this).
- **Disadvantages**: **zero revenue from free exhibitions/tickets** unless a separate mechanism exists (a meaningful gap for a platform that wants to also serve community/free events); increasingly resented by organizers at volume (the exact reason the "0% commission" competitor niche exists); revenue is unpredictable event-to-event.
- **Implementation complexity**: **Medium** — requires the fee/tax breakdown fields in `Payment` and correct amount calculation server-side, but no subscription/plan system needed.
- **Scalability**: scales naturally with transaction volume; no organizer-acquisition-gated ceiling the way Model A has, but a real revenue floor of ₹0 for a slow month.
- **Customer resistance**: **low to start** (free to try), **rising with volume** (exactly the dynamic the 0%-commission competitors are exploiting against incumbents).
- **Competitive positioning**: crowded — this is what most competitors already do; ExhibitTix would be one of many, without Exiwik's differentiated "0% commission" story.
- **Ticket-volume dependency**: **high** — revenue is directly proportional to sales.
- **Exhibition-size dependency**: **high** — bigger exhibitions with more tickets/stalls generate proportionally more.

### MODEL C — Hybrid (SaaS + Transactions + Exhibitor Monetization)
- **Customer**: organizer (primary), exhibitor (secondary, optional).
- **Revenue source**: a smaller/optional per-event or subscription fee **plus** a modest transaction fee **plus** optional exhibitor add-ons (§15).
- **Pricing structure**: e.g. low or waived base fee for small/free events, transaction fee kicks in only above a threshold or for paid tickets, exhibitor premium features priced separately.
- **Advantages**: revenue floor from the base fee even in a slow month, upside from transaction volume, a third independent lever (exhibitor monetization) that doesn't depend on ticket sales at all; most resilient to any single stream underperforming.
- **Disadvantages**: most complex to explain to a prospective organizer ("what exactly am I paying for?"); most complex to build (needs both the subscription/plan system *and* the fee/tax breakdown *and* exhibitor billing); highest engineering cost before any revenue.
- **Implementation complexity**: **High** — effectively Model A + Model B + a new exhibitor billing surface, all at once.
- **Scalability**: the most scalable long-term (three independent growth levers), but the slowest to reach initial revenue given the build cost.
- **Customer resistance**: **variable** — can be tuned low by making the base fee genuinely small/waived for small organizers, but the *complexity* of explaining three revenue mechanisms is itself a form of resistance.
- **Competitive positioning**: **strongest long-term** if executed well — no single researched competitor combines all three cleanly (Exiwik is closest but explicitly keeps exhibitor features free); ExpoPlatform's enterprise pricing hints at bundled value but isn't public/comparable.
- **Ticket-volume dependency**: **moderate** (one of three levers, not the only one).
- **Exhibition-size dependency**: **moderate-high** (bigger exhibitions are better customers across all three levers simultaneously).

## 11. Recommended Business Model

**Recommend Model A (Organizer-First SaaS) now, with an explicit, architecturally-prepared path to Model C (Hybrid) later — not Model B, and not a full Model C build today.**

Why, weighed against the stated considerations:
- **Indian market / small organizers**: the research is unambiguous that Indian organizers are price-sensitive specifically about *variable, per-sale* fees (the entire 0%-commission competitor niche exists because of this). A transaction-fee-first model (B) would put ExhibitTix in direct, crowded competition against exactly the incumbents Indian organizers are already trying to escape.
- **Free exhibitions**: Model A is the only one of the three that generates *any* revenue path for a fully free exhibition (via the base subscription/event fee) without inventing something new — Model B earns literally ₹0 on free events by construction (§6), and that's a real gap for a platform whose own seed/demo data already includes a free ticket type.
- **Small vs. medium vs. large organizers**: a tiered subscription/per-event structure naturally accommodates all three — a free or near-free tier for a small organizer's first event (low resistance, matching the "free to start" expectation the market has trained), scaling up for medium/large organizers running bigger or more frequent exhibitions.
- **Recurring events / organizer retention**: a subscription relationship is *inherently* a retention mechanism in a way a pure per-transaction fee isn't — the organizer has an ongoing reason to stay engaged with the platform between events.
- **Predictable ExhibitTix revenue**: subscription/per-event fees produce far more predictable revenue than a percentage-of-sales model with unpredictable event-to-event ticket volume.
- **Competitive positioning**: directly validated by Exiwik, the closest real competitor found — an India-focused, exhibition-specific platform already succeeding with almost exactly this model.
- **Why not Model C immediately**: it's the right long-term shape, but building the subscription system, the fee/tax breakdown, *and* exhibitor billing simultaneously — before a single paying organizer exists — is the highest-risk, highest-cost path with no validation in between. Model A can be shipped, sold, and learned from first; the transaction-fee and exhibitor-monetization layers (§10/§15) can be added later **without re-architecting**, provided the `Payment` model gets the fee-breakdown fields now (§12) even if every fee is initially configured to zero. This is precisely what §16 (pricing versioning) and the "configure now, don't hard-code" instruction in this phase are for.

## 12. Pricing Engine Architecture

**Design only — nothing here is implemented.**

Conceptual calculation, computed server-side, never trusted from the client:

```
baseAmount            = sum(ticketPrice × quantity)  OR  stallPrice
platformFeeAmount     = f(baseAmount, feeConfig)      // percentage, fixed, or both — see below
paymentGatewayFee     = f(customerPayable, gatewayConfig)  // Razorpay's own cut; informational, not charged twice
taxAmount             = f(taxableBase, taxConfig)     // taxableBase itself is configurable — see §13
discountAmount        = f(baseAmount, discountConfig) // if/when discounts exist — currently N/A, see §10 (no coupon system today)

customerPayable       = baseAmount + platformFeeAmount(if attendee-paid) + taxAmount - discountAmount
organizerSettlement   = baseAmount - platformFeeAmount(if organizer-paid) - discountAmount
exhibitTixRevenue     = platformFeeAmount  // regardless of who paid it
```

Every quantity above (`platformFeeAmount`, `taxAmount`, `discountAmount`) must be resolvable from a single, **versioned, immutable-once-used** configuration object (§17) — never a hardcoded constant in route code, and never recomputed differently for display (frontend) vs. charge (backend). The current bug (§3) is exactly what happens when those two calculations live in two different places with no shared source of truth.

**Must support, per the explicit requirement, all without code changes once built:**
- Organizer-paid, attendee-paid, or split fee (§13)
- Percentage fee, fixed fee, or percentage + fixed (matches the Eventbrite/Townscript pattern in §9)
- Tax-inclusive vs. tax-exclusive pricing (§14)
- Configurable tax basis (on base amount only, or on base + platform fee — a real open question, see §14)
- Discounts/coupons (not built at all today — a genuinely new concept, not a config toggle on an existing one)
- Free tickets/stalls (already correctly bypass the gateway entirely — that specific behavior should be preserved, not routed through the fee engine at all when the true amount is zero)
- Refunds, including partial (not supported today even for the one refund path that exists — §5, §15)
- Multiple currencies (today `Payment.currency` exists but is always `"INR"` — the field is there, nothing else is)
- Pricing versioning (§17 — this is the mechanism that makes "configurable later" safe rather than dangerous)

## 13. Fee Responsibility

**Recommended conceptual model**: a per-organizer (not global) configuration value, e.g. `feePaidBy: ORGANIZER | ATTENDEE | SPLIT`, defaulting to whatever the business decides (§28) but overridable per organizer/plan — because the research (§9) shows this is genuinely a per-market-segment choice (a large recurring enterprise organizer may prefer to absorb it as a cost of doing business; a small one-off organizer may prefer to pass it through). This should live as configuration data, not a code branch, exactly per the phase's own instruction not to hard-code it.

Similarly:
- **`taxPaidBy`**: conceptually less flexible than `feePaidBy` in most real GST scenarios — tax is typically borne by whoever the taxable supply is *to*, which is a legal question (§14), not a free business choice the way fee-absorption is. Recommend keeping this configurable in the data model regardless, so the *technical* system doesn't force a premature legal assumption, while flagging clearly that the actual value must come from the tax decision in §14/§28, not from product preference.
- **`merchantOfRecord`**: conceptually `ORGANIZER | EXHIBITTIX`. This is the single most consequential of these four settings — it determines who is legally selling the ticket, whose GST registration applies, and who bears chargeback/dispute risk. **This is not resolvable from the codebase and must not be guessed** (§13/§28).
- **`settlementModel`**: conceptually `DIRECT | PLATFORM_SETTLEMENT`. `DIRECT` (money flows to the organizer's own gateway account, ExhibitTix's fee is invoiced/deducted separately) is the lower-liability, lower-implementation-complexity option and is consistent with `merchantOfRecord: ORGANIZER`. `PLATFORM_SETTLEMENT` (ExhibitTix collects everything, then pays out the organizer's share) is consistent with `merchantOfRecord: EXHIBITTIX`, is what a Razorpay Route/Marketplace-style integration would require, and is a materially bigger compliance and engineering undertaking (it makes ExhibitTix responsible for holding customer money and executing payouts, which typically has its own regulatory requirements in India). **The existing bank-account fields already on `Organizer`/`ExhibitorBusiness` (§7) are exactly what a `DIRECT` model needs and are currently unused** — this is a concrete signal that `DIRECT` settlement may already be the path of least resistance given what's already been built, though this is an observation from the code, not a substitute for the actual decision.

## 14. Tax/GST Architecture

**Strict separation, as instructed:**

### TECHNICAL DESIGN (what the system should be able to represent)
- A `taxBasis` configuration: does tax apply to `baseAmount` only, or to `baseAmount + platformFeeAmount`? The system should store this as an explicit, versioned setting, not infer it.
- A `taxInclusive` boolean: is the organizer's listed ticket price already tax-inclusive (tax is backed out of it) or tax-exclusive (tax is added on top)? Both are legitimate real-world patterns and the UI/calculation needs to know which.
- A per-ticket-type (or per-organizer-default) tax rate — `TicketType.taxPercent` **already exists** for exactly this and should be the field actually wired up, not a new one invented.
- Separate tracking of tax on the platform's own fee revenue vs. tax on the organizer's ticket/stall revenue — these may legally be two different taxable supplies with two different responsible parties (see below), and the data model should be able to represent both amounts distinctly even before the legal question is answered.
- Invoice generation (§15) needs to know which party's GSTIN goes on which document — a direct consequence of the `merchantOfRecord` decision (§13).

### LEGAL/TAX DECISION (must be confirmed with a qualified Indian tax/accounting professional — NOT decided here)
- Whether ExhibitTix's platform fee is itself a taxable supply requiring its own GST invoice separate from the organizer's ticket sale.
- Whether GST should be computed on the base ticket price only, or on the base price plus the platform fee, once a platform fee exists.
- Whether the payment gateway's own fee (Razorpay's cut) has any GST treatment implications for ExhibitTix or the organizer.
- Who is the "seller" of record for GST purposes on a ticket sale — the organizer or ExhibitTix — which depends directly on the `merchantOfRecord`/`settlementModel` decision in §13 and has real compliance consequences either way.
- Whether ExhibitTix needs its own GST registration and to issue tax invoices for its platform fee, or whether that responsibility stays entirely with each organizer.
- Whether the current `taxPercent` field's *existence* (seeded with 18% on paid ticket types, per Phase 15's seed data) reflects an actual prior decision that GST applies to the organizer's ticket price at 18%, or was simply a plausible-looking placeholder — **this should be confirmed with whoever set that seed value**, not assumed either way by this report.

**The application should be able to represent whichever tax model is eventually chosen without rewriting the payment architecture** — this is achievable precisely by adding the fee/tax/basis fields to `Payment` now (§7, §12) and wiring `taxPercent` into the real calculation, even before every legal question above is answered; the "does it get charged and to whom" plumbing and the "what rate, on what basis, whose GSTIN" legal question are separable engineering vs. legal concerns, exactly as the phase instructions frame it.

## 15. Ticket + Stall Revenue

| | Ticket | Stall |
|---|---|---|
| **Current organizer take** | 100% | 100% |
| **Current ExhibitTix take** | 0% | 0% |
| **SaaS/subscription fee applicable?** | Yes — same organizer-level fee could reasonably cover both, since both live under the same exhibition | Yes, same as ticket |
| **Platform (transaction) fee applicable?** | Common in the market (§9); would be attendee-facing by default per market convention | **Uncommon** — no exhibition-specific competitor researched charges a per-stall transaction fee; stalls are exhibitor B2B purchases, not consumer retail, and exhibitors are a more price-sensitive, relationship-driven customer than a one-off ticket buyer |
| **Commission-style (% of stall price) applicable?** | N/A (tickets aren't usually "commissioned") | Technically possible but **not seen in any researched competitor** — Exiwik explicitly avoids this ("organizers keep 100% of... stall sales") specifically as a differentiator |

**Which is more attractive to organizers**: near-certainly the ticket side carrying any transaction fee (if one exists at all), with stalls left commission-free. This mirrors Exiwik's exact positioning and is consistent with §9's finding that exhibition platforms monetize ticketing and exhibitor relationships through fundamentally different mechanisms — an organizer's relationship with *their* exhibitors is closer to a partnership they don't want ExhibitTix taking a cut of, while ticket buyers are ExhibitTix's own product surface (QR entry, the booking flow, the visitor account) in a way stall transactions aren't.

## 16. Exhibitor Monetization

Evaluated candidate features against a free / per-event / subscription / organizer-sponsored / add-on model:

| Feature | Best-fit model | Reasoning |
|---|---|---|
| Basic lead capture (already built) | **Free**, always | This is core to the organizer's own value proposition (their exhibitors need to be able to do their job) — gating it would undermine the organizer relationship, and Exiwik's exact positioning confirms the market expects this free |
| Lead export / lead analytics (already built) | Free or **organizer-sponsored** | Already exists and works (Phase 15); charging retroactively for existing functionality would be poor practice — better framed as included in whatever plan the *organizer* is on |
| Team members (already built) | Free | Same reasoning — core participation functionality |
| Advanced/AI lead summaries (not built) | **Add-on**, per-exhibitor or organizer-bundled | A genuinely new premium capability — natural upsell, doesn't touch existing free functionality |
| WhatsApp follow-up (not built) | **Add-on**, likely per-event or usage-based | New capability with a real per-message cost to ExhibitTix (WhatsApp Business API pricing) — should be priced to at least cover that cost |
| Post-event campaigns (not built) | **Add-on** | New capability, optional |
| Priority visibility / exhibitor marketing tools (not built) | **Add-on** or organizer-controlled | Raises a fairness question (does paying for visibility disadvantage other exhibitors at the same event) — worth flagging as a product-design question, not just a pricing one |

**Recommendation**: keep exhibitor monetization strictly **additive and optional**, never gating anything currently free (Phase 15/16 already established these as working, expected features). This is the same principle Exiwik uses and avoids alienating the organizer's own customers (exhibitors), which would undermine the primary Model A relationship this report recommends. Do not build any of this now (§21) — it's a Phase-20-or-later concern once Model A's core subscription/plan system exists to bundle it into.

## 17. Free Event Strategy

| | Ticket | Stall |
|---|---|---|
| **A. Free exhibition** (organizer charges nothing for anything) | — | — |
| **C/D. Free ticket** | Correctly bypasses gateway today (§6); generates zero transaction revenue | — |
| **E. Free stall** | — | Stalls aren't typically free even in a "free exhibition," but architecturally nothing prevents `price: 0` |

**How ExhibitTix can still monetize a completely free exhibition — this is exactly why Model A (§11) matters**: under a transaction-fee-only model (Model B), a free exhibition is worth ₹0 to ExhibitTix, full stop, no matter how much organizer effort, platform usage (QR generation, check-in scanning, analytics, lead capture — all real infrastructure cost) it consumes. Under Model A, the organizer's subscription/per-event fee is charged for *running the exhibition itself*, independent of whether any individual ticket inside it is priced at zero — the platform is being paid for the tooling (venue/stall/exhibitor/QR/analytics infrastructure), not for processing a transaction that may not exist. This is a genuine, material reason free events matter to the recommended business model, not just an edge case to shrug off.

## 18. Refund Architecture

Design only. Building on what already exists (§5):

- **Full refund**: already implemented for stalls via the provider's real refund API with correct "only mark refunded if the provider confirms" logic — this pattern should be extended to tickets, not redesigned.
- **Partial refund**: does not exist today (always refunds `payment.amount` in full). Would require the refund endpoint to accept an amount, validate it against the original `Payment.amount` and any prior partial refunds (meaning `Payment` needs to track cumulative-refunded-so-far, not just a boolean/enum "refunded" status), and pass that amount to the provider's refund call (Razorpay's refund API already supports partial amounts, per `razorpay.ts`'s existing `refund(providerPaymentId, amount)` signature accepting an amount parameter — the plumbing for partial refunds is closer to existing than it might appear).
- **Cancelled event**: needs an organizer-facing bulk action ("cancel this exhibition and refund all bookings") that doesn't exist today — would iterate every paid `TicketBooking`/`StallBooking` under the exhibition and invoke the same per-payment refund logic, ideally as an async/background job given potential volume, with clear partial-failure handling (some refunds may fail at the gateway) surfaced back to the organizer.
- **Cancelled booking** (single, attendee or exhibitor initiated): the ticket-side refund endpoint this report recommends adding (mirroring the existing stall one) covers this once built; today it doesn't exist for tickets at all.
- **Payment failure**: already correctly handled — `applyPaymentOutcome`'s terminal-state guard means a failed payment never gets confused with a refund.
- **Duplicate payment**: already correctly prevented — the `PaymentEvent` unique constraint on `(provider, providerEventId)` makes webhook redelivery idempotent (verified live in Phase 15).
- **Webhook retry**: same idempotency mechanism already covers this correctly.
- **Platform fee refund**: an open design question that only becomes real once a platform fee exists at all (§12) — should ExhibitTix refund its own fee when a ticket is refunded, or only refund the organizer's portion? This is a business policy decision, not a technical one, and should be captured in the same fee-configuration object as the fee itself so it can vary (e.g., a "no-fee-refund" policy for cancellations caused by the organizer vs. a "keep the fee" policy for attendee-initiated refunds close to the event date).
- **Gateway fee**: Razorpay (and most gateways) typically does not refund its own processing fee on a refunded transaction — this is a real cost ExhibitTix or the organizer absorbs on every refund, and should be represented explicitly in the ledger recommendation (§19) rather than silently disappearing.
- **Tax reversal**: directly dependent on the tax decision in §14 — whatever GST was charged on the original transaction needs a corresponding credit note mechanism once real GST invoicing exists; not resolvable independent of that decision.
- **Organizer settlement reversal**: only becomes a real concept once a settlement/payout system (§13's `PLATFORM_SETTLEMENT` model) exists; under a `DIRECT` settlement model, refunds are the organizer's own gateway-account concern and ExhibitTix's involvement is limited to its own fee's refund policy.

## 19. Invoicing

| Document | Generated by | Reasoning |
|---|---|---|
| Attendee receipt (ticket purchase confirmation) | **ExhibitTix**, always | Already effectively exists in spirit (the booking confirmation screen/QR) — formalizing it as a proper receipt is a small step from what's built |
| Organizer invoice (for ExhibitTix's platform/subscription fee) | **ExhibitTix** | ExhibitTix is the seller of this specific service regardless of the merchant-of-record decision for tickets — this one is unambiguous |
| Exhibitor invoice (for stall payment to the organizer) | **Configurable**, likely **organizer**, since the organizer is selling the stall | Depends on `merchantOfRecord` (§13) — if stalls stay `DIRECT`/`ORGANIZER`, the organizer is the legal seller and should issue this |
| Platform fee invoice (breakdown shown to organizer/attendee of what ExhibitTix charged) | **ExhibitTix** | Same reasoning as the organizer invoice above |
| Settlement statement (what an organizer was paid out, net of fees) | **ExhibitTix**, only relevant under `PLATFORM_SETTLEMENT` (§13) | Not needed at all under a `DIRECT` model, where the organizer's own gateway account is the record |
| Refund receipt | **ExhibitTix** | Natural counterpart to the attendee receipt |
| GST invoice (where applicable) | **Configurable**, depends entirely on §14's legal resolution | Cannot be assigned without knowing who the taxable seller is |

**Recommendation**: build attendee receipts and ExhibitTix→organizer platform-fee invoices first (both are unambiguous regardless of how §13/§14 resolve); defer exhibitor/settlement/GST invoicing until those decisions land, since building them prematurely risks generating legally-incorrect documents.

## 20. Pricing Versioning

**This is the mechanism that makes "configure it later, don't hard-code it now" safe rather than dangerous, and should be treated as a prerequisite, not a nice-to-have, for any pricing-engine work.**

Conceptual flow, exactly as the phase describes:
```
PricingVersion 1 (effective from T1)
  → Exhibition created, references PricingVersion 1 (or inherits the organizer's/platform's active version at creation time)
  → Every Booking/Payment created under this exhibition stores a reference to PricingVersion 1
  → That reference is permanent — it is never updated retroactively

PricingVersion 2 (effective from T2, created later by Platform Admin)
  → New Exhibitions/Bookings created after T2 reference PricingVersion 2
  → All PricingVersion-1 transactions remain exactly as they were charged, permanently
```

**Why this matters concretely**: without it, a Platform Admin changing "the platform fee" from 2% to 3% would silently and retroactively reinterpret every historical `Payment` row's meaning (since there'd be nowhere to record which rate actually applied at charge time), corrupting financial reporting and creating real accounting/audit/legal exposure. The phase's own instruction — "avoid creating a dangerous system where admins can silently alter historical transactions" — is exactly this failure mode. A `PricingVersion` (or equivalently-scoped) record, referenced by ID from every `Payment` at creation time and never mutated after, is the standard, well-understood pattern for this class of problem.

## 21. Financial Ledger Requirement

**The current single-`amount`-field `Payment` model is not sufficient once any fee/tax/discount exists** — it can represent "what was charged" but not "what that charge was made of" or "who owes/owns which portion of it." Whether a full separate ledger *system* is justified is a different, larger question.

**Recommendation: extend `Payment` with the breakdown fields identified in §7/§12 (baseAmount, platformFeeAmount, gatewayFeeAmount, taxAmount, discountAmount, organizerSettlementAmount, platformRevenueAmount, feePaidBy, pricingVersionId) rather than building a separate ledger/general-ledger system immediately.** A full double-entry ledger layer (`LedgerEntry` with debit/credit semantics, account references, etc.) is the kind of infrastructure that becomes necessary once `PLATFORM_SETTLEMENT` (§13) is real — i.e., once ExhibitTix is actually holding and moving money between parties, not just recording what a gateway already settled directly to an organizer. Building it before that decision is made would be speculative. **If and when `settlementModel: PLATFORM_SETTLEMENT` is chosen, a proper ledger becomes justified and should be revisited then** — not built preemptively now.

## 22. Admin Pricing Controls

What Platform Admin should eventually control, once built (none of this exists today — `/platform/subscriptions` is an honest stub):
- Platform fee (percentage and/or fixed, per §12)
- Tax configuration (rate, basis, inclusive/exclusive — per §14, technical settings only, not the legal determination itself)
- Plan/subscription tiers and their included features
- Exhibitor add-on pricing (once §16 is built)
- Organizer-specific overrides (e.g., a negotiated enterprise rate)
- Promotional/discount pricing (once a discount system exists at all — it doesn't today)
- **Pricing effective date and version** — this is the control surface for §21; every change here creates a *new* `PricingVersion`, it never edits an existing one in place.

**The critical safety property, restated**: any admin action that changes a fee/tax/plan value must create a new versioned record and change *only which version new transactions reference going forward* — it must be structurally impossible (not just policy-discouraged) for such a change to alter the interpretation of an already-completed `Payment`. This is the same principle as §20, stated here from the admin-UI-design angle rather than the data-model angle.

## 23. Security & Financial Integrity

Current state, verified against the actual code (not assumed):

| Concern | Current status | Evidence |
|---|---|---|
| Client-side amount manipulation | **Not possible today** — the booking request never includes an amount at all; the server always recomputes from `TicketType.price`/`Stall.price` fresh from the database | `server/src/routes/bookings.ts:40-41`, `server/src/routes/exhibitorParticipations.ts` payment route |
| Server-side recalculation | **Correctly enforced** — same evidence as above | — |
| Payment amount verification | **Correctly enforced** — checkout signature and webhook both verify against the gateway's own signed response, never a client claim | `server/src/routes/payments.ts`, `server/src/routes/paymentWebhooks.ts` |
| Webhook verification | **Correctly enforced** — HMAC signature check before any processing | `server/src/lib/payments/razorpay.ts`, confirmed live-tested in Phase 15 |
| Idempotency | **Correctly enforced** — unique `(provider, providerEventId)` constraint, `P2002`-caught, verified live in Phase 15 | `server/src/lib/paymentService.ts` |
| Duplicate payments | **Correctly prevented** — same mechanism | — |
| Stale pricing | **Not currently a risk** because no pricing configuration exists to go stale — but becomes a real risk the moment a fee/tax config is added without pricing versioning (§20); a booking created against an old price that hasn't refreshed by charge time is a classic race this pattern must guard against |
| Refund manipulation | **Partially guarded** — the existing refund route requires `payment:manage` permission and only marks "refunded" on provider confirmation, but is stall-only and full-amount-only (§5) | `server/src/routes/organizerPayments.ts:84-115` |
| Organizer access / tenant isolation | **Correctly enforced**, extensively verified across Phases 12/15 | — |
| Admin pricing changes | **N/A today** (no such controls exist yet) — see §22 for the required safety property once they do |
| Historical transaction integrity | **Not at risk today** (nothing to corrupt yet) — becomes the central concern the moment pricing configuration exists; §20/§21 are the mitigation |

**The one true principle underlying all of the above, and the one to hold onto through every future phase**: every monetary amount must ultimately be computed and verified server-side from data the server itself controls (the `TicketType`/`Stall` price, the active `PricingVersion`, the gateway's own signed confirmation) — never accepted from, or even influenced by, anything the browser sends. The current implementation already gets this exactly right for the one thing it charges (the bare base price); the job of future phases is to extend that same discipline to the fee/tax/discount layer as it's built, not to relax it.

## 24. Commercial Gap Analysis

### CRITICAL — must exist before real money is processed
| Issue | Business impact | Technical impact | Recommendation | Priority |
|---|---|---|---|---|
| Frontend-displayed total never matches what's charged | Visitors are shown a price they aren't actually charged — a trust/legal exposure the moment real money is involved | Frontend `BookingFlow.tsx` math is fully disconnected from backend `bookings.ts` math | Resolve the GST/fee decision (§14/§28) and make both sides read from one shared, server-provided calculation | CRITICAL |
| No platform fee/tax/discount breakdown exists on `Payment` | ExhibitTix cannot charge anything beyond the bare organizer price — zero revenue by construction | Schema gap, §7/§12 | Add the breakdown fields once the fee model (§11/§13) is decided | CRITICAL |
| No pricing versioning | Any future fee/tax change would retroactively corrupt historical transaction meaning | No `PricingVersion`-equivalent concept exists | Build before, not after, any admin pricing control | CRITICAL |
| Real Razorpay credentials never exercised end-to-end (carried forward from Phase 15/17) | Cannot verify production payment behavior at all before going live | `RAZORPAY_KEY_ID`/`SECRET`/`WEBHOOK_SECRET` unset | Obtain test credentials, run a full live payment before any real launch | CRITICAL |

### HIGH — must exist before commercial launch
| Issue | Business impact | Technical impact | Recommendation | Priority |
|---|---|---|---|---|
| GST legal treatment undetermined | Cannot legally charge/invoice correctly | `TicketType.taxPercent` unused | Resolve with a qualified tax professional (§14) | HIGH |
| Merchant-of-record / settlement model undecided | Determines legal liability, GST registration responsibility, and engineering scope of everything else | Affects §13, §19, §21 | Business decision required (§28) | HIGH |
| No ticket-side refund endpoint | Organizers/attendees have no way to refund a ticket at all today | Only stalls have `POST .../refund` | Mirror the existing stall refund route for tickets | HIGH |
| No subscription/plan system | The recommended business model (§11) has no billing mechanism to run on | No `Subscription`/`Plan` model exists | Build as the core of Phase 19 | HIGH |
| No organizer invoice for ExhibitTix's own fee | Cannot bill organizers even once a fee exists | No invoicing exists at all | Build alongside the fee system (§19) | HIGH |

### MEDIUM — can be implemented after launch
| Issue | Business impact | Technical impact | Recommendation | Priority |
|---|---|---|---|---|
| No partial refund support | Limits customer-service flexibility | Refund always full-amount | Extend once ticket refunds exist | MEDIUM |
| No bulk/event-cancellation refund flow | Manual, error-prone if an organizer cancels a whole exhibition | No such route exists | Build once single-refund is solid | MEDIUM |
| No discount/coupon system | Common competitor feature (implied, not explicitly researched per-competitor) absent | No model exists | Build once base pricing engine is stable | MEDIUM |
| No exhibitor invoice for stall payments | Organizer currently has no formal document for exhibitor payments | Depends on §13 resolution | Build after merchant-of-record decision | MEDIUM |

### FUTURE — scale/enterprise features
| Issue | Business impact | Technical impact | Recommendation | Priority |
|---|---|---|---|---|
| Exhibitor premium monetization (§16) | Second revenue layer, not needed for initial launch | New billing surface | Build once Model A is proven | FUTURE |
| Multi-currency | Only relevant for international expansion | `Payment.currency` field exists, unused beyond `"INR"` | Defer until actually needed | FUTURE |
| Full financial ledger (§21) | Only justified under `PLATFORM_SETTLEMENT` | Significant new subsystem | Build only if/when that settlement model is chosen | FUTURE |
| Enterprise custom pricing | Only relevant once large-organizer demand exists | Extension of the plan/subscription system | Defer | FUTURE |

## 25. Phase 19 Implementation Plan (proposed — not executed)

**MUST HAVE:**
1. **Database changes**: add fee/tax/discount breakdown fields to `Payment` (§7/§12); add a `PricingVersion`-equivalent model and reference it from `Payment`/`Exhibition` at creation time (§20); add a minimal `Subscription`/`Plan` model for Model A (§11). All additive, non-destructive migrations, matching the project's established migration discipline.
2. **Backend changes**: a single, shared server-side pricing calculation function used by every route that creates a `Payment` (tickets and stalls both) — replacing the two currently-divergent calculations (§3/§4) with one source of truth.
3. **Pricing engine**: implement the calculation shape in §12, initially with the fee model resolved per §28's decisions (may reasonably launch with platform fee = 0 while the subscription system is what actually monetizes, per the Model A recommendation — the engine should support a nonzero fee without requiring one).
4. **Payment integration**: extend `createOrderForPayment`/`applyPaymentOutcome` to carry the new breakdown fields through to the gateway order and the stored `Payment` row; no change to the signature-verification/idempotency logic, which is already correct.
5. **Frontend booking calculations**: replace `BookingFlow.tsx`'s local fee/GST math with a value returned by the backend (the order/booking-creation response should include the authoritative breakdown for display) — never recompute independently on the client again.
6. **Refund architecture**: add the ticket-side refund endpoint mirroring the existing stall one (§18).
7. **Tests**: this project has no automated test framework anywhere (confirmed across Phases 15-17); a pricing engine handling real money is the strongest case yet for introducing one, at minimum for the calculation function itself (pure, easily unit-testable) — recommend this be the first place automated tests are introduced, even if the rest of the app stays manually/live-tested for now.
8. **Migration strategy**: additive-only schema changes; backfill existing `Payment` rows with a "legacy"/version-0 pricing reference so historical data remains queryable under the new model without reinterpretation.
9. **Backward compatibility**: `TicketBooking.amountPaid`/`paymentStatus` legacy mirror fields should continue to work unchanged; existing frontend flows for free tickets (§6) should be preserved exactly as-is, just routed through the new calculation function returning all-zero fees for that case.
10. **Rollback strategy**: since all changes are additive, rollback is a matter of reverting the calculation function to its current pre-Phase-19 behavior and ignoring the new (unused) fields — no destructive step is ever required, consistent with the project's migration discipline throughout its history.

**NICE TO HAVE:**
11. Admin pricing control UI (§22) — the backend versioned-config model can exist and be seeded/edited via direct DB access initially; a full admin UI can follow once the model is validated.
12. Invoice generation (§19) — can start as a simple PDF/HTML receipt for tickets before a full invoicing system exists.
13. Discount/coupon system — genuinely new scope, not urgent for a first launch.
14. Bulk refund flow — can remain a manual, one-booking-at-a-time process initially.

## 26. Final Recommendation

### Recommended ExhibitTix Business Model
**Model A — Organizer-First SaaS** (subscription/per-event fee to the organizer), with an explicit architectural path to Model C (Hybrid) later. See §11.

### Recommended Pricing Architecture
A single server-side calculation function, fed by a versioned pricing configuration (§12/§20), replacing today's two-divergent-calculations bug. Breakdown fields added to `Payment`, not a new separate ledger model yet (§21).

### Recommended Fee Responsibility Model
Configurable per organizer (`feePaidBy: ORGANIZER | ATTENDEE | SPLIT`), not a single global policy — defaulting to whatever the business decides (§28), informed by the market's attendee-facing-by-default norm (§9) but not forced into it, since Model A's primary fee (subscription) is organizer-paid by nature regardless.

### Recommended Tax Architecture Direction
Wire the already-existing `TicketType.taxPercent` field into a real, server-side calculation with an explicit, versioned `taxBasis`/`taxInclusive` configuration — but do not set or assume any actual rate or legal treatment without the professional consultation required in §14.

### Recommended Settlement Direction
`DIRECT` settlement (money flows to the organizer's own gateway account; ExhibitTix's fee is invoiced/collected separately) over `PLATFORM_SETTLEMENT` — lower engineering and compliance burden, and consistent with the bank-account fields already collected but unused on `Organizer`/`ExhibitorBusiness`. This is a recommendation based on implementation complexity and existing groundwork, not a substitute for the business/legal decision in §28.

### Recommended Exhibitor Monetization
Keep free and additive (§16) — do not gate any currently-working feature; treat exhibitor monetization as a Phase-20-or-later layer once Model A is validated with real organizers.

### Recommended Free Event Strategy
Exactly why Model A matters (§17): a free exhibition still consumes real platform infrastructure and should still be monetizable via the organizer's subscription/per-event fee, independent of whether any ticket inside it is priced at zero.

### Recommended Revenue Streams
Primary: organizer subscription/per-event fee (Model A). Secondary, deferred: a modest ticket-side transaction fee if the business later wants one (kept off stalls per §15's finding that no exhibition competitor commissions stall sales). Tertiary, deferred further: optional exhibitor add-ons (§16).

### What NOT to build yet
A full financial ledger (§21) unless/until `PLATFORM_SETTLEMENT` is chosen; a discount/coupon system; exhibitor premium billing; multi-currency; any admin pricing UI beyond what's needed to safely version-configure the fee/tax fields.

### What MUST be built before Razorpay production
The shared server-side pricing calculation (§25 item 2) and pricing versioning (§20) — launching real Razorpay charges on top of today's two-divergent-calculations bug would mean the first real money processed is already visibly wrong to the customer. Real Razorpay test credentials should be obtained and a full live payment exercised (carried forward from Phase 15/17) before any production launch regardless of which pricing model ships first.

## 27. Open Business Decisions

| Decision | Current State | Recommended Direction | Final Decision Needed |
|---|---|---|---|
| Business model | None (₹0 revenue by construction) | Model A (Organizer-First SaaS), path to Hybrid later | **Yes** — business owner |
| Fee payer (`feePaidBy`) | N/A, no fee exists | Configurable per organizer, market default attendee-facing if/when a transaction fee is added | **Yes** — business owner |
| Platform fee percentage/fixed amount | N/A | Do not set arbitrarily; competitor range is 0% (Exiwik/0%-commission niche) to ~4-15% (mainstream commission platforms) — Model A's primary monetization is subscription, not this | **Yes** — business owner, informed by §9/§11 |
| GST treatment | `taxPercent` field exists, unused; seed data implies 18% on paid tickets but this may be a placeholder, not a decision | Wire the field into real calculation once the legal question is answered | **Yes** — qualified tax professional, urgently |
| Merchant of record | N/A (organizer implicitly, by default, since ExhibitTix touches no settlement) | `ORGANIZER`, consistent with `DIRECT` settlement | **Yes** — business owner + legal/tax advice |
| Settlement model | N/A (Razorpay/mock settles directly today, no ExhibitTix involvement) | `DIRECT` | **Yes** — business owner, informed by §13 |
| Subscription plan tiers/pricing | None exist | Free/low tier for small organizers, paid tiers scaling with usage — exact numbers not proposed here | **Yes** — business owner |
| Exhibitor monetization | None (all current features free) | Keep free; defer new paid add-ons | Lower urgency — Phase 20+ |
| Refund policy (fee/tax reversal on refund) | Full refund only, stall-only, no fee-refund policy since no fee exists | Decide once a platform fee exists | Lower urgency — tied to fee decision |
| Discount/coupon support | Does not exist | Build post-launch if demanded | Lower urgency |

---

*This report is a technical and market analysis. It does not constitute legal, tax, or financial advice. Sections 14 and portions of 13/19/27 explicitly require review by a qualified Indian tax/accounting professional before any implementation.*
