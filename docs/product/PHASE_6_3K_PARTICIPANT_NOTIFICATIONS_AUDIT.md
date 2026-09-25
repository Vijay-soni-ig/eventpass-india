# Phase 6.3K — Participant Notifications Foundation

## Scope
Adds durable organizer-facing notification events for participant lifecycle and specialization changes.

## Included
- PARTICIPANT_CREATED
- PARTICIPANT_UPDATED
- PARTICIPANT_SESSION_ASSIGNED
- PARTICIPANT_SPONSOR_PACKAGE_ASSIGNED
- PARTICIPANT_VENDOR_SERVICE_ASSIGNED
- Server-side recipient resolution to the event organizer owner
- Versioned IN_APP, EMAIL and PUSH templates
- Idempotent participant create/update notification intents
- Integration coverage for the durable outbox intent

## Security
- Recipient resolution is server-side.
- Suspended organizer users are excluded.
- Notification creation uses the existing durable outbox and idempotency contract.
- No participant private profile data is copied into notification content by default.

## Acceptance criteria
- [x] Notification event registry entries
- [x] Templates and supported channels
- [x] Organizer recipient resolution
- [x] Participant create/update enqueue
- [x] Idempotency
- [x] Integration test
