# A9 Cross-Persona Lifecycle Audit

**Audit date:** 2026-11-22  
**Target post-merge commit:** `3513a9b6dbfcac6b81613e5906f458cb37005a8d`  
**Latest main after PR #932:** `a755930de886cdf1eef84f6d8a478c78756996f5` (documentation-only handoff update)

## Verification status

### Target commit `3513a9b`

- [CI run 44988795628](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/44988795628): backend shards 1–4, Quality, and Public Event passed.
- [Browser E2E run 44988795650](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/44988795650): Public Event completed successfully.
- Migration upgrade path was **skipped** on the post-merge push.

### Prior main baseline: `eaf0ce0` (PR #924 merge commit; later advanced by documentation-only PR #932)

- [CI run 45028054618](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45028054618): backend shards 1–4 and Quality passed; migration upgrade path was **skipped**.
- [Browser E2E run 45028055582](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45028055582): Public Event passed.

### Latest main: `a755930` (PR #932 merge commit)

- PR #932 changed `TASK_TRACKER.md` only; it did not change application code or the A9 audit file.
- Exact PR #932 head `c868f48bbbad04a83307c9f00b8c412e4a8fa970` passed CI, Browser E2E, and Dependency Audit; the CI run also passed Migration upgrade path.
- [CI run 45034552053](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45034552053): Quality, backend shards 1–4, and Migration upgrade path passed.
- [Browser E2E run 45034551990](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45034551990): passed.
- [Dependency Audit run 45034552052](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45034552052): passed.
- These are exact-PR-head results. A separate post-merge workflow result for merge commit `a755930` was not verified in this run.

### A9 follow-up PRs — exact-head checks

