# A9 Cross-Persona Lifecycle Audit

**Audit date:** 2026-11-22  
**Target post-merge commit:** `3513a9b6dbfcac6b81613e5906f458cb37005a8d`  
**Current main (after PR #923):** `52b918bdfc04514b369356aa961c0fe90d959664`

## Post-merge verification

### Target commit

- [CI run 44988795628](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/44988795628): backend shards 1–4, Quality, and Public Event passed. Migration upgrade path was **skipped**.
- [Browser E2E run 44988795650](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/44988795650): Public Event completed successfully.

### Follow-up commits

- [PR #921](https://github.com/Vijay-soni-ig/eventpass-india/pull/921), exact head `1e4894e6eb7d0ae022b3a36ed5216c2ff24ceb01`: all eight checks passed, including the migration upgrade path.
- [PR #923](https://github.com/Vijay-soni-ig/eventpass-india/pull/923), exact head `9962ad56de6cc0a7904920cc6054dc31f93512ab`: all eight checks passed, including the migration upgrade path.
- [Current main commit checks](https://github.com/Vijay-soni-ig/eventpass-india/commit/52b918bdfc04514b369356aa961c0fe90d959664/checks): backend shards 1–4, Quality, and Public Event passed; migration upgrade path was skipped on the merge push.

A green CI run is not evidence that a skipped migration job executed.

## Lifecycle coverage

| Lifecycle area | Existing automated evidence | Scope / caveat |
|---|---|---|
| Event creation and publishing | [E2E ticket management](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/e2e/event-ticket-management.spec.ts), [publish validation](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/phase235EventPublishing.test.ts), [cross-persona lifecycle](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/e2e/cross-persona-lifecycle.spec.ts) | Standalone Event creation, ticket setup, publishing and visitor checkout are covered. |
| Exhibitor participation | [Critical path](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/e2e/critical-path.spec.ts), [guided stall booking](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/e2e/exhibitor-guided-stall-booking.spec.ts), [canonical Event participation](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/phase31EventCanonicalExhibitorParticipation.test.ts) | Existing exhibitor participation remains Exhibition-backed. |
| Stall reservation concurrency | [phase26_8StallConcurrency](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/phase26_8StallConcurrency.test.ts) | Two exhibitors race for one stall; asserts exactly one success and one conflict, and checks persisted reservation state. |
| Ticket capacity concurrency | [P0 ticket reservation concurrency](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/p0TicketReservationConcurrency.test.ts), [reservation lifecycle concurrency](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/eventTicketReservationLifecycleConcurrency.test.ts) | Covers capacity ceiling, idempotency races, concurrent payment capture/issuance, expiry compensation, per-attendee limits, cancellation/order races, module disable, unpublish and archive. |
| QR and check-in | [Exhibition cross-persona E2E](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/e2e/cross-persona-lifecycle.spec.ts), [Universal Event check-in rejection matrix](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/eventTicketCheckInRejectionMatrix.test.ts), [check-in UI](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/e2e/universal-checkin-ui.spec.ts) | Valid check-in, duplicate and concurrent scans, wrong Event, disabled module, unpaid/refunded/cancelled tickets, archived/unpublished Event and scanner permission are covered. |
| Lead capture | [Lead capture E2E](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/e2e/event-lead-capture.spec.ts), [ticket lead atomicity](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/eventLeadTicketCaptureAtomicity.test.ts), [capture-context tenant isolation](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/eventLeadCaptureContextsTenantIsolation.test.ts) | Checked-in ticket, repeat/idempotent capture, invalid tickets, participation/tenant boundaries, attendee data re-read and refund race. |
| Universal Event analytics | [Source reconciliation](https://github.com/Vijay-soni-ig/eventpass-india/blob/main/server/tests/eventAnalyticsReconciliation.test.ts) | Registration, ticket state, check-ins, paid/refunded orders, gross/refund/net revenue and ticket-type metrics are compared with persisted rows. |
| Exhibitor CRM analytics | [PR #921](https://github.com/Vijay-soni-ig/eventpass-india/pull/921) | Reconciles total/new/contacted/converted/lost leads, conversion rate, due follow-ups and visitors interacted with to source lead/follow-up rows. |

The Exhibition cross-persona browser test verifies lifecycle metrics increase by expected deltas. It does not fully reconcile each Exhibition analytics field to source rows; the focused test added in this PR addresses that test gap.

## Known product and verification gaps

1. **Standalone Event exhibitor participation:** no independent Event-level exhibitor application/approval/participation model or lead-capture context exists. The current capture route is scoped to confirmed `ExhibitionExhibitor` participation. [PR #923](https://github.com/Vijay-soni-ig/eventpass-india/pull/923) adds a regression guard against unauthorized standalone capture; it does not implement the feature.
2. **Linked Exhibition checkout migration:** public Event pages can read linked Exhibition ticket options, but the purchase flow remains Exhibition-backed. The ticket-lead atomicity regression constructs issued ticket records directly because the Universal Event reservation/order flow does not yet serve the linked Exhibition checkout path.
3. **Analytics reconciliation:** this PR adds a source-row reconciliation test for legacy Exhibition analytics (visitor bookings, check-ins, ticket sales, stall occupancy, confirmed exhibitors, leads, and ticket/stall revenue). The test uses database fixtures and the analytics service; it is not payment-provider verification.
4. **Migration upgrade path:** skipped on the target post-merge CI run and current merge push. It passed on the exact heads of PR #921 and #923.
5. **Physical camera verification:** no live Codespace or physical-device camera scan was performed.

## Focused regression added in [PR #924](https://github.com/Vijay-soni-ig/eventpass-india/pull/924)

`server/tests/exhibitionAnalyticsReconciliation.test.ts` compares the legacy Exhibition analytics service against persisted source records for:

- Paid booking rows versus visitors-over-time; paid ticket quantity and ticket-type revenue.
- Check-in rows versus daily check-ins and peak-entry hours.
- Stall totals by available/reserved/sold status.
- Confirmed exhibitor count.
- Lead totals and per-status/per-exhibitor breakdowns.
- Paid ticket-booking and stall-booking revenue.

The fixture deliberately includes two paid booking rows with three ticket units, one check-in, three stalls across statuses, one confirmed exhibitor, and leads in multiple statuses. This keeps booking counts distinct from ticket quantity.

CI for this new regression is **pending** until the PR checks finish. Do not treat it as passed before the exact-head checks are green.

## Runtime limits

The audit used GitHub source, tests, and workflow evidence. It did not verify a live Codespace, deployed production runtime, physical scanner camera, or payment provider.
