# Phase 6.3J — Participant Analytics Foundation

## Objective
Expose organizer-scoped participant analytics for a universal Event without exposing private participant data outside the organizer authorization boundary.

## Delivered
- GET /api/organizer/event-analytics/:eventId/participants
- Requires authenticated organizer access with event:view
- Requires both ANALYTICS and PARTICIPANTS event modules
- Returns participant totals by status and participant type
- Returns public/private visibility counts
- Calculates profile completeness from core profile fields
- Counts shared participant media, documents, contacts, speaker-session assignments, sponsor-package assignments, vendor-service assignments, and participant audit activity
- Added useParticipantAnalytics(eventId) React Query hook
- Added integration coverage for authorization-scoped analytics, counts, completeness, asset coverage, and invalid IDs

## Security / data rules
- Organizer ownership is enforced through organizerIdsWithPermission
- Analytics do not expose participant email, phone, documents, media URLs, or other participant records
- Archived participants remain represented in lifecycle totals so reporting is not silently rewritten
- Analytics are read-only; no mutation path is introduced

## Known scope boundary
This is the analytics foundation. It intentionally does not yet add dashboard charts, date-series aggregation, exports, cross-event benchmarking, or attendee-to-participant conversion attribution. Those can build on this stable contract in later work.

## Acceptance criteria
- [x] Organizer authorization enforced
- [x] Event/module scoping enforced
- [x] Participant status/type breakdown
- [x] Profile completeness metric
- [x] Shared capability coverage metrics
- [x] Audit activity metric
- [x] Frontend query hook
- [x] Integration tests
