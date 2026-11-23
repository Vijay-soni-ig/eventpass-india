# A9 Cross-Persona Lifecycle Audit

**Audit date:** 2026-11-23  
**Target post-merge commit:** `3513a9b6dbfcac6b81613e5906f458cb37005a8d`  
**Current main:** `b4f275c4c34b676c8db194ee233f5702511169b9` (PR #948 production-readiness evidence refresh merged; separate post-merge checks not verified here)

## Verification status

### Target commit `3513a9b`
- [CI run 44988795628](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/44988795628): Quality and backend shards 1–4 passed.
- Migration upgrade path was **skipped** on this post-merge run; it is not a pass.
- [Browser E2E run 44988795650](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/44988795650): `public-event` passed.
- The SHA-based workflow-runs lookup returned no entries; the above run/job evidence was fetched directly by run ID.

### Current main and recent exact-head evidence
- PR #935 merged at `5f154604a83a5bcde48fe1ed028737858524dc34`. Its exact head `f68a77dbfa5d7144f2d37efdfb9811fb29c4df4a` passed CI, Browser E2E, Dependency Audit, and Migration upgrade path:
  - [CI run 45043242883](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45043242883)
  - [Browser E2E run 45043242889](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45043242889)
  - [Dependency Audit run 45043242915](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45043242915)
- PR #936 merged at `8b559c3ad7ce77d8dda797a0725b0f158f915068`. Exact head `0df58019408339ae4edca3a32976d5a566404bec` passed CI (including Migration upgrade), Browser E2E, and Dependency Audit:
  - [CI run 45048724893](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45048724893)
  - [Browser E2E run 45048724894](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45048724894)
  - [Dependency Audit run 45048724891](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45048724891)
- Separate post-merge workflow results for merge commits #935 and #936 were not verified in this audit.


### Latest A9-relevant main changes — 2026-11-23
- PR #943 restricts Universal Event Analytics financial fields to members with `payment:view`; non-finance event viewers receive null monetary fields, and the source skips revenue/refund aggregates when unauthorized. Exact head `ef18ed072cf9c511265ea1f90cb18ce071ad3e65`: CI [45064044866](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45064044866), Browser E2E [45064044881](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45064044881), Dependency Audit [45064044883](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45064044883) passed.
- PR #945 adds finance-vs-marketing analytics permission regression. Exact head `0860f14166e62cfbe747a7816c89da82d66b801e`: CI [45067953355](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45067953355), Browser E2E [45067953419](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45067953419), Dependency Audit [45067953324](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45067953324) passed.
- PR #948 merged current main at `b4f275c4c34b676c8db194ee233f5702511169b9`. Exact PR head `a780b5afd266af17c7029df4bea726133cd20463` CI [45105462580](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45105462580), Browser E2E [45105462607](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45105462607), Dependency Audit [45105462598](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45105462598) passed. This is PR-head evidence; a separate post-merge run for the merge SHA was not verified.

### A9 follow-up PRs
- [PR #921](https://github.com/Vijay-soni-ig/eventpass-india/pull/921): exhibitor CRM analytics reconciliation; merged with all exact-head checks green.
- [PR #923](https://github.com/Vijay-soni-ig/eventpass-india/pull/923): standalone Event lead-capture boundary guard; merged with all exact-head checks green. It protects the current authorization boundary; it does **not** add standalone Event exhibitor participation.
- [PR #924](https://github.com/Vijay-soni-ig/eventpass-india/pull/924): legacy Exhibition analytics source reconciliation; merged with all exact-head checks green.
- [PR #950](https://github.com/Vijay-soni-ig/eventpass-india/pull/950): finance-member cross-organizer analytics isolation regression; open, exact-head checks pending. It asserts a finance member of Organizer A cannot access Organizer B's Event analytics.

## Lifecycle coverage

| Lifecycle area | Automated evidence | Scope / caveat |
|---|---|---|
| Event creation/publishing | [Universal Event ticket-management E2E](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/e2e/event-ticket-management.spec.ts), [publishing tests](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/phase235EventPublishing.test.ts) | Organizer UI creates a draft, manages ticket types, publishes, and a visitor buys. Server validation and ownership boundaries are tested. |
| Exhibition creation → exhibitor/visitor lifecycle | [Fresh critical-path E2E](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/e2e/critical-path.spec.ts) | PR #935 is **merged**. A new organizer creates/publishes an Exhibition; the test asserts its canonical Event link and public ticket endpoint, then exercises exhibitor approval, stall/payment, visitor ticket/payment, QR, check-in, lead capture, and analytics. Payments are mocked. |
| Exhibitor participation | [Critical path](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/e2e/critical-path.spec.ts), [guided stall booking](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/e2e/exhibitor-guided-stall-booking.spec.ts), [canonical Event participation](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/phase31EventCanonicalExhibitorParticipation.test.ts) | Existing participation is Exhibition-backed; independent standalone Event participation is not implemented. |
| Stall reservation concurrency | [Stall concurrency regression](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/phase26_8StallConcurrency.test.ts) | Two exhibitors compete for one stall; asserts one success/one conflict and persisted stall/participation states. |
| Ticket capacity concurrency | [P0 reservation concurrency](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/p0TicketReservationConcurrency.test.ts), [reservation lifecycle concurrency](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/eventTicketReservationLifecycleConcurrency.test.ts) | Capacity ceilings, idempotency, concurrent captures/issuance, expiry compensation, per-attendee limits, cancellation/order race, module disable, unpublish and archive. |
| QR and check-in | [Exhibition cross-persona E2E](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/e2e/cross-persona-lifecycle.spec.ts), [Universal check-in rejection matrix](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/eventTicketCheckInRejectionMatrix.test.ts), [check-in UI](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/e2e/universal-checkin-ui.spec.ts) | QR ownership/lookup, valid check-in, duplicate/concurrent scan, wrong Event, disabled module, unpaid/refunded/cancelled ticket, unpublished/archived Event and scanner authorization. Physical camera is not verified. |
| Lead capture | [Lead capture E2E](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/e2e/event-lead-capture.spec.ts), [atomicity](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/eventLeadTicketCaptureAtomicity.test.ts), [tenant isolation](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/eventLeadCaptureContextsTenantIsolation.test.ts) | Checked-in visitor, idempotency/duplicate, invalid tickets, tenant/participation boundaries, attendee-data reread and refund race. |
| Universal Event analytics | [Source reconciliation](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/eventAnalyticsReconciliation.test.ts), [finance permission regression](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/universalEventAnalyticsFinancialPermission.test.ts) | Registration, ticket state, check-ins, paid/refunded orders, gross/refund/net revenue and ticket-type metrics reconciled to DB records. PR #943 gates monetary fields/queries by `payment:view`; PR #945 verifies finance vs. marketing visibility. Cross-organizer denial is added in PR #950 (pending checks). |
| Exhibition analytics | [Source reconciliation](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/exhibitionAnalyticsReconciliation.test.ts) | Paid booking rows/time series, ticket quantity/revenue, check-in day/hour buckets, stall occupancy, confirmed exhibitors, leads and ticket/stall revenue reconciled to DB records. |
| Exhibitor CRM analytics | [PR #921](https://github.com/Vijay-soni-ig/eventpass-india/pull/921) | Lead totals/statuses, conversion, due follow-ups and visitors interacted reconciled to lead/interaction/follow-up records. |

## Focused regression merged in PR #935

PR #935 replaced the seeded Exhibition dependency in `e2e/critical-path.spec.ts` with a fresh organizer and live/public Exhibition. It asserts the linked canonical Event, creates stall and ticket inventory through organizer APIs, checks the linked Event's public ticket endpoint, then continues exhibitor approval, stall reservation/payment, visitor ticket/payment, QR/check-in, lead capture, and organizer/exhibitor analytics assertions.

Exact PR head `f68a77dbfa5d7144f2d37efdfb9811fb29c4df4a` passed CI, Browser E2E, Dependency Audit and Migration upgrade before merge. The test uses the mock payment provider; live payment-provider callbacks and deployed runtime behavior are not established by this evidence.

## Known product and verification gaps

1. **Standalone Universal Event exhibitor participation:** no independent Event-level application/approval/participation model or lead-capture context. The current capture scope requires Exhibition-backed confirmed participation. See [issue #930](https://github.com/Vijay-soni-ig/eventpass-india/issues/930).
2. **Linked Exhibition ticket checkout cutover:** public linked Event ticket options are exposed, but checkout is still Exhibition-backed; Universal Event reservation/order does not yet own the linked Exhibition purchase path. See [issue #931](https://github.com/Vijay-soni-ig/eventpass-india/issues/931).
3. **Post-merge migration verification:** skipped on the target commit. Migration upgrade passed on exact PR heads #921, #923, #924, #935 and #936; skipped runs remain explicitly not-pass.
4. **Physical scanner and deployment:** no live Codespace/physical-camera test or deployed staging/production lifecycle was performed.
5. **Payment provider and release infrastructure:** mock-payment CI does not verify live provider callbacks, monitoring/alerting, backup restoration, rollback or production configuration.

6. **Universal Event analytics tenant-scope regression:** PR #950 adds an explicit cross-organizer finance-member denial test; exact-head CI is pending. The route source scopes Event access through `event:view` organizer membership before financial visibility. The existing PR #945 permission test covers finance vs. marketing within one organizer, not cross-organizer denial.

## Superseded documentation PRs

PR #929 was closed as superseded; #934 and #933 were also superseded/closed. PR #936 is the merged readiness/task-tracker reconciliation. Do not reopen or merge stale branches.

## Release closure

Repository-level A9 coverage is **PARTIAL PASS**, not production GO. Final closure requires a unified lifecycle run on a deployed release candidate with exact SHA/environment, persona identities, source record IDs, API/UI results, database analytics reconciliation, and negative-path evidence recorded in [the release verification checklist](../production/A9_CROSS_PERSONA_RELEASE_VERIFICATION.md).
