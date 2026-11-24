# A1 Route-Family Security Matrix

Updated: 2026-09-24

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
| Authentication | `auth.ts` | credential validation, session/JWT lifetime, brute-force controls, account enumeration | Review required |
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
| Ticket check-in | `eventTicketCheckIn.ts` | scanner authorization, ticket ownership, replay/idempotency controls | Review required |
| Ticket orders | `eventTicketOrders.ts` | purchaser ownership, event scope, payment state transitions | Review required |
| Ticket reservations | `eventTicketReservations.ts` | ownership, expiry, race conditions, rate limits | Review required |
| Tickets | `eventTickets.ts`, `eventTicketsIssued.ts` | issuance authorization, purchaser scope, duplicate/replay protection | Review required |
| Vendors | `eventVendors.ts` | organizer scope and vendor permissions | Review required |
| Universal Events | `events.ts` | organizer ownership, publish controls, public/private boundary | Regression evidence exists; retain coverage |
| Exhibitions | `exhibitions.ts` | organizer scope, nested-resource authorization, legacy compatibility paths | Regression evidence exists; retain coverage |
| Exhibition content | `exhibitionContent.ts` | organizer ownership and asset access | Review required |
| Exhibitor participation | `exhibitorParticipations.ts`, `exhibitorMembers.ts` | exhibitor ownership, organizer/exhibitor boundary | Regression evidence exists; retain coverage |
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
| Payment webhooks | `paymentWebhooks.ts` | signature verification, replay/idempotency, event isolation | Review required |

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


## Participant document/media authorization remediation — 2026-11-24 11:11 IST

