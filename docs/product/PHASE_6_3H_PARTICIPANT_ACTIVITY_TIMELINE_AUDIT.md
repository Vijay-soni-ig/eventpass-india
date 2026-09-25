# Phase 6.3H — Participant Activity Timeline Audit

## Scope
Provide an organizer-authorized activity timeline for EventParticipant records using the existing immutable audit log as the activity source.

## Included
- Participant activity timeline API.
- Chronological newest-first ordering.
- Pagination with 1–100 page size.
- Optional action filtering.
- Actor attribution with safe user identity fields.
- Participant-scoped activity matching both direct participant audit records and related participant actions whose audit metadata contains participantId.
- Existing event/organizer RBAC and PARTICIPANTS module gating.
- Cross-organizer isolation tests.
- Pagination and action-filter tests.

## Activity sources
The timeline intentionally reuses AuditLog instead of introducing a duplicate activity table. Existing participant operations already write audit records for participant creation/update/archive/restore, media, documents, contacts and specialization workflows. This keeps one authoritative operational audit trail while exposing a participant-focused read model.

## Security
- No public activity endpoint.
- Authentication and organizer access are mandatory.
- Event access is resolved through the user's event:view permission.
- Participant must belong to the authorized event.
- Actor response is limited to id, fullName and email.
- No audit payload is mutated by the timeline API.

## API
GET /api/events/:eventId/participants/:participantId/activity?page=1&limit=50&action=<action>

Response includes items, total, page, pageSize and hasNextPage.

## Non-goals
- Public activity exposure.
- Editing/deleting audit entries.
- CRM activity synchronization.
- Notifications triggered by activity.
- Analytics aggregation.

## Verification
The PR must pass backend test shards, Prisma generation/migrations, backend build, frontend lint/build, performance/accessibility checks, Browser E2E, dependency/security audit and repository CI before merge.
