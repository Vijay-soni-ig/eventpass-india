# A9 Cross-Persona Lifecycle Audit

**Audit base:** `main` at `3513a9b6dbfcac6b81613e5906f458cb37005a8d`  
**Audited:** 2026-11-22

## Coverage found

| Lifecycle area | Existing coverage | Evidence / caveat |
|---|---|---|
| Event creation and publishing | UI event creation, ticket management, publishing; server publish-readiness and transition validation | `e2e/event-ticket-management.spec.ts`, `server/tests/phase235EventPublishing.test.ts`, `e2e/cross-persona-lifecycle.spec.ts` |
| Exhibitor participation and stall reservation/payment | Signup, application, approval, stall selection, payment settlement and confirmed state; guided review/add-ons/terms flow | `e2e/critical-path.spec.ts`, `e2e/exhibitor-guided-stall-booking.spec.ts` |
| Stall reservation concurrency | Two exhibitors race for one stall; expects one success and one conflict and checks persisted winner | `server/tests/phase26_8StallConcurrency.test.ts` |
| Ticket reservation concurrency | Idempotency-key races, capacity ceiling, concurrent webhook issuance, expiry/late-payment compensation, attendee cap | `server/tests/p0TicketReservationConcurrency.test.ts` |
| Reservation/order lifecycle races | Cancel vs order creation serialized; module disable, unpublish and archive block stale reservations/orders | `server/tests/eventTicketReservationLifecycleConcurrency.test.ts` |
| QR and check-in | Visitor QR retrieval, organizer lookup/check-in, duplicate rejection; Universal Event QR check-in also validates duplicate rejection | `e2e/cross-persona-lifecycle.spec.ts`, `e2e/critical-path.spec.ts` |
| Lead capture | Checked-in ticket capture, duplicate/idempotent behavior, not-checked-in/wrong-event/unauthorized-participation rejection; attendee-data race and refund race | `e2e/event-lead-capture.spec.ts`, `server/tests/eventLeadTicketCaptureAtomicity.test.ts` |
| Analytics reconciliation | Registration, ticket status, check-in, paid/refunded order counts, gross/refund/net revenue and ticket types compared with database source rows; legacy organizer/exhibitor analytics also checks lifecycle deltas | `server/tests/eventAnalyticsReconciliation.test.ts`, `e2e/cross-persona-lifecycle.spec.ts` |

## Concrete gap addressed by this audit PR

The ticket-lead capture atomicity test verifies the captured lead uses current attendee details and rejects a refunded-ticket race, but it did **not** compare the exhibitor CRM analytics response with the persisted `EventLead`, interaction and follow-up source rows. This PR adds source-backed reconciliation assertions for total/new/contacted/converted/lost leads, conversion rate, due follow-ups and visitors interacted with.

## Remaining limitations / follow-up

1. **Linked Exhibition ticketing cutover:** the atomicity test still creates the already-issued Universal Event ticket records directly in Prisma because public Universal Event checkout intentionally excludes Exhibition-linked Events until the ticketing read cutover. This test is not end-to-end ticket checkout for linked Exhibitions.
2. **Standalone Event → exhibitor lead flow:** the current model still scopes capture contexts to confirmed `ExhibitionExhibitor` participation and an Event linked to that Exhibition. The standalone Event has no participation context and direct ticket-lead capture is denied. `server/tests/eventLeadCaptureContextsTenantIsolation.test.ts` now explicitly guards this boundary; this is not a feature implementation. The standalone Event exhibitor workflow remains a product/API gap requiring a dedicated participation model and scope.
3. **Migration upgrade check:** the Migration upgrade path check on the audited merge commit was `skipped`, not passed. CI green does not imply this check ran.
4. **Physical camera/device verification:** browser E2E permission behavior is automated, but no live Codespace or physical-device camera test was performed

## CI evidence for the audit base

- [CI run](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/44988795628) — completed successfully; migration upgrade path check skipped.
- [Browser E2E run](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/44988795650) — completed successfully.
- [Merged PR #919](https://github.com/Vijay-soni-ig/eventpass-india/pull/919) — adds the exhibitor core-screen spec to the Browser E2E workflow and scanner permission/fallback coverage.
