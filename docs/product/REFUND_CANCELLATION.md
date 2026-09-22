# Refund & Cancellation

Eligibility must be explicit per product/event policy.

State: Requested → Approved/Processing → Succeeded / Failed.

Requirements:
- Full/partial refunds where applicable.
- Idempotent refund initiation.
- Never refund above captured amount.
- Prevent duplicate refunds.
- Reconcile provider result.
- Update ticket/booking availability only according to policy.
- Preserve audit trail.

Never hard-delete payment/refund history.