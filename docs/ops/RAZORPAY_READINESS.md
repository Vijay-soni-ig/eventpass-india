# ExhibitTix — Razorpay Production / Sandbox Readiness

## Objective

P1-4 verifies that ExhibitTix can use Razorpay safely without allowing a missing or partial credential set to silently fall back to mock payments.

The repository already contains a provider-agnostic payment contract, Razorpay adapter, checkout-signature verification, raw-body webhook verification, webhook idempotency, refund handling, and a non-production mock provider.

## Provider selection

Set:

`PAYMENT_PROVIDER=razorpay`

Razorpay requires all three secrets:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

In production:

- `PAYMENT_PROVIDER=mock` is rejected.
- An unset `PAYMENT_PROVIDER` is rejected.
- Partial Razorpay credentials are rejected.
- Credentials must exist only in the deployment secret store; never commit them.

## Sandbox verification

When Razorpay test credentials are available:

1. Configure the three Razorpay test values in staging only.
2. Configure the Razorpay test webhook endpoint:
   `POST /api/webhooks/payments/razorpay`
3. Create a low-value/test order through the existing payment flow.
4. Complete the payment with Razorpay test mode.
5. Verify the checkout callback signature.
6. Verify the webhook signature against the exact raw request body.
7. Verify the local Payment reaches `paid` only from a verified provider outcome.
8. Replay the same webhook and verify it is treated as a duplicate.
9. Exercise a failed payment and verify the local order/booking is not confirmed.
10. Exercise a test refund and verify the Refund ledger is finalized only for the matching provider refund ID.
11. Run payment reconciliation and confirm no unexplained finding remains.

No production customer data or production credentials should be used in sandbox verification.

## Production verification

Before accepting real payments:

1. Configure production Razorpay credentials in the production secret store.
2. Configure the production webhook URL and secret.
3. Run the repository payment-provider contract check.
4. Perform one controlled real transaction with an agreed internal test procedure.
5. Verify the provider order ID, payment ID, webhook event ID, and local payment state.
6. Verify refund and reconciliation behavior.
7. Confirm monitoring alerts cover payment/webhook failures.
8. Record the verification evidence and date.

Do not mark P1-4 fully operational until a real Razorpay environment has been exercised successfully.

## Current state when credentials are unavailable

Repository readiness can be completed without Razorpay credentials. The automated test suite uses deterministic fake credentials and never calls Razorpay.

The remaining external blocker is **credentialed sandbox/production verification**, not implementation.

Until that external verification is complete:

- development may use the mock provider;
- staging may use mock or Razorpay test mode;
- production must not use mock payments;
- real-money launch remains blocked.

## Security requirements

- Store secrets outside Git.
- Restrict webhook endpoint to signature-authenticated processing; do not authenticate it with a user JWT.
- Verify signatures before parsing or mutating financial state.
- Preserve the exact raw webhook bytes.
- Keep provider event IDs idempotent.
- Never trust frontend payment success by itself.
- Never log Razorpay secrets, webhook secrets, authorization headers, or sensitive payment payload data.
- Keep payment state transitions centralized in `applyPaymentOutcome`.

## Evidence required for P1-4 closure

- [ ] Repository contract tests green.
- [ ] Razorpay test credentials configured in staging.
- [ ] Test order successfully created.
- [ ] Successful payment verified.
- [ ] Failed payment verified.
- [ ] Duplicate webhook verified.
- [ ] Refund verified.
- [ ] Reconciliation clean.
- [ ] Production credentials stored securely.
- [ ] Controlled production transaction verified before public launch.

## Definition of done

P1-4 repository readiness is complete after this documentation and the provider contract checks are merged.

P1-4 operational readiness is complete only after credentialed Razorpay sandbox and production verification evidence exists.
