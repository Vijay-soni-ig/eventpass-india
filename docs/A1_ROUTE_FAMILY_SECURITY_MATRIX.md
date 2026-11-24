# A1 Route-Family Security Matrix

Updated: 2026-11-24

## Purpose

This document turns the A1 endpoint-inventory baseline into a route-family review matrix. It is intentionally evidence-oriented: a route family is not marked closed merely because a global middleware exists. Each family must have a concrete authorization, validation, abuse-control, and regression-test evidence path before A1 is considered complete.

## Global controls already verified in repository

- API security middleware is mounted centrally in `server/src/app.ts`.
- Production CORS is allowlisted rather than reflecting arbitrary origins.
- `x-powered-by` is disabled.
- API security headers and request IDs are emitted centrally.
- JSON request bodies are size-limited.
- Production nginx security policy is covered by regression tests.
- Repository CI, Browser E2E, and Dependency Audit are required evidence gates for production-facing PRs.

These controls reduce repeated per-route risk, but do not replace route-level authorization and tenant-scope review.

## Route-family inventory

| Family | Route module | Primary security questions | Evidence state |
|---|---|---|---|
| Authentication | `auth.ts`, `authSessions.ts` | credential validation, session/JWT lifetime, brute-force controls, account enumeration | PARTIAL — unknown-account login performs cost-10 and cost-12 dummy bcrypt comparisons to match observed legacy/seed and current signup hash costs; duplicate-email signup response and deployed rate-limit topology remain open |
| Bookings | `bookings.ts` | authenticated ownership, event/stall scope, mutation authorization, rate limits | Review required |
| Business | `business.ts` | organizer/business ownership and RBAC | Review required |
| Documents | `documents.ts` | tenant ownership, download authorization, upload validation and storage safety | Review required |
| Event categories | `eventCategories.ts`, `eventCategoryRead.ts` | public/private boundary, admin mutation authorization | Review required |
| Event lead capture | `eventLeadCaptureContexts.ts`, `eventLeads.ts` | organizer/exhibitor tenant scope, PII exposure, mutation authorization | Regression evidence exists; retain coverage |
| Event participants | `eventParticipants.ts` | organizer scope, participant ownership, role checks | Regression evidence exists; retain coverage |
| Event partners | `eventPartners.ts` | organizer scope and public/private visibility | Review required |
| Event speakers | `eventSpeakers.ts` | organizer scope and public/private visibility | Review required |
| Event sponsors | `eventSponsors.ts` | organizer scope and public/private visibility | Review required |
| Event staff | `eventStaff.ts` | organizer scope, role/permission checks | Review required |
| Ticket check-in | `eventTicketCheckIn.ts` | scanner authorization, ticket ownership, replay/idempotency controls | PARTIAL — PR #976 merged at `1068cc9`; exact-head CI, Browser E2E, Migration Upgrade, and Dependency Audit passed before merge; organizer-membership downgrade concurrency regressions are present; broader scanner route-family review remains open |
| Ticket orders | `eventTicketOrders.ts` | purchaser ownership, event scope, payment state transitions | Review required |
| Ticket reservations | `eventTicketReservations.ts` | ownership, expiry, race conditions, rate limits | Review required |
| Tickets | `eventTickets.ts`, `eventTicketsIssued.ts` | issuance authorization, purchaser scope, duplicate/replay protection | Review required |
| Vendors | `eventVendors.ts` | organizer scope and vendor permissions | Review required |
| Universal Events | `events.ts` | organizer ownership, publish controls, public/private boundary | Regression evidence exists; retain coverage |
| Exhibitions | `exhibitions.ts` | organizer scope, nested-resource authorization, legacy compatibility paths | Regression evidence exists; retain coverage |
| Exhibition content | `exhibitionContent.ts` | organizer ownership and asset access | Review required |
| Exhibitor participation | `exhibitorParticipations.ts`, `exhibitorMembers.ts` | Exhibition-backed exhibitor ownership, organizer/exhibitor boundary | Regression evidence exists; retain coverage |
| Event exhibitor participation | `eventExhibitorParticipations.ts` | standalone Event scope, active business membership, organizer review permission, module gate, application/review/withdrawal idempotency and lock ordering | PARTIAL — PR #980 adds Event-native apply/list/withdraw/review APIs and tenant/role/concurrency regressions; exact-head CI fixes pending; lead capture is intentionally deferred |
| Exhibitor scanner | `exhibitorScanner.ts` | scanner role, event scope, ticket access | Review required |
| Floor plan | `floorPlanLayout.ts` | organizer ownership, publish authorization, concurrent mutation safety | Regression evidence exists; retain coverage |
| Leads | `leads.ts`, `organizerLeads.ts` | tenant scope, PII exposure, export/list authorization | Regression evidence exists; retain coverage |
| Notifications | `notifications.ts` | recipient ownership, information disclosure, mutation abuse controls | PARTIAL — user scoping and mutation rate-limit attachment confirmed in source; route-coverage test passed; dedicated 429 behavior and deployed topology still not separately verified |
| Onboarding | `onboarding.ts` | account ownership and state-transition authorization | Review required |
| Organizer analytics | `organizerAnalytics.ts`, `organizerEventAnalytics.ts` | tenant-scoped aggregates and event ownership | Regression evidence exists; retain coverage |
| Organizer follows | `organizerFollows.ts` | caller ownership and public/private boundary | Review required |
| Organizer gallery | `organizerGallery.ts` | organizer ownership and asset access | Review required |
| Organizer members | `organizerMembers.ts` | membership RBAC, invitation/role mutation authorization | Review required |
| Organizer payments | `organizerPayments.ts` | organizer ownership, payment authorization, sensitive-data exposure | Review required |
| Organizer profile | `organizerProfile.ts` | caller ownership and public/private profile boundary | Review required |
| Organizer registrations | `organizerRegistrations.ts` | event ownership, registration data scope, mutation authorization | Regression evidence exists; retain coverage |
| Organizer subscriptions | `organizerSubscription.ts` | organizer ownership, entitlement enforcement, billing-state transitions | Review required |
| Payments | `payments.ts` | authenticated ownership, amount/state validation, idempotency | Review required |
| Payment webhooks | `paymentWebhooks.ts` | signature verification, replay/idempotency, event isolation | PARTIAL — PR #977 merged at `f6775fd`; PR #978 merged at `faa558b`. Exact-head CI, Browser E2E, Migration Upgrade, and Dependency Audit passed before merge. Main shard 2 passes regressions 209 (persisted-but-unapplied replay) and 210 (initially unmapped provider-order event replay after mapping persistence). Live Razorpay delivery/retry, deployed webhook configuration, and production reconciliation remain NOT VERIFIED |

