# Business Rules & Critical Workflows

## Event
Draft → Published → Active/Operational → Completed/Archived. Only authorized organizer/admin users may change lifecycle state.

## Stall booking
Available → Reserved → Payment Pending → Confirmed. Payment failure or reservation expiry returns the stall to Available. Cancellation/refund returns availability only when business rules permit.

Rules: no duplicate active confirmed booking; reservation expiry is server-controlled; concurrent requests are transactionally protected; booking state is server-authoritative.

## Ticketing
Ticket types define capacity, price, availability and purchase limits. Inventory is reserved atomically. Payment state is server-authoritative. Cancelled/refunded tickets cannot be checked in.

## Payments
Order created → payment initiated → pending → verified success OR failed. Provider verification/webhooks are authoritative. Financial operations are idempotent and auditable.

## Check-in
Validate event, ticket, payment, cancellation/refund state and previous check-in. Duplicate check-ins are rejected and logged.

## Leads
Visitor interaction belongs to an event/exhibitor context. Duplicate handling follows a defined business key while preserving interaction history.

## Refunds
Eligibility follows event/platform policy. Full/partial refunds are supported where implemented and must reconcile to provider records.