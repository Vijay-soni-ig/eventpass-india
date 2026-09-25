# Phase 6.2 Partner Specialization Audit

Date: 2026-09-25
Status: bounded implementation increment.

## Existing capability

Partners already had generic EventParticipant CRUD with:
- PARTNERS module gating.
- Organizer event:view/event:update RBAC.
- Search, filter, sort, pagination.
- Archive/restore.
- Audit logging.
- Generic public participant fields.

## Missing specialization

The generic partner record did not model:
- Event-specific partnership category.
- Relationship/contribution context.
- Engagement model.
- Dedicated public display metadata.
- Per-partner public contact/website visibility controls.

## Bounded implementation

This increment adds:
- EventPartnerProfile, one-to-one with a PARTNER participant.
- Organizer profile read/upsert with tenant isolation and archive protection.
- Specialized public partner directory.
- Public field suppression based on explicit profile visibility flags.
- PARTNERS module gating and published/public event checks.
- Audit logging and regression coverage.

## Deferred

- Partner contracts/documents.
- Commercial sponsorship/payment flows.
- Partner lead attribution and CRM.
- Media galleries beyond existing participant photo.
- Partner analytics.
