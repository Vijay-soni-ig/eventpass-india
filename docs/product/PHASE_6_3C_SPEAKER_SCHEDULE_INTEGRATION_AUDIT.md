# Phase 6.3C — Speaker Schedule Integration Audit

## Scope
Integrate the existing EventSession/EventSessionSpeaker foundation with public EventParticipant speaker profiles.

## Implemented
- Public speaker schedule endpoint scoped to a published/public Event.
- Requires PARTICIPANTS module and a public ACTIVE SPEAKER participant.
- Returns only PUBLISHED sessions assigned to that speaker.
- Sessions are ordered chronologically.
- Public response excludes participant email/phone and other private fields.
- Existing EventSession CRUD and SESSIONS module remain the source of truth.
- Public participant profile displays the schedule only for SPEAKER participants.
- Session cards include date/time, timezone, room, description, and public speaker links.

## Security / tenancy
- Public event visibility/status gate.
- Participant event ownership gate.
- Participant type/status/public/archived gate.
- Session publication gate.
- No authenticated organizer data is exposed by the public endpoint.
- Rate limiting uses the existing public-search limiter.

## Tests
- Published vs draft session visibility.
- Speaker ownership and public-state gates.
- Non-speaker rejection.
- Public response field minimization.
- Existing CI hard gates remain required before merge.

## Non-goals
- New session CRUD system.
- Speaker commercial data.
- Speaker private contact information.
- Session registration/attendance tracking.
