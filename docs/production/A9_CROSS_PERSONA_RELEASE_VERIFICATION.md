# A9 Cross-Persona Release Candidate Verification

## Purpose

A9 verifies the integrated ExhibitTix lifecycle on one release candidate. Repository test coverage is evidence of individual controls; this checklist prevents declaring the complete lifecycle green without checking the same records across personas.

## Release candidate

Record the exact deployed commit SHA and test run URLs before execution.

## Lifecycle matrix

| Stage | Persona | Required verification | Cross-check |
|---|---|---|---|
| Event setup | Organizer | Create/publish Event and required modules | Event DB status/module enablement |
| Exhibitor | Exhibitor | Confirm participation and stall selection | ExhibitionExhibitor + Stall |
| Stall payment | Exhibitor/Organizer | Initiate and settle payment through verified provider path | Payment + StallBooking + Stall |
| Visitor registration | Visitor | Register for the Event where enabled | Registration belongs to same Event |
| Ticket purchase | Visitor | Reserve/order/pay within capacity | EventTicketOrder + Payment + EventTicket |
| QR | Visitor | Receive valid ticket/QR | Ticket is ACTIVE and tied to Event |
| Check-in | Scanner/Organizer | Scan valid ticket once | Ticket becomes USED + CheckIn exists |
| Lead capture | Exhibitor | Resolve checked-in visitor and capture lead | EventLead points to same Event/exhibitor/ticket identity |
| Analytics | Organizer/Exhibitor | Verify lifecycle metrics | UI/API totals agree with DB source records |
| Refund | Organizer | Refund eligible payment | Payment/refund/ticket state remain consistent |

## Mandatory negative paths

- Organizer A cannot access Organizer B event, participant, payment, lead or analytics records.
- Exhibitor A cannot capture a lead for Exhibitor B.
- A ticket for Event B cannot be resolved for Event A.
- An ACTIVE/non-checked-in ticket cannot be converted into a ticket-based lead.
- A refunded ticket cannot be checked in.
- A second check-in of the same ticket is rejected and logged.
- A second lead capture of the same event/ticket/exhibitor is idempotent and does not create a duplicate.
- Ticket capacity cannot be exceeded by concurrent purchases.
- Stall inventory cannot be double-booked by concurrent exhibitors.

## Evidence rules

A9 is **PASS** only when all required steps are executed against the same release candidate and the following are recorded:

1. exact commit SHA;
2. CI result;
3. Browser E2E result;
4. dependency audit result;
5. staging URL/environment;
6. test identities/personas;
7. Event ID and Exhibition ID;
8. StallBooking/payment/order IDs;
9. Ticket and CheckIn IDs;
10. EventLead ID;
11. analytics screenshots/API responses;
12. database verification results;
13. negative-path results;
14. defects and remediation links.

Repository-only checks must not be substituted for deployed lifecycle evidence.

## Completion classification

- **PASS:** complete lifecycle and negative paths verified on the exact release candidate.
- **PARTIAL PASS:** repository coverage is green but one or more deployed lifecycle stages remain unverified.
- **BLOCKED:** required staging, credentials or infrastructure are unavailable.
- **FAIL:** an expected invariant or business rule is violated.

## Current state

Repository implementation already contains coverage for major RBAC, tenant isolation, payment/refund, stall concurrency, ticket/check-in, lead capture and public-event workflows. Final A9 closure remains dependent on executing the complete lifecycle against a deployed release candidate and cross-checking UI, API and database state.
