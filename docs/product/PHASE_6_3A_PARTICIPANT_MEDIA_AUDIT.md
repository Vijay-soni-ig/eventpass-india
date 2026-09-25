# Phase 6.3A — Shared Participant Media + Profile Foundation

## Scope

6.3A establishes one reusable media layer for every EventParticipant type: speaker, sponsor, vendor, partner, staff and custom participants.

It provides:
- Profile image, logo and gallery media kinds.
- Public/private media visibility.
- MIME/type and magic-byte upload validation through the existing upload security boundary.
- 5MB per-file limit and image-only media (JPEG, PNG, WebP).
- Ordering and metadata (caption, altText).
- Archive/restore instead of destructive media deletion.
- One active profile image and one active logo per participant, enforced transactionally with a participant-row lock.
- Public-safe media projection for published public Events and public active participants.
- Authenticated file access for private media.
- Existing PARTICIPANTS module gating, organizer RBAC/tenant isolation and audit logging.

## API

Organizer/authenticated:
- GET /api/events/:eventId/participants/:participantId/media
- POST /api/events/:eventId/participants/:participantId/media?visibility=PUBLIC|PRIVATE
- PATCH /api/events/:eventId/participants/:participantId/media/reorder
- PATCH /api/events/:eventId/participants/:participantId/media/:mediaId
- DELETE /api/events/:eventId/participants/:participantId/media/:mediaId
- POST /api/events/:eventId/participants/:participantId/media/:mediaId/restore
- GET /api/events/:eventId/participants/:participantId/media/:mediaId/file

Public:
- GET /api/public/events/:id/participants/:participantId/media

PROFILE_IMAGE media must be public because the existing participant photoUrl is a public profile field. Private profile images are rejected rather than creating a stale or misleading public photo URL.

## Storage

Public media uses participant-media-public and is eligible for the existing public storage proxy/static serving path.

Private media uses participant-media-private and is never added to the public storage allow-list. Authenticated reads resolve the stored object only after event/participant ownership and module checks.

No new storage provider or credential is introduced.

## Data model

EventParticipantMedia is event-participant-owned. It references EventParticipant with cascade delete and optionally records the uploading User with SET NULL.

Indexes support:
- participant + kind + lifecycle
- participant + visibility + lifecycle + ordering

No payment, ticketing, stall, floor-plan, lead or analytics ownership is changed.

## Security

The implementation reuses the existing organizer permission derivation and WHERE eventId + permitted organizer pattern. Cross-organizer media IDs therefore cannot be used to read, mutate or archive another tenant's media.

Upload validation checks:
1. authenticated organizer access;
2. PARTICIPANTS module enablement;
3. event/participant ownership;
4. multipart upload limits;
5. declared MIME type;
6. actual file magic bytes;
7. image-only content;
8. visibility/kind business rules.

Public responses deliberately omit internal visibility, uploader identity and storage references for private media.

## Verification

Regression coverage includes:
- upload lifecycle;
- automatic profile-image propagation to EventParticipant.photoUrl;
- gallery ordering;
- private/public visibility;
- authenticated private file retrieval;
- public projection privacy;
- cross-organizer isolation;
- invalid file rejection;
- invalid visibility rejection;
- private profile-image rejection;
- public participant visibility gating.

## Non-goals

- Rich public participant profile pages are 6.3B.
- Speaker agenda/session UX remains 6.3C and the existing 6.2 session foundation.
- Documents are 6.3F.
- Participant contacts are 6.3G.
- Timeline, discovery, analytics and notifications remain later 6.3 increments.

## Acceptance criteria

6.3A is complete only when schema/migration, upload/storage, APIs, RBAC, public projection, archive/restore, audit logs, regression tests and repository CI gates are verified green.