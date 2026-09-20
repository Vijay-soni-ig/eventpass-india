# Payment Reconciliation Operations

ExhibitTix includes a local payment-state reconciliation service that checks financial state-machine consistency across payments, event ticket orders, legacy ticket bookings, stall bookings, and refunds.

## Run

From `server/`:

```bash
npm run reconcile:payments
```

Defaults:

- last 7 days
- maximum 5,000 payments

Optional environment variables:

- `PAYMENT_RECONCILIATION_DAYS` — positive number of days to inspect.
- `PAYMENT_RECONCILIATION_LIMIT` — positive maximum number of payments to scan.

## Exit behavior

The command exits with code `0` when no reconciliation findings exist. It exits with code `1` when any finding is detected or the reconciliation command itself fails. This makes it suitable for a scheduled operational job or release-health check.

Warnings and critical findings are printed as structured JSON so an external log/alerting system can ingest them without exposing credentials or payment secrets.

## Scope and safety

The command is read-only. It does not mark payments paid, issue refunds, or alter booking state. Provider-side recovery and refund reconciliation remain separate explicit operations in `paymentReconciliation.ts` and should only be scheduled after the production Razorpay environment and operational controls are verified.