- Participant document routes are now serialized with organizer membership revocation/role changes by [PR #968](https://github.com/Vijay-soni-ig/eventpass-india/pull/968), merged at `dbfe62653d01fabb4d2ff9ff152072af6283495f`. Exact PR-head CI, all backend shards, Migration Upgrade, Browser E2E, and Dependency Audit passed.
- Participant media routes remain under active remediation in [PR #970](https://github.com/Vijay-soni-ig/eventpass-india/pull/970), head `b9ae09994f29d2ce8537be1ad9d317cced8d1ad6`. Exact-head CI, Browser E2E, and Dependency Audit were running at this checkpoint.
- The media PR applies the same lock/revalidation boundary to organizer-protected media list, upload preflight/final persistence, reorder, update, archive, restore, and private-file metadata lookup. It also moves the profile-image `photoUrl` projection into the media transaction and adds revocation/upload-cleanup/profile-projection regressions.
- Issue #963 remains OPEN until PR #970 passes and merges and the combined route family is re-audited. Public participant profile/media read routers are separate and unchanged.
- A1 remains PARTIAL: this is one route-family remediation, not a full security sign-off. Broader IDOR/BOLA, route-family, abuse-control, storage, deployment, and penetration evidence remains required.


## Verified checkpoint — 2026-11-24 11:45 IST

### Participant-media security remediation — exact-head checks complete
- Current default branch is `dbfe62653d01fabb4d2ff9ff152072af6283495f`, the merge commit for PR #968.
- PR [#968](https://github.com/Vijay-soni-ig/eventpass-india/pull/968) is MERGED. Exact-head CI [45331284838] (Quality, backend shards 1–4, Migration Upgrade), Browser E2E [45331285120], and Dependency Audit [45331285059] all completed SUCCESS. This verifies the document-route implementation on the PR head; it does not verify production deployment.
- PR [#970](https://github.com/Vijay-soni-ig/eventpass-india/pull/970) remains OPEN/UNMERGED at exact head `b9ae09994f29d2ce8537be1ad9d317cced8d1ad6`. Exact-head CI [45335609374] (Quality, backend shards 1–4, Migration Upgrade), Browser E2E [45335609433], and Dependency Audit [45335609522] all completed SUCCESS.
- Source diff review confirms the organizer-protected media list, upload preflight/final persistence, reorder, update, archive, restore, and private-file metadata lookup use `withLockedEventAccess`. The helper locks the owning organizer row, re-reads the Event and active membership/suspension/permission, and applies the permission check in the transaction. Upload authorization is rechecked after storage write; denied/failed persistence cleans up the stored object. Profile-image `photoUrl` projection changes are in the media transaction. Storage I/O occurs after the authorization transaction releases its lock.
- PR #970 changes `server/src/routes/eventParticipantMedia.ts` and `server/tests/participantMediaMutationEventIsolation.test.ts`. Regression coverage includes revoked private download, revoked archive, post-preflight upload cleanup, and profile-image archive/restore projection consistency.
- PR #970 has no submitted review in the current GitHub review inventory. It is mergeable but remains unmerged; do not mark #963 closed until the PR is reviewed/merged and the combined document/media family is re-audited. Public participant profile/media read routers are unchanged.
- Local test execution remains NOT TESTED in this environment. CI results are exact-head repository evidence, not deployed behavior.

### Documentation PR status
- PR [#971](https://github.com/Vijay-soni-ig/eventpass-india/pull/971) is the current documentation-only readiness PR, based on main `dbfe62653d01fabb4d2ff9ff152072af6283495f`.
- Its prior head `30ef52ea61296bf3cfe835d9749609896b012c67` passed CI [45335780999] (including Migration Upgrade), Browser E2E [45335781003], and Dependency Audit [45335781089]. This checkpoint changes the PR head; fresh exact-head checks are required after these documentation commits.

### Current six-workstream classification
| Workstream | Status | Implemented vs verified | Remaining |
|---|---|---|---:|
| 1. Exhibitor Sales/Payments | BLOCKED | PR #922 diagnostics and PR #962 refund replay recovery are merged and repository-tested. P0 #925 still has no deployed Owner reproduction, actual API status/message/request ID/timestamp, correlated production logs, deployed Owner/Admin/Staff matrix, or real payment/refund reconciliation. | 6–14h |
| 2. Security/tenant isolation | PARTIAL PASS | Document authorization serialization #968 is merged and exact-head CI/E2E/Migration/Dependency checks passed. Media serialization #970 is implemented and all exact-head checks passed, but is not merged. Full A1 audit #926, IDOR/BOLA, remaining upload/storage, abuse-control, sensitive-data, audit completeness, and deployed/penetration evidence remain incomplete. | 4–8h |
| 3. Cross-persona lifecycle | PARTIAL PASS | Repository tests and Browser E2E cover substantial event/exhibition, concurrency, QR/check-in, lead and analytics paths. Standalone Event exhibitor participation #930 and linked Exhibition checkout cutover #931 remain open; full deployed lifecycle/provider callback/scanner acceptance is not verified. | 4–7h |
| 4. Staging/production operations | BLOCKED | PR-head migration-upgrade checks pass on #968 and #970, but target production migration is not tested. Staging/production deployment/config/secrets/storage, monitoring/alert delivery, backup restore, rollback and branch protection remain NOT VERIFIED. | 4–10h |
| 5. Responsive/accessibility/performance | PARTIAL PASS | Automated frontend build, accessibility contract and performance-budget checks passed in PR #968/#970 Quality jobs. Real devices, keyboard/screen-reader, cross-browser and deployed Lighthouse/Core Web Vitals remain NOT TESTED. | 3–6h |
| 6. Final regression/release | BLOCKED | Exact-head CI/E2E checks pass for the security PRs, but deployed release-candidate acceptance, operations/recovery, full lifecycle and final sign-off remain incomplete. | 3–5h |

**Total remaining planning estimate:** 24–50 engineering/QA hours, approximately 4–9 focused working days at 6–7 productive hours/day. These are planning ranges, not newly measured task effort; external access/waiting time is excluded.

### Highest-priority next action
Unblock P0 [#925](https://github.com/Vijay-soni-ig/eventpass-india/issues/925): obtain a deployed Exhibitor Owner reproduction and correlated backend-log access; capture endpoint, actual HTTP status, server message, request ID, timestamp, and role/tenant context before any further financial code change. PR #970 is check-green and ready for human review, but remains unmerged without authorization.

**Release decision: NO-GO.** Green PR-head checks do not establish production readiness.

**Evidence boundary:** GitHub source, PR metadata/reviews, issues, and Actions only. No live runtime, deployment, production backend logs, manual browser, local test runner, payment provider, scanner, target production migration, backup restore, or rollback was accessed/performed. No production data changed.
