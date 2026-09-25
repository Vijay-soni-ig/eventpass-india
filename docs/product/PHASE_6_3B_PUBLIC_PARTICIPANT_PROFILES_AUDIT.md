# Phase 6.3B — Public Participant Profiles Audit

## Scope
Expose a safe, public profile page for public EventParticipant records without creating separate profile systems for Speaker, Sponsor, Vendor, Partner, or Custom participants.

## Included
- Public API: GET /api/public/events/:eventId/participants/:participantId/profile
- Published + public Event gate.
- PARTICIPANTS module gate.
- Active, non-archived, public participant gate.
- STAFF participants are never exposed.
- Public-safe fields only: type, custom type, name, title, organization, bio, website, photoUrl.
- Email and phone are intentionally excluded from the public contract.
- Public active participant media is included.
- Frontend route: /event/:eventId/participants/:participantId
- Event participant cards link to the profile page.
- Loading, not-found/error, responsive layout, event context and gallery states.
- Regression test coverage for visibility and sensitive-field redaction.

## Security
- No authentication is required for public profile reads.
- Private/draft/archived Events resolve to 404.
- Private/archived/inactive participants resolve to 404.
- STAFF participants resolve to 404.
- Internal media visibility and upload metadata are not exposed.
- Public profile uses the same server-authoritative visibility rules as the public participant directory.

## Non-goals
- Speaker sessions/schedule (6.3C)
- Sponsor packages/commercial data (6.3D)
- Vendor operations/services (6.3E)
- Documents, contacts, activity timeline, discovery, analytics, notifications
- Public participant search

## Acceptance Criteria
- A published public participant can be opened from the Event detail page.
- Profile contains safe identity/content fields and public media.
- Private participants cannot be enumerated through the profile route.
- STAFF never appears publicly.
- Email/phone are not returned.
- CI, backend tests, frontend build/lint, browser E2E and dependency audit must pass before merge.
