# Phase 6.2 — Sponsor Specialization Audit

Date: 2026-09-25
Status: Audit completed; bounded implementation started.

## Verified baseline
- Phase 6.1 participant foundation is merged.
- Sponsor records currently use generic EventParticipant rows.
- Organizer sponsor CRUD, archive/restore, module gating, tenant isolation and audit logging already exist.
- Public participant directory can expose public sponsor participants, but has no sponsorship-specific presentation.

## Missing specialization
- Sponsorship tiers/packages.
- Package benefits and deliverables.
- Package commercial value/currency.
- Sponsor-specific package assignment.
- Sponsor-specific branding configuration.
- Public sponsor presentation using the specialized data.
- Dedicated validation and audit coverage for package/profile lifecycle.

## Implementation scope
1. Add event-scoped sponsor packages.
2. Add sponsor profile/detail relation to an EventParticipant sponsor.
3. Add package CRUD with archive lifecycle.
4. Add sponsor profile CRUD/validation with package ownership enforcement.
5. Add public sponsor endpoint that exposes only public-safe sponsor/package/branding fields.
6. Add migration, RBAC/module gates, audit logging and backend regression coverage.

## Deliberately deferred
- Payment/invoicing for sponsorships.
- Contract/document management.
- Sponsor lead attribution.
- Sponsor analytics.
- File-upload/media gallery beyond URL-based branding fields.

Those require separate business workflows and should not be coupled to this bounded foundation.