## Required closure evidence

For every `Review required` family, close A1 only when the repository contains enough evidence to answer all applicable questions below:

1. **Authentication:** Is the caller authenticated where required, and is the session/JWT lifetime policy explicit?
2. **Authorization:** Is the required permission/RBAC check enforced before reading or mutating protected data?
3. **Tenant scope:** Is the resource resolved through the caller's permitted organizer/exhibitor/event scope rather than an untrusted identifier alone?
4. **Validation:** Are IDs, enums, state transitions, pagination, uploads, and monetary values validated at the boundary?
5. **Abuse resistance:** Are authentication, booking, payment, webhook, and expensive mutation paths rate-limited or otherwise bounded where appropriate?
6. **Sensitive data:** Are PII, payment data, documents, and exports limited to the minimum authorized scope?
7. **Concurrency/idempotency:** Are reservation, payment, webhook, ticket, and publish mutations safe against replay/races where applicable?
8. **Regression evidence:** Is there a focused test that would fail if the security property regressed?

## Current A1 status

This matrix is a route-family inventory and review plan. It does **not** claim A1 closure. The highest-value next repository work is to convert the `Review required` families into focused regression tests, starting with authentication/session policy, payments/webhooks, uploads/documents, and remaining organizer/exhibitor mutation surfaces.

## Merge evidence requirement

Any implementation PR generated from this matrix must pass CI, Browser E2E, and Dependency Audit on its exact PR head before merge. A green result from an earlier commit is insufficient after the PR head changes.


## Authentication checkpoint — 2026-11-24

