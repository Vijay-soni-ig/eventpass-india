# Phase 6.3F — Participant Documents Audit

## Scope
Private, organizer-authorized documents attached to EventParticipant records.

## Included
- PDF/image upload using the existing validated document uploader.
- Event + PARTICIPANTS module authorization.
- Participant-scoped list/download.
- Soft archive/restore.
- Audit logging.
- Cross-organizer isolation.
- No public document endpoint and no public document metadata.

## Security contract
- Documents are stored under the private `participant-documents` storage namespace.
- Download requires authenticated organizer event access.
- Public participant profiles never expose documents.
- Uploads inherit the existing 5MB limit and magic-byte validation.
- Cross-tenant access must return 404.

## Non-goals
- Document OCR.
- Document approval workflow.
- Visitor/exhibitor self-service document access.
- External document sharing.

## Verification target
Backend tests, Prisma migration, frontend build/lint, Browser E2E, dependency audit, and repository CI must all pass before merge.
