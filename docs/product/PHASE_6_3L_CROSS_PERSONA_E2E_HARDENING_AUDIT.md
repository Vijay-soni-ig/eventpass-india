# Phase 6.3L — Cross-Persona E2E Hardening

## Scope
- Organizer tenant isolation for EventParticipant APIs
- Participant lifecycle create/update consistency
- STAFF public-visibility enforcement
- Shared participant contacts, media, and documents persistence
- Participant notification intents and idempotency state
- API response state cross-checked against Prisma persistence

## Acceptance Criteria
- A second organizer cannot read another organizer's participants.
- STAFF participants cannot be created as public.
- Participant create and update produce the expected notification intents.
- Shared participant capabilities remain attached to the same participant/event.
- Notification intents are unique and remain PENDING until the existing dispatcher processes them.
- No cross-tenant participant data is exposed.

## Regression Focus
This test intentionally uses unique fixture emails/event titles and validates both API and database state to prevent false-positive E2E results caused by stale or duplicate fixtures.
