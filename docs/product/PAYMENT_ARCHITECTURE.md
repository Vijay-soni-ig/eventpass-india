# Payment Architecture

State: Order created → Payment initiated → Pending → Verified Success / Failed.
Refund: Requested → Processing → Succeeded / Failed.

Rules:
- Frontend success is never sufficient.
- Verify provider response server-side.
- Verify webhook signatures.
- Process webhooks idempotently.
- Persist provider transaction/reference IDs.
- Reconcile payment state.
- Prevent duplicate capture/processing.
- Preserve immutable financial history.

Report separately: gross revenue, discounts, taxes, payment fees, refunds, net revenue and platform earnings.

Live Razorpay readiness requires real provider credentials/configuration. Mock/test flows can validate application logic but cannot prove live provider integration.