# A1 Route-Family Security Matrix

Updated: 2026-11-27

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
| Bookings | `bookings.ts` | authenticated ownership, event/stall scope, mutation authorization, rate limits | PARTIAL — PR [#1007](https://github.com/Vijay-soni-ig/eventpass-india/pull/1007) merged at `25ae04b98460c4f93c368a01aedabcb367756cfd`; legacy Exhibition QR lookup, check-in, check-in history and forced re-entry now revalidate organizer membership/permission under organizer -> linked Event -> Exhibition locks; conditional ticket check-in and CheckIn insert remain atomic. Merge-ref CI [#45930000357](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45930000357) passed Quality, backend shards 1–4 (1,314 tests), and Migration Upgrade; Browser E2E [#45930000334](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45930000334) passed 303/303; Dependency Audit [#45930000292](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45930000292) passed. Workflow logs checked out the synthetic PR merge ref, not a standalone PR-head checkout; strict standalone-head verification was not separately observed. Other booking creation/payment paths and hosted-staging scanner behavior remain NOT VERIFIED |
| Business | `business.ts` | organizer/business ownership and RBAC | Review required |
| Documents | `documents.ts` | tenant ownership, download authorization, upload validation and storage safety | Review required |
| Event categories | `eventCategories.ts`, `eventCategoryRead.ts` | public/private boundary, admin mutation authorization | Review required |
| Event lead capture | `eventLeadCaptureContexts.ts`, `eventLeads.ts` | organizer/exhibitor tenant scope, exact Event-business pair authorization, checked-in ticket identity, PII exposure, mutation authorization | PARTIAL — PR [#981](https://github.com/Vijay-soni-ig/eventpass-india/pull/981) merged at `822e4f786514a838f7cbaab462763f8cf4cf66cf` (head `8f21a8f991910208d22e22c07f8849cf6bdfd08d`): Event-native participation contexts/QR/capture/CRM, exact Event-business pair-scoped reads/analytics/follow-ups/export, and pair-scoped search regressions; exact-head CI [#45534924038](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45534924038), Browser E2E [#45534924145](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45534924145) (296 passed), Migration Upgrade and Dependency Audit [#45534924078](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45534924078) passed. PR [#986](https://github.com/Vijay-soni-ig/eventpass-india/pull/986) merged at `dca1e2af9a2b5be39c231b47f34caf8dab619f5e` (head `b86019fb5e64f98faefee4696449f6d0a6db6bda`) adds the complete standalone browser lifecycle; exact-head CI [#45566617625](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45566617625), Browser E2E [#45566617660](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45566617660), Migration Upgrade and Dependency Audit [#45566617718](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45566617718) passed. PR [#990](https://github.com/Vijay-soni-ig/eventpass-india/pull/990) merged at `9b0cb8eedb08cf42918460f9fac68e0ae502958d` adds rejection, rejected-withdrawal denial, and concurrent review-transition regressions; exact-head CI [#45605349617](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45605349617), Browser E2E [#45605349580](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45605349580), Migration Upgrade and Dependency Audit [#45605349619](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45605349619) passed. Hosted-staging acceptance remains NOT TESTED; keep issue #930 open |
| Event participants | `eventParticipants.ts` | organizer scope, participant ownership, role checks | Regression evidence exists; retain coverage |
| Event partners | `eventPartners.ts` | organizer scope and public/private visibility | PARTIAL — PR #1000 merged at `ce25ab68f0d7670a47aca7cbcf888f24046c15e3`; exact-head CI, four backend shards, Migration Upgrade, Browser E2E and Dependency Audit passed before merge; organizer membership/permission revalidation is serialized with partner list/create/update/archive/restore; broader A1 review remains open |
| Event speakers | `eventSpeakers.ts` | organizer scope and public/private visibility | PARTIAL — PR #1001 merged at `0569566c2a1007e80aebc25ff054ace363e4418f`; exact PR head `7572fe027dc7a814f5b7b1d0b3132ff51bc8ee33` passed Quality, backend shards 1–4, Migration Upgrade, Browser E2E and Dependency Audit; post-merge Quality/backend shards and Browser E2E passed, while post-merge Migration Upgrade was skipped and Dependency Audit was not observed; broader A1 review remains open |
| Event sponsors | `eventSponsors.ts` | organizer scope and public/private visibility | PARTIAL — PR #1002 at exact head `9daf7ba5102b17e21bf07d2a92ea1f04f411026d` moves list/create/update/archive/restore into `withLockedEventAccess`; deterministic revocation/list and admin-downgrade/update PostgreSQL regressions pass; exact-head Quality, backend shards 1–4, Migration Upgrade, Browser E2E (300 passed) and Dependency Audit all passed; PR remains draft/open/unmerged; deployed security NOT VERIFIED |
| Event staff | `eventStaff.ts` | organizer scope, role/permission checks | PARTIAL — PR [#1006](https://github.com/Vijay-soni-ig/eventpass-india/pull/1006) merged at `123a7dde1e028c5dfa056a5e4226156941ca5f80`; list/create/update/archive/restore revalidate active organizer membership and event:view/event:update permission under the organizer-row lock, with PARTICIPANTS module checks in the transaction. Exact merge-ref CI [#45912910579](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45912910579) passed Quality, backend shards 1–4 (1,309 tests) and Migration Upgrade; Browser E2E [#45912910586](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45912910586) passed 303/303; Dependency Audit [#45912910556](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45912910556) passed. Workflow logs checked out a synthetic PR merge ref rather than a standalone PR-head checkout; strict standalone-head verification was not separately observed. Hosted-staging/production security NOT VERIFIED |
| Ticket check-in | `eventTicketCheckIn.ts` | scanner authorization, ticket ownership, replay/idempotency controls | PARTIAL — PR #976 merged at `1068cc9`; exact-head CI, Browser E2E, Migration Upgrade, and Dependency Audit passed before merge; organizer-membership downgrade concurrency regressions are present; broader scanner route-family review remains open |
| Ticket orders | `eventTicketOrders.ts` | purchaser ownership, event scope, payment state transitions | Review required |
| Ticket reservations | `eventTicketReservations.ts` | ownership, expiry, race conditions, rate limits | Review required |
| Tickets | `eventTickets.ts`, `eventTicketsIssued.ts` | issuance authorization, purchaser scope, duplicate/replay protection | Review required |
| Vendors | `eventVendors.ts` | organizer scope and vendor permissions | Review required |
| Universal Events | `events.ts` | organizer ownership, publish controls, public/private boundary | Regression evidence exists; retain coverage |
| Exhibitions | `exhibitions.ts` | organizer scope, nested-resource authorization, legacy compatibility paths | Regression evidence exists; retain coverage |
| Exhibition content | `exhibitionContent.ts` | organizer ownership and asset access | Review required |
| Exhibitor participation | `exhibitorParticipations.ts`, `exhibitorMembers.ts` | Exhibition-backed exhibitor ownership, organizer/exhibitor boundary | Regression evidence exists; retain coverage |
| Event exhibitor participation | `eventExhibitorParticipations.ts` | standalone Event scope, active business membership, organizer review permission, module gate, application/review/withdrawal idempotency and lock ordering | PARTIAL — PR [#980](https://github.com/Vijay-soni-ig/eventpass-india/pull/980) merged at `1aea3829a71cdf5057c3e7b22d01962857e49f1a` (head `35debcb92a30aaa9fbd033fba9cd309bd2f8d493`) adds Event-native apply/list/withdraw/review APIs, tenant/role/concurrency regressions and organizer-suspension revalidation under lock; exact-head CI [#45493888525](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45493888525), Browser E2E [#45493888385](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45493888385), Migration Upgrade and Dependency Audit [#45493888400](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45493888400) passed. PR [#982](https://github.com/Vijay-soni-ig/eventpass-india/pull/982) merged at `d9d84c3a07e423e5c11b9e2b0f1c56950950d63b` (head `8feb5afe804f4c13d33dc906216fe5ed1917dead`) adds organizer review UI, exhibitor application history/withdrawal, standalone discovery and navigation; exact-head CI [#45547170213](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45547170213), Browser E2E [#45547170229](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45547170229), Migration Upgrade and Dependency Audit [#45547170250](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45547170250) passed. PR #990 adds explicit rejection and concurrent review-transition regression coverage. Hosted-staging acceptance remains NOT TESTED; keep issue #930 open |
| Exhibitor scanner | `exhibitorScanner.ts` | scanner role, event scope, ticket access | PARTIAL — source revalidates exhibitor membership/suspension and scanner/override permissions under sorted exhibitor-business row locks, then locks/rechecks confirmed ExhibitionExhibitor participation rows before lookup/check-in; check-in locks Payment before TicketBooking and retains a conditional paid/unscanned update. `phase21bExhibitorScanner.test.ts` covers confirmed-participation scope, unpaid-ticket denial, duplicate scan, membership revocation during lookup/check-in, participation withdrawal during check-in, and Staff-without-override. Exact PR head `786433000b42a33280c55421d7070d8cdbcf6159`: CI [#45942296130](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45942296130) passed Quality, backend shards 1–4 (1,318 passed, 0 failed, 0 skipped) and Migration Upgrade (101 migrations); Browser E2E [#45942296144](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45942296144) passed 303/303; Dependency Audit [#45942296102](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45942296102) passed its high/critical gate with 5 advisories in each workspace. The workflow logs explicitly checked out the standalone PR head. Hosted-staging/production scanner behavior NOT VERIFIED |
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
| Payment webhooks | `paymentWebhooks.ts` | signature verification, replay/idempotency, event isolation | PARTIAL — PR #977/#978 replay recovery merged; main shard 2 passes regressions 209/210. PR #1015 adds a local Refund.id in provider refund notes and resolves signed `refund.processed` callbacks that arrive before `providerRefundId` persistence, with payment/order/amount validation and duplicate-finalization regressions; exact-head CI/E2E/Migration/Audit pending. Live Razorpay delivery/retry, deployed webhook configuration, and production reconciliation remain NOT VERIFIED |

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


## Event-native lead capture checkpoint — 2026-11-25 05:11 IST

- Standalone Event lead capture no longer derives exhibitor access through `ExhibitionExhibitor`. The native path uses confirmed `EventExhibitorParticipation` and persists its ID on `EventLead`; the legacy Exhibition relation remains nullable and unchanged.
- Capture-context listing, signed QR resolution, ticket capture, CRM list/detail, manual lead create/manage, analytics, follow-ups and export include native participation.
- Ticket resolution and creation require a same-Event USED ticket, non-null check-in timestamp, persisted same-Event EventTicketCheckIn, and PAID order/payment. Capture transactions lock the exhibitor business, organizer, Event, native participation, then payment and ticket in the payment/refund lock order.
- Exhibitor CRM authorization uses exact `(eventId, exhibitorBusinessId)` pairs. This prevents a multi-business user from seeing a lead for Business A in Event B merely because Business A and Event B are independently present in the user's scope.
- Standalone `LEADS` module is enabled through the API/UI. `STALL_BOOKING` remains Exhibition-only.
- Added `eventNativeLeadCapture.test.ts` and `eventLeadParticipationPairIsolation.test.ts`; updated ticket atomicity, module API and Playwright module-boundary tests.
- **Status: PARTIAL / NOT TESTED.** No local test runtime was available; exact-head backend, migration, Quality, Browser E2E and Dependency Audit must pass before merge. Organizer review UI, exhibitor application/history/withdraw UI, and standalone end-to-end browser lifecycle remain open.



### PR #981 CI follow-up — 2026-11-25 05:11 IST

- A public-event build log on a superseded head identified missing `EventExhibitorParticipationStatus` import in `eventLeads.ts`; corrected the actual import in commit `fe903370`.
- An earlier compiler error showed raw `"CONFIRMED"` literals widening to `string`; both route families now use the generated enum member.
- The lead-capture E2E seed's USED ticket previously had only `checkedInAt`; it now upserts a persisted `EventTicketCheckIn` row so the new resolver requirement is represented by a real source record.
- Exact-head CI, Browser E2E and Dependency Audit are queued/running on the latest PR head; no pass is claimed until the current head completes.


## Event lead CRM search-scope review — 2026-11-25

- Source review found that optional search predicates overwrote the exact Event/business participation `OR` in the EventLead follow-up and CSV export Prisma where objects. This could expose a mismatched Event/business lead/follow-up when a user belonged to multiple exhibitor businesses and supplied `search`.
- Fixed by combining pair scope, status/archive filters and search predicates under `AND`; empty pair scope is explicitly deny-by-default.
- Regression added to `server/tests/eventLeadParticipationPairIsolation.test.ts`: mismatched lead/follow-up search returns no unauthorized row, while a positive search for the authorized pair still returns the expected row.
- Commits: [`ae595e7`](https://github.com/Vijay-soni-ig/eventpass-india/commit/ae595e7d76cdee1f7c5fc7d9a0efc48b41c09721) (fix) and [`ebfc4da`](https://github.com/Vijay-soni-ig/eventpass-india/commit/ebfc4da6fcf49fc151424734d4fd217dfd29fcd0) (regression). The fix/test are on PR #981; exact-head CI/E2E/Migration/Audit remain pending.
- This is repository source + regression-test evidence only; no local test runtime or deployed environment was used. Event lead-capture family remains PARTIAL until exact-head CI and broader lifecycle acceptance complete.


## QR participation-context attribution — 2026-11-25 07:11 IST

- Review finding on PR #981 head `a5368e80f7e6980507f8db6002f75cde2f7cd792`: QR resolution used `findFirst` over any confirmed participation in the selected Event for all of the caller's authorized businesses. The UI sent only Event ID + QR payload and did not bind the result to the selected context; two businesses in one Event could be attributed incorrectly.
- Fix on PR #981: require exact business ID and exactly one legacy Exhibition or Event-native participation ID; verify current business permission; query and lock the exact participation row; revalidate exact Event/business/participation/status before returning ticket data.
- UI now sends selected context identifiers and labels each option with the business name. Regression creates two confirmed businesses in the same Event, gives one user access to both, asserts two distinct contexts, denies a mismatched business/participation pair, and resolves only the selected pair.
- **Status: PARTIAL / NOT TESTED on this new head.** Prior exact-head checks on `a5368e80f7e6980507f8db6002f75cde2f7cd792` passed (Backend shards 1–4, Quality, Migration Upgrade, Browser E2E 296/296, Dependency Audit), but this correction invalidates those results. Re-run all gates on the new exact head. Legacy Exhibition QR resolution is updated to require its exact selected ExhibitionExhibitor context and remains subject to regression verification.


## Event speaker authorization race checkpoint — 2026-11-26

- Source review of `server/src/routes/eventSpeakers.ts` found that the route performed organizer permission resolution and Event/module checks before separate speaker reads and writes. Unlike the merged Event Partners route, speaker operations did not revalidate membership after acquiring the shared organizer-row lock. This left a stale-authorization window for listing and mutations if membership was revoked or an administrator was downgraded while a request was in flight.
- The branch `security/a1-event-speakers-organizer-lock-20261126` now routes speaker list/create/update/archive/restore through `withLockedEventAccess`; the SPEAKERS module check and all participant reads/writes run inside the same transaction. Audit events remain emitted after successful commit.
- `server/tests/eventSpeakerMutationEventIsolation.test.ts` adds deterministic PostgreSQL lock-contention regressions for membership revocation during speaker listing and admin-to-marketing downgrade during speaker update. Denied requests must return 404 and leave the speaker unchanged.
- Verified exact PR head: `7572fe027dc7a814f5b7b1d0b3132ff51bc8ee33`; PR #1001 merged at `0569566c2a1007e80aebc25ff054ace363e4418f`. Exact-head Quality, backend shards 1–4, Migration Upgrade, Browser E2E and Dependency Audit passed. The merge-SHA push run passed Quality/backend shards 1–4 and Browser E2E; Migration Upgrade was skipped and no Dependency Audit run was observed on the merge SHA. The two regressions cover list after membership revocation and update after admin-to-marketing downgrade; create/archive/restore-specific race regressions are not claimed. The finding remains PARTIAL because remaining A1 route families require review.
- Scope is limited to the Event SPEAKERS route family. Event SPONSORS, STAFF and other families marked Review required remain open. No deployed or production behavior is claimed.


## Event sponsor authorization race checkpoint — 2026-11-26

- Source review of `server/src/routes/eventSponsors.ts` found that organizer permission and SPONSORS module state were checked before separate participant reads/writes, without revalidation under the shared organizer lock. A concurrent membership revocation or role downgrade could leave an in-flight request using stale authorization.
- PR #1002 moves sponsor listing, creation, update, archive and restore through `withLockedEventAccess`. Active/unsuspended organizer membership and permission are revalidated under the organizer-row lock; the SPONSORS module check and participant reads/writes execute in the same transaction. Audit events remain after successful commit.
- `server/tests/eventSponsorMutationEventIsolation.test.ts` adds deterministic PostgreSQL lock-contention regressions: revocation during listing returns 404 without changing the sponsor; admin-to-Marketing downgrade during update returns 404 and leaves sponsor fields/status/archive state unchanged.
- Exact PR head: `9daf7ba5102b17e21bf07d2a92ea1f04f411026d`. CI [#45794801745](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45794801745): Quality, backend shards 1–4 and Migration Upgrade SUCCESS. Backend shard 1 log confirms the two new regressions pass; shard summaries are 342/342, 403/403, 295/295 and 264/264 with zero failures/skips. Browser E2E [#45794801433](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45794801433): 300 passed. Dependency Audit [#45794801652](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45794801652): policy gate SUCCESS with 5 advisories per package scope and 0 allowed exceptions (not zero advisories).
- PR #1002 remains draft/open/unmerged. Sponsor package/profile subroutes and Event STAFF remain separate A1 review scope. No deployed or production security behavior is claimed.

## Organizer payment authorization serialization — 2026-11-27

- Source review found that `server/src/routes/organizerPayments.ts` resolved `payment:view` / `payment:manage` through `organizerIdsWithPermission` before reading or mutating financial records, without revalidating the caller after acquiring the organizer-row lock used by membership revocation, role changes, and organizer suspension. This was a concrete stale-authorization race candidate across payment list/detail/refund history, manual status changes, refund reservation, and mock refund finalization.
- The implementation now serializes organizer payment reads and manual status transitions through the organizer row lock and re-reads active, unsuspended membership plus the required permission inside the protected transaction. Payment ownership is re-read under that lock; Platform Admin's existing global access is preserved.
- `applyPaymentOutcome` accepts an optional transaction so manual payment state changes, gateway reference persistence, and stall/participation transitions remain within the authorization transaction.
- `requestRefund` and refund finalizers accept an authorization callback that runs before the payment-row lock. Refund reservation/finalization remains transactional, while provider network I/O stays outside the organizer/payment lock transaction. Idempotent refund replay is still checked under the payment lock after authorization.
- `server/tests/organizerPaymentsAuthorizationRace.test.ts` adds PostgreSQL lock-contention regressions for payment list after finance-to-marketing downgrade; payment detail and refund-history after membership revocation; manual status mutation after admin-to-marketing downgrade; and refund reservation after membership revocation. Denied operations assert no financial state, refund, or audit mutation.
- **Verification:** implementation and focused regressions are committed to a review branch; exact-head CI, Browser E2E, Migration Upgrade, and Dependency Audit are pending. Do not mark this route family VERIFIED until those checks pass and the final diff is reviewed. Hosted/deployed authorization behavior remains NOT TESTED.