- [PR #921](https://github.com/Vijay-soni-ig/eventpass-india/pull/921), head `1e4894e6eb7d0ae022b3a36ed5216c2ff24ceb01`: all 8 checks passed, including migration upgrade and dependency audit; merged.
- [PR #923](https://github.com/Vijay-soni-ig/eventpass-india/pull/923), head `9962ad56de6cc0a7904920cc6054dc31f93512ab`: all 8 checks passed, including migration upgrade and dependency audit; merged.
- [PR #924](https://github.com/Vijay-soni-ig/eventpass-india/pull/924), head `d8d28af134451d7970ebad11509e50d953693114`: all 8 checks passed, including migration upgrade and dependency audit; merged at `eaf0ce04829f2c7e0ff06607a1ced0619ae33225`.

A skipped migration job is not a pass. Migration-upgrade evidence exists on the exact PR heads of #921, #923, #924, and #932. The post-merge run for the target commit and the prior main merge commit `eaf0ce0` skipped that job; the latest main merge commit `a755930` has no post-merge workflow result verified in this run.

## Lifecycle coverage

| Lifecycle area | Existing automated evidence | Scope / caveat |
|---|---|---|
| Event creation and publishing | [E2E ticket management](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/e2e/event-ticket-management.spec.ts), [publish validation](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/phase235EventPublishing.test.ts), [cross-persona lifecycle](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/e2e/cross-persona-lifecycle.spec.ts) | Standalone Event creation, ticket setup, publishing, visitor checkout, readiness validation, and ownership boundaries are covered. |
| Exhibitor participation | [Critical path](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/e2e/critical-path.spec.ts), [guided stall booking](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/e2e/exhibitor-guided-stall-booking.spec.ts), [canonical Event participation](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/phase31EventCanonicalExhibitorParticipation.test.ts) | Participation is still Exhibition-backed; standalone Event-level exhibitor participation is not implemented. |
| Stall reservation concurrency | [phase26_8StallConcurrency](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/phase26_8StallConcurrency.test.ts) | Two exhibitors race for one stall; exactly one success and one conflict are asserted, and persisted reservation/participant states are checked. |
| Ticket capacity concurrency | [P0 ticket reservation concurrency](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/p0TicketReservationConcurrency.test.ts), [reservation lifecycle concurrency](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/eventTicketReservationLifecycleConcurrency.test.ts) | Covers capacity ceiling, idempotency races, concurrent payment capture/issuance, expiry compensation, per-attendee limits, cancellation/order races, module disable, unpublish, and archive. |
| QR and check-in | [Exhibition cross-persona E2E](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/e2e/cross-persona-lifecycle.spec.ts), [Universal Event check-in rejection matrix](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/eventTicketCheckInRejectionMatrix.test.ts), [check-in UI](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/e2e/universal-checkin-ui.spec.ts) | Valid check-in, duplicate and concurrent scans, wrong Event, disabled module, unpaid/refunded/cancelled tickets, archived/unpublished Event, and scanner permission are covered. |
| Lead capture | [Lead capture E2E](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/e2e/event-lead-capture.spec.ts), [ticket lead atomicity](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/eventLeadTicketCaptureAtomicity.test.ts), [capture-context tenant isolation](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/eventLeadCaptureContextsTenantIsolation.test.ts) | Checked-in ticket validation, repeat/idempotent capture, invalid tickets, participation/tenant boundaries, attendee-data re-read, and refund race are covered. |
| Universal Event analytics | [Source reconciliation](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/eventAnalyticsReconciliation.test.ts) | Registration, ticket state, check-ins, paid/refunded orders, gross/refund/net revenue, and ticket-type metrics are reconciled with persisted records. |
| Exhibition analytics | [Source reconciliation](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/exhibitionAnalyticsReconciliation.test.ts) | Visitor booking rows/time series, ticket quantities/revenue, check-in day/hour buckets, stall occupancy, confirmed exhibitors, leads, and ticket/stall revenue are reconciled against persisted source records. |
| Exhibitor CRM analytics | [PR #921](https://github.com/Vijay-soni-ig/eventpass-india/pull/921) | Total/new/contacted/converted/lost leads, conversion rate, due follow-ups, and visitors interacted with are reconciled to lead/interaction/follow-up records. |

The cross-persona E2E exercises the Exhibition-backed visitor → organizer check-in → exhibitor lead path and a standalone Universal Event organizer → visitor ticket → QR check-in → analytics path. The separate Exhibition analytics reconciliation test compares the detailed legacy Exhibition analytics response to source rows; the CRM reconciliation test covers exhibitor lead analytics.

## Known product and verification gaps

1. **Standalone Event exhibitor participation:** no independent Event-level exhibitor application/approval/participation model or lead-capture context exists. The current capture route is scoped to confirmed `ExhibitionExhibitor` participation. [PR #923](https://github.com/Vijay-soni-ig/eventpass-india/pull/923) adds a regression guard against unauthorized standalone capture; it does not implement this feature.
2. **Linked Exhibition checkout migration:** public Event pages can read linked Exhibition ticket options, but purchase flow remains Exhibition-backed. The ticket-lead atomicity regression constructs issued-ticket fixtures directly because Universal Event reservation/order APIs do not yet serve the linked Exhibition checkout path.
3. **Migration upgrade on post-merge runs:** skipped on the target commit and prior main merge commit `eaf0ce0`. Exact-head migration tests passed on PR #921, #923, #924, and #932.
4. **Physical camera verification:** no live Codespace or physical-device camera scan was performed.
5. **Production/provider verification:** this audit used repository source, tests, and GitHub Actions evidence. It did not verify a deployed production/staging lifecycle or live payment-provider callbacks.

## Focused regression merged in PR #924

`server/tests/exhibitionAnalyticsReconciliation.test.ts` compares the legacy Exhibition analytics service against persisted source records for:

- Paid booking rows versus visitors-over-time; ticket quantity and ticket-type revenue.
- Check-in records versus daily check-in and peak-entry-hour buckets.
- Stall totals by available/reserved/sold status.
- Confirmed exhibitor count.
- Lead totals and per-status/per-exhibitor breakdowns.
- Ticket-booking and stall-booking revenue.

The fixture deliberately includes two paid booking rows with three ticket units, two check-ins on distinct dates/hours, three stalls across statuses, one confirmed exhibitor, and leads in multiple statuses. It keeps booking counts distinct from ticket quantity.

The PR #924 exact head passed all 8 checks, including backend shards, Quality, Browser E2E, Migration upgrade path, and dependency audit. It was merged at `eaf0ce0`; main later advanced to `a755930` through documentation-only PR #932.

## PR #929 reconciliation

PR #929 was opened from the earlier `eaf0ce0` base and its exact-head CI, Browser E2E, and Dependency Audit passed, but GitHub reported it non-mergeable after main advanced. Its evidence updates are being reconciled on a fresh branch based on `a755930`; PR #929 is now closed as superseded by #934 and will not be merged.

## Release closure

Repository regression coverage is strong for the listed lifecycle areas, but this is a **PARTIAL PASS**, not production GO. Final A9 closure requires the complete lifecycle to be executed on one deployed release candidate, with the exact SHA, environment, persona identities, source record IDs, API/UI results, database reconciliation, and negative-path evidence recorded in [the release verification checklist](../production/A9_CROSS_PERSONA_RELEASE_VERIFICATION.md).

