# Notification delivery rollout — EXH-05B-05

## Scope

Run the existing notification outbox dispatcher as a dedicated process instead of inside the HTTP API process. This avoids tying delivery progress to API scaling/restarts and prevents every API replica from starting its own polling loop.

The worker remains opt-in. No production or staging delivery is enabled by this change.

## Runtime contract

Required worker environment:
- `NOTIFICATION_DISPATCHER_ENABLED=true`
- `DATABASE_URL`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `NOTIFICATION_EMAIL_ALLOWED_RECIPIENTS` (required in staging; comma-separated QA inboxes only)
- Optional `NOTIFICATION_DISPATCHER_INTERVAL_MS` (default 15000 ms, bounded to 1000–60000 ms)

The worker exits at startup if the opt-in flag or required configuration is missing. It logs structured start, heartbeat, tick-failure, and shutdown events. It uses the existing database claim leases, idempotent delivery keys, retries, and dead-letter behavior.

The API process no longer runs the notification dispatcher. Run exactly one worker service initially. The database claim implementation supports competing workers, but horizontal worker scaling should wait for measured queue volume and delivery-provider rate limits.

## Staging activation

1. Provision an isolated staging database and staging object storage; do not point this stack at production data.
2. Configure a verified sender identity in Resend for a staging-safe domain/address.
3. Inspect the global notification outbox before starting: this worker drains all registered event types, not only support events. Use an isolated staging database with no unrelated pending intents, or verify that every queued event's channels have provider configuration.
4. Add secrets to the staging host's protected environment (never commit them):
   - `RESEND_API_KEY`
   - `EMAIL_FROM`
   - `DATABASE_URL`
5. Set `NOTIFICATION_DISPATCHER_ENABLED=true` only for the worker service and set `NOTIFICATION_EMAIL_ALLOWED_RECIPIENTS` to controlled QA inboxes.
6. Start the opt-in worker profile:
   ```sh
   docker compose --env-file .env.staging -f docker-compose.staging.yml --profile notifications up -d --build notification-worker
   ```
7. Confirm worker startup and heartbeat logs. Create a test support ticket, customer reply, staff public reply, status change, assignment, and internal note.
8. Verify in-app delivery and email delivery for eligible events. Confirm internal notes remain staff-only and are never emailed.
9. Simulate provider failure in automated tests; verify retry/backoff and terminal failure audit. Confirm duplicate worker claims do not create duplicate notifications.
10. Run the staging smoke workflow and record the exact commit, workflow run, test recipient, provider message IDs, and database delivery states.
11. Keep production worker profile disabled until staging evidence is reviewed and rollback is agreed.

## Rollback

Stop only the worker service; API traffic remains available and queued intents remain durable:
```sh
docker compose --env-file .env.staging -f docker-compose.staging.yml --profile notifications stop notification-worker
```
Do not delete pending intents or deliveries during rollback.

## Operational checks

Monitor:
- age/count of PENDING and RETRY_WAIT intents;
- age/count of PENDING and RETRY_WAIT deliveries;
- PROCESSING rows with expired five-minute leases;
- FAILED deliveries and DEAD_LETTER intents;
- worker heartbeat freshness and repeated tick failures;
- Resend provider errors, rate limits, and bounce/suppression events;
- staging email deliveries suppressed by the explicit recipient allowlist.

Example read-only SQL (run against the intended environment):
```sql
SELECT status, COUNT(*) AS count, MIN(created_at) AS oldest_created_at
FROM notification_intents
GROUP BY status
ORDER BY status;

SELECT channel, status, COUNT(*) AS count, MIN(created_at) AS oldest_created_at
FROM notification_deliveries
GROUP BY channel, status
ORDER BY channel, status;
```

## Not included / external gates

- Resend API key and sender-domain verification cannot be inferred from repository contents.
- GitHub CI success does not prove DNS, staging hosting, database connectivity, or provider delivery.
- The dispatcher drains a shared queue across event types. Existing event resolvers may fan out to PUSH and WHATSAPP; configure those providers before processing such queued events, or keep the staging outbox limited to events/channels under test. This slice validates support IN_APP and EMAIL delivery.
- Never enable the production profile based only on a successful build.
