# ExhibitTix Documentation & Product Current-State Audit

Audit date: 2026-09-22
Repository: Vijay-soni-ig/eventpass-india
Base reviewed: main
Latest reviewed commit: 53a814c13f2d6f5f51c68c12e034b025691fff5c

## Executive summary
The repository already contains substantial production-oriented documentation and implementation. This program therefore starts with consolidation and evidence mapping, not a blank-slate rewrite.

Verified during this audit:
- Universal Event foundation exists in the Prisma schema.
- Exhibition remains an operational domain with an additive event link.
- Universal registration, ticketing, check-in, lead, participant, and module-enablement models are present.
- Existing Universal Event documentation explicitly treats migration as additive and compatibility-sensitive.
- Main had no open pull requests at the time of this audit.
- Recent main commits include security audits, tenant-isolation work, JWT hardening, request-size limits, and CI/browser quality gates.

## Implementation observations

### Universal Event
The schema contains Event, EventCategory, EventModule, EventModuleEnablement, EventRegistration, EventRegistrationSettings, EventTicketOrder, EventTicket, EventTicketCheckIn, EventLead, EventLeadInteraction, EventLeadFollowUp, and EventParticipant.

Exhibition has a nullable unique event link, preserving the legacy Exhibition relationship while enabling universal Event linkage.

### Authorization
Existing Universal Event architecture documentation identifies organizer-scoped authorization as a critical invariant. New Event routes must preserve server-side permitted-organizer filtering and must not rely on frontend visibility.

### Financial integrity
Repository documentation covers server-side payment verification, webhooks, signature verification, idempotency, pending/failed states, refunds, fees, taxes, invoices, and reconciliation. These should be consolidated into one payment architecture specification with evidence references.

### Floor-plan risk
The existing Universal Event analysis identifies floor-plan publishing as a high-precision migration risk because publishing uses raw SQL and PostgreSQL advisory locking. Any future event/exhibition key migration must preserve the concurrency invariant and re-run the relevant concurrency tests.

### Testing
Existing architecture analysis reported substantial backend coverage and gaps around frontend/browser testing. Current main history now includes a browser gate, so the QA documentation must be refreshed against current workflow evidence before declaring E2E coverage complete.

## Documentation gaps

P0:
1. Canonical PRD.
2. Business rules/state machines.
3. Unified roles/permissions matrix.
4. Unified system architecture.
5. Database architecture/ERD.
6. API specification.
7. Payment lifecycle.
8. Refund/cancellation rules.
9. Audit logging specification.
10. Threat model.
11. QA/E2E strategy.
12. Production-readiness evidence map.
13. Legal documents requiring business/legal review.

P1:
- Deployment/runbook consolidation.
- Backup and disaster recovery.
- Incident response.
- Reconciliation.
- Performance/scalability.
- User and admin manuals.
- Operational support procedures.

## Documentation risk
The primary documentation risk is drift: multiple phase documents may accurately describe individual phases without providing one current source of truth.

The program therefore uses one canonical document per subject, with phase/audit documents treated as evidence rather than competing specifications.

## Next sequence
1. PRD baseline.
2. Business rules and lifecycle state machines.
3. RBAC/permissions matrix.
4. System architecture.
5. Database architecture/ERD.
6. API specification.
7. Payment/refund architecture.
8. Security/threat model and audit logging.
9. QA/E2E strategy.
10. Production-readiness and risk register.
11. Legal/user/operations documents.

## Completion criterion
Each P0 document must be cross-checked against implementation and discrepancies classified as IMPLEMENTED, VERIFIED, PARTIAL, PLANNED, BLOCKED, or NOT VERIFIED.