- `server/src/routes/auth.ts` now invokes `compareLoginPassword` for both known and unknown email addresses before returning the generic 401 response.
- `server/src/lib/authCredentials.ts` generates random cost-10 and cost-12 bcrypt dummy hashes per process. Repository inspection found seeded/legacy hashes use cost 10 while current signup uses cost 12. Known accounts compare their stored hash plus a complementary-cost dummy; unknown accounts compare against both dummy hashes. It does not hash per request and never treats a dummy-hash match as authentication success.
- `server/tests/authLoginTiming.test.ts` covers both supported cost profiles, the unknown-account dummy comparison pair, and identical status/body for unknown-email and wrong-password login failures.
- This is deterministic regression evidence for the code path, not a statistical timing benchmark or proof of indistinguishable end-to-end latency.
- Signup still returns an explicit duplicate-email conflict. Do not change that response until a non-enumerating registration/verification contract can be implemented without falsely telling users an email was sent or leaving them unable to recover an existing account.
- Production proxy/IP trust and distributed rate-limit-store behavior remain NOT VERIFIED.


## Payment webhook replay recovery checkpoint — 2026-11-24

- paymentWebhooks.ts verifies the raw request bytes before parsing and rejects captured-payment identity, amount, or currency mismatches before recording the event.
- PaymentEvent has a unique (provider, providerEventId) constraint. The ledger insert and applyPaymentOutcome are separate operations, so a process interruption between them can leave a durable event whose financial state transition was not applied.
- The previous duplicate guard returned HTTP 200 for duplicate non-paid outcomes without retrying applyPaymentOutcome. This could permanently skip a failed/cancelled transition after a crash, or after a webhook arrived before the local provider-order mapping was committed.
- The remediation replays every recognized outcome through the existing payment-row-locked transition. Terminal payment states remain no-ops; duplicate ledger rows are not created.
- paymentWebhookFinancialMismatch.test.ts now simulates the crash window by pre-inserting the webhook ledger row, delivering the same signed failed event, and asserting the payment and stall booking transition to failed while exactly one event row remains.
- This is mock-provider regression evidence only. Live Razorpay delivery, provider retry timing, and deployed webhook configuration remain NOT VERIFIED.

## Payment webhook early-arrival regression follow-up — 2026-11-24

- PR #977 merged at `f6775fd0d01614de4a9bb71e3850f149be831b2e`. Exact-head CI, Browser E2E, Migration Upgrade, and Dependency Audit all succeeded before merge.
- Post-merge main checks were still running at the checkpoint: Backend shards 1–4 and Quality in progress; Browser E2E in progress; Migration Upgrade skipped. Do not count skipped migration as PASS.
- Review identified a distinct untested sequence: a signed non-paid webhook can be received while the local Payment has no providerOrderId mapping. The event is recorded with paymentId null; a later retry after mapping persistence should find the Payment and apply the outcome despite the duplicate ledger row.
- PR #978 adds a database-backed regression that temporarily removes the local providerOrderId, delivers the event (expecting no Payment transition and a ledger row with paymentId null), restores the mapping, then replays the same signed event and verifies Payment + StallBooking become failed with one ledger row.
- PR #978 exact-head CI, Browser E2E, Migration Upgrade, and Dependency Audit are NOT YET VERIFIED. This is test-coverage follow-up; no live Razorpay behavior is claimed.


## Payment webhook early-arrival regression — merged 2026-11-25 00:11 IST

- PR #977 replay recovery is merged at `f6775fd0d01614de4a9bb71e3850f149be831b2e`.
- PR #978 is merged at `faa558b79e085112f6ad01a11a695e18ca4ac7eb`. Its diff was limited to `server/tests/paymentWebhookFinancialMismatch.test.ts` and this evidence matrix; no application behavior or schema changed.
- PR #978 exact-head CI [45451788097](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45451788097): Quality, backend shards 1–4, and Migration Upgrade SUCCESS. Browser E2E [45451788151](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45451788151): 296/296 PASS. Dependency Audit [45451788120](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45451788120): PASS.
- Post-merge main CI [45462427383](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45462427383): Quality and backend shards 1–4 SUCCESS; Migration Upgrade SKIPPED (NOT TESTED). Main Browser E2E [45462427314](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45462427314): 296/296 PASS.
- Main backend shard 2 confirms test 209, `duplicate failed webhook resumes an unapplied payment transition`, and test 210, `unmapped failed webhook is applied when the provider retries after order mapping exists`, both pass.
- This closes the two identified repository regression gaps for those replay sequences. It does not close the webhook route family or certify provider behavior. Live Razorpay delivery/retry timing, deployed webhook configuration, and production reconciliation remain NOT VERIFIED.
