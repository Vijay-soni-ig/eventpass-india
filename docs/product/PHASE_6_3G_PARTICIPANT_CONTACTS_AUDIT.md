# Phase 6.3G — Participant Contacts / Representatives Audit

## Scope
Add a private, organizer-authorized contact/representative directory for every EventParticipant.

## Included
- EventParticipantContact schema and migration.
- Contact types: primary, secondary, operations, sales, other.
- Organizer-authorized list/create/update/archive/restore APIs.
- Exactly one active primary contact when contacts exist.
- Archiving a primary contact automatically promotes the oldest remaining active contact.
- Primary promotion demotes other active contacts.
- Event and participant tenant isolation through organizer permission checks.
- Participant-module gating.
- Input validation for names, email addresses and phone numbers.
- Audit logging for create/update/archive/restore.
- Soft archive instead of destructive deletion.
- Automated lifecycle, validation and cross-organizer isolation tests.

## Security
- No public participant-contact endpoint.
- Contact data is only available through authenticated organizer routes.
- Event access is scoped through organizer permission checks.
- Archived contacts are excluded from normal list results.
- Mutation routes require event:update.
- Phone/email values are validated server-side.

## Business rules
1. A participant can have zero or more contacts.
2. At most one active contact is primary.
3. Creating/updating/restoring a contact with isPrimary=true demotes other active contacts.
4. Archiving the active primary promotes the oldest remaining active contact.
5. Archived participants cannot have contacts mutated.
6. Contacts are soft-archived and can be restored.

## Non-goals
- Public contact exposure.
- Visitor/exhibitor self-service.
- CRM sync.
- WhatsApp/SMS delivery.
- Contact deduplication across different participants.
- External contact sharing.

## Verification
The PR must pass backend test shards, Prisma migration/generation, backend build, frontend lint/build, performance/accessibility checks, Browser E2E, dependency/security audit and repository CI before merge.
