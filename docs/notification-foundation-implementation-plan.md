# ExhibitTix Notification Foundation

## Scope

This document defines the implementation contract for the Notification Foundation. It is intentionally provider-neutral so repository work can proceed before production credentials are available.

## Delivery architecture

1. Business transactions create domain events or notification intents.
2. A durable database outbox stores each intent with an idempotency key.
3. A dispatcher resolves recipients, preferences, templates, and requested channels.
4. Channel delivery records are created with independent lifecycle state.
5. Workers claim pending deliveries using leases, process them through provider adapters, and record success/failure.
6. Retryable failures use bounded exponential backoff. Permanent failures move to a dead-letter state and remain auditable.
7. In-app delivery is persisted in the existing notification model; email and push use the same intent/delivery pipeline.

## Required states

### Outbox/job

`PENDING`, `PROCESSING`, `COMPLETED`, `RETRY_WAIT`, `DEAD_LETTER`, `CANCELLED`

### Channel delivery

`PENDING`, `PROCESSING`, `SENT`, `DELIVERED`, `FAILED`, `RETRY_WAIT`, `SUPPRESSED`, `CANCELLED`

## Idempotency

- Every domain event must provide a stable event key.
- Every notification intent must have a unique idempotency key.
- Every recipient/channel delivery must have a unique `(intent, recipient, channel)` constraint.
- Worker claims must be lease-based and safe for retries.
- Provider calls must receive a stable provider idempotency key where supported.

## Channels and preferences

- `IN_APP`, `EMAIL`, `PUSH`
- Preferences must support event type and channel.
- Mandatory transactional notifications must not be disabled by marketing preferences.
- Missing preference rows use documented defaults.
- Unsubscribe and suppression decisions must be evaluated before delivery.

## Provider adapters

Use interfaces rather than coupling business logic to a vendor:

- `EmailProvider.send(message): ProviderResult`
- `PushProvider.send(message): ProviderResult`

Adapters must classify errors as retryable or permanent, redact secrets from logs, and support a mock adapter for tests.

## Security and ownership

- Never accept arbitrary recipient ownership from the client.
- Resolve recipients server-side from authenticated identity and authorized event/entity relationships.
- Protect admin broadcast and delivery-management actions with explicit platform permissions.
- Validate template variables and action URLs.
- Rate-limit user-triggered sends and administrative broadcasts.
- Audit preference changes, broadcasts, retries, cancellations, and administrative actions.

## Observability

Record structured metrics and logs for:

- intents created
- deliveries queued
- sent/delivered/failed counts by channel and provider
- retry counts
- dead-letter counts
- queue age and processing latency
- provider latency and error class
- suppression counts

Never log message secrets, authentication tokens, provider credentials, or unnecessary personal data.

## Required implementation sequence

1. Prisma enums/models and migration.
2. Repository/service layer for outbox and delivery records.
3. Worker claim/retry/lease logic.
4. Channel and provider interfaces with mock adapters.
5. Template registry and renderer.
6. Preference resolution.
7. Unified event dispatcher.
8. Existing in-app integration.
9. Email and push integrations.
10. APIs, admin monitoring, frontend states, analytics, and end-to-end tests.

## Verification gate

A feature is not production-ready until schema migration, unit tests, API tests, worker tests, authorization tests, retry/idempotency tests, and cross-persona end-to-end tests have passed in a real application/database environment.
