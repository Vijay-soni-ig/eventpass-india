# Phase 6.3I — Participant Search & Discovery Audit

## Scope
Make public EventParticipant directories searchable, filterable and paginated while preserving participant privacy.

## Included
- Public participant search by name, title, organization and bio.
- Participant-type filtering.
- Featured/name/organization/newest sorting.
- Pagination with bounded page size.
- Result totals and next-page metadata.
- React query hook support for discovery parameters.
- Existing public-event, PARTICIPANTS/module and participant visibility gates remain enforced.
- STAFF participants remain excluded from public discovery.
- Automated search, filter, sorting, pagination and privacy tests.

## API
GET /api/public/events/:eventId/participants

Parameters:
- q
- type
- sort = featured | name | organization | newest
- page
- limit (1–100)

## Security / privacy
- Only PUBLISHED, public, non-archived events are discoverable.
- Only ACTIVE, public, non-archived participants are returned.
- STAFF is never exposed publicly.
- The response contains public profile fields only.
- Existing public search rate limiting remains applied.

## Existing organizer discovery
The authenticated organizer participant endpoint already supports search, type/status filtering, sorting and pagination. This phase completes the public discovery contract without duplicating private participant data.

## Non-goals
- Global cross-event participant search.
- Private contact/document/activity exposure.
- Relevance ranking or AI recommendations.
- Full-text search infrastructure.

## Verification
The PR must pass backend test shards, backend/frontend builds, lint, performance/accessibility, Browser E2E, dependency/security audit, Prisma verification and overall CI before merge.
