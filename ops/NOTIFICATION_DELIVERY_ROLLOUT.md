# Notification delivery rollout — EXH-05B-05

## Scope

Run the existing notification outbox dispatcher as a dedicated process instead of inside the HTTP API process. This avoids tying delivery progress to API scaling/restarts and prevents every API replica from starting its own polling loop.

The worker remains opt-in. No production or staging delivery is enabled by this change.

## Runtime contract

Required worker environment:
- \`NOTIFICATION_DISPATCHER_ENABLED=true\`
- \`DATABASE_URL\`
- \`RESEND_API_KEY\`
- \`EMAIL_FROM\`
- Optional \`NOTIFICATION_DISPATCHER_INTERVAL_MS\` (default 15000 ms, bounded to 1000–60000 ms)

The worker exits at startup if the opt-in flag or required configuration is missing. It logs structured start, heartbeat, tick-failure, and shutdown events. It uses the existing database claim leases, idempotent delivery keys, retries, and dead-letter behavior.

The API process no longer runs the notification dispatcher. Run exactly one worker service initially. The database claim implementation supports competing workers, but horizontal worker scaling should wait for measured queue volume and delivery-provider rate limits.

## Staging activation

1. Provision an isolated staging database and staging object storage; do not point this stack at production data.
2. Configure a verified sender identity in Resend for a staging-safe domain/address.
3. Add secrets to the staging host's protected environment (never commit them):
   - \`RESEND_API_KEY\`
   - \`EMAIL_FROM\`
   - \`DATABASE_URL\`
4. Set \`NOTIFICATION_DISPATCHER_ENABLED=true\` only for the worker service.
5. Start the opt-in worker profile:
   \`\`\`sh
   docker compose --env-file .env.staging -f docker-compose.staging.yml --profile notifications up -d --build notification-worker
   \`\`\`
6. Confirm worker startup and heartbeat logs. Create a test support ticket, customer reply, staff public reply, status change, assignment, and internal note.
7. Verify in-app delivery and email delivery for eligible events. Confirm internal notes remain staff-only and are never emailed.
8. Simulate provider failure in automated tests; verify retry/backoff and terminal failure audit. Confirm duplicate worker claims do not create duplicate notifications.
9. Run the staging smoke workflow and record the exact commit, workflow run, test recipient, provider message IDs, and database delivery states.
10. Keep production worker profile disabled until staging evidence is reviewed and rollback is agreed.

## Rollback

Stop only the worker service; API traffic remains available and queued intents remain durable:
\`\`\`sh
docker compose --env-file .env.staging -f docker-compose.staging.yml --profile notifications stop notification-worker
\`\`\`
Do not delete pending intents or deliveries during rollback.

## Operational checks

Monitor:
- age/count of PENDING and RETRY_WAIT intents;
- age/count of PENDING and RETRY_WAIT deliveries;
- PROCESSING rows with expired five-minute leases;
- FAILED deliveries and DEAD_LETTER intents;
- worker heartbeat freshness and repeated tick failures;
- Resend provider errors, rate limits, and bounce/suppression events.

Example read-only SQL (run against the intended environment):
\`\`\`sql
SELECT status, COUNT(*) AS count, MIN(created_at) AS oldest_created_at
FROM notification_intents
GROUP BY status
ORDER BY status;

SELECT channel, status, COUNT(*) AS count, MIN(created_at) AS oldest_created_at
FROM notification_deliveries
GROUP BY channel, status
ORDER BY channel, status;
\`\`\`

## Not included / external gates

- Resend API key and sender-domain verification cannot be inferred from repository contents.
- GitHub CI success does not prove DNS, staging hosting, database connectivity, or provider delivery.
- WhatsApp and Web Push provider credentials/consent are separate integrations; this rollout requires Resend only for EMAIL and the database for IN_APP.
- Never enable the production profile based only on a successful build.
