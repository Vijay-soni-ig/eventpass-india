# Production Monitoring

ExhibitTix now emits structured HTTP completion and error events with an `X-Request-Id` correlation identifier. This is application-level observability only. External log storage, dashboards, alerting, and uptime monitoring remain deployment responsibilities.

## Required signals

### Availability
- `/api/health` must remain HTTP 200.
- `/api/health/ready` must remain HTTP 200 with `database: ready`.
- Monitor frontend root availability separately.

### HTTP errors
Consume `http_request_error` events and alert on sustained 5xx rates rather than isolated expected 4xx responses.

Recommended starting thresholds:
- Critical: sustained 5xx rate >= 5% for 5 minutes.
- Warning: sustained 5xx rate >= 1% for 10 minutes.
- Critical: readiness failures for 2 consecutive checks.

### Latency
Consume `http_request_completed.durationMs` and alert on sustained latency degradation. Thresholds should be tuned from real staging/production baselines rather than guessed permanently in application code.

### Payments
Monitor payment webhook failures, reconciliation findings, stale payments, refund failures, and provider/API errors as separate financial-integrity signals.

## Required log fields

For HTTP events:
- event
- requestId
- method
- path
- status
- durationMs

For errors:
- event
- requestId
- method
- path
- status
- errorName
- errorMessage
- stack only outside production

Do not log payment secrets, authorization tokens, raw webhook bodies, passwords, or uploaded document contents.

## External infrastructure still required

Before production launch, configure:
1. Centralized log retention.
2. Uptime/readiness checks.
3. 5xx and latency alerts.
4. Payment/reconciliation alerts.
5. On-call notification destination.
6. Staging and production dashboards.

Repository code must not be treated as proof that these external controls are deployed.