# A1 Route Review Evidence Ledger

Updated: 2026-09-24

## Purpose

This ledger records repository-verifiable evidence gathered during the A1 route-family security review. It is deliberately narrower than the full A1 matrix and does not convert unreviewed route families into PASS.

## Verified controls

### Authentication/session policy

- `docs/JWT_SESSION_SECURITY_POLICY.md` documents the JWT/session lifetime policy.
- The current main branch contains this policy as a dedicated security artifact.
- The route-family matrix therefore treats session lifetime as documented evidence, while brute-force and enumeration behavior remain route-specific review items.

### Payment webhooks

`server/src/routes/paymentWebhooks.ts` currently provides the following repository-visible controls:

1. Provider path allowlisting: requests for a provider other than the configured provider return `404`.
2. Signature verification occurs against the raw request body before webhook parsing or financial mutation.
3. Invalid signatures return `400` and do not enter payment state mutation.
4. Invalid webhook payloads are rejected with `400`.
5. Stable provider event IDs are recorded through `recordWebhookEvent`.
6. Duplicate webhook events return success without reapplying financial state.
7. Refund webhooks reconcile only against an existing local refund identified by `providerRefundId`.
8. Unknown refund references are acknowledged without inventing local financial state.
9. Payment outcomes are applied only after the webhook has passed signature and duplicate-event handling.

These controls support the payment/webhook threat-model requirements for signature authenticity, replay handling and conservative reconciliation. They do not prove live Razorpay verification, because live provider credentials and a real provider callback are still external launch dependencies.

## Remaining A1 review work

The following route families remain `Review required` in `docs/A1_ROUTE_FAMILY_SECURITY_MATRIX.md` until focused route-level regression evidence is available:

- authentication and account abuse controls
- bookings and reservations
- documents/uploads
- event partner/speaker/sponsor/staff mutations
- ticket check-in, orders, reservations and issuance
- vendors and exhibitor scanner
- notifications and onboarding
- organizer follows/gallery/members/profile/payments/subscriptions
- payments and remaining payment mutation paths

## Evidence rule

A source inspection is not equivalent to a passing security regression. A family becomes VERIFIED only after the relevant authorization, tenant scope, validation, abuse-control, sensitive-data, concurrency/idempotency and regression-test properties have concrete repository evidence.

## External dependency boundary

Live Razorpay verification remains BLOCKED until an actual provider account/credential and a credentialed sandbox callback test are available. Repository tests can validate provider abstraction and signature/idempotency logic, but must not be represented as live-provider verification.
