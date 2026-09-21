# ExhibitTix — Monitoring & Alerting Contract

## Purpose

P1-3 establishes a minimum production monitoring contract without coupling ExhibitTix to a specific observability vendor.

## Built-in signals

The API already exposes:

- `GET /api/health` for liveness.
- `GET /api/health/ready` for database readiness.
- `X-Request-Id` on every request.
- Structured `http_request_completed` logs with request ID, method, path, status, and duration.
- Structured `http_request_error` logs with request ID, method, path, status, error name, and message.
- Graceful shutdown logging.
- Background-job failure logging for ticket reservation expiry and notification dispatch.

Do not expose internal stack traces in production responses.

## Automated availability check

GitHub Actions runs `Production Monitoring` every 15 minutes and can also be run manually. It checks both liveness and readiness through `scripts/verify-production.mjs`.

Configure the repository variable:

`PRODUCTION_API_URL=https://api.your-production-domain`

The check must never contain production credentials.

A failed run is a monitoring incident signal and should be connected to GitHub notifications or an external incident-management integration.

## External production monitoring

Before launch, configure at least one external uptime/observability provider in addition to GitHub Actions. The provider should monitor:

1. `GET /api/health` — expected HTTP 200 and `ok=true`.
2. `GET /api/health/ready` — expected HTTP 200 and database `ready`.
3. Public frontend availability.
4. TLS certificate expiry.
5. DNS/HTTP availability.

Recommended alert thresholds:

- API unavailable: alert after 2 consecutive failed checks.
- Readiness/database unavailable: alert immediately or after 2 failed checks.
- 5xx rate: alert when sustained above the agreed production baseline.
- Latency: alert on sustained p95 degradation against the agreed baseline.
- Disk/CPU/memory: alert before resource exhaustion, using infrastructure-specific thresholds.
- Database/storage failures: alert immediately for repeated failures.

## Logs

Production logs should be centralized outside the application container because containers are replaceable.

Retain enough logs to investigate:

- authentication failures;
- authorization failures;
- payment/webhook failures;
- uploads/storage failures;
- check-in failures;
- 5xx errors;
- background job failures;
- deployment/startup failures.

Never log passwords, JWTs, payment secrets, webhook secrets, or raw sensitive customer data.

## Incident response

For a production alert:

1. Identify the affected component.
2. Check the latest deployment.
3. Check API health/readiness.
4. Check database, object storage, and payment provider status.
5. Use the request ID to correlate application logs.
6. Mitigate first; investigate second.
7. Record the incident and recovery time.
8. Perform a post-incident review for P0/P1 incidents.

## Definition of done

Repository readiness is complete when the monitoring workflow and verification script are merged.

Production monitoring is fully operational only when:

- `PRODUCTION_API_URL` is configured;
- GitHub notifications are enabled for failed monitoring runs;
- an external uptime/observability provider is configured;
- alerts are tested by deliberately causing a safe synthetic failure;
- on-call ownership and escalation are documented.

The repository change does not claim that external monitoring is already configured.
