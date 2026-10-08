# Universal Event Production Readiness Audit — 2026-10-08

## Scope

Audit the current `main` implementation after completion of the 001E read cutover and 001F Event Categories/Modules work.

Base commit audited: `f629b09f0d20ac26cf001bb692f322c55f3a9b72`

This audit distinguishes:

- **Verified** — repository code/tests provide direct evidence.
- **Partially verified** — repository support exists, but required environment/provider evidence is missing.
- **Not verified** — requires an actual deployed environment or operational evidence.
- **Not a defect** — intentionally remains Exhibition-specific.

## Executive result

### Universal Event foundation

**STATUS: COMPLETE / VERIFIED**

001A–001F are implemented. No new 001F foundation work should be started.

Verified areas include:

- Event canonical root and Exhibition linkage.
- Event categories with active/inactive, hierarchy, ordering, filtering, pagination and archive semantics.
- Canonical category validation on Event create/update.
- Per-Event module enablement and configuration validation.
- Server-side module enforcement.
- Organizer ownership/RBAC on Event APIs.
- Archived Event restrictions.
- Linked Exhibition module compatibility.
- Universal Event organizer workspace and editor.
- Universal public discovery/detail surfaces.
- Universal registration-to-ticket handoff.
- Canonical public Event ticket reads with Exhibition compatibility for legacy ticket checkout.
- Universal Event ticket management and ticket purchase E2E coverage.
- Standalone Conference E2E coverage.
- Tenant-isolation regression coverage for Event and related resource families.
- Mutation rate-limit coverage for critical route families.
- Upload MIME/magic-byte/resource controls.
- Production storage configuration guard.
- Health/readiness endpoints and structured request logging.

## Verified second-event-type path

The repository already contains a meaningful non-Exhibition production validation path using a Conference event fixture.

Verified by existing E2E coverage:

1. Organizer opens the Universal Event list.
2. Standalone Conference remains on `/organizer/events/:id`.
3. Universal Event workspace/editor is used.
4. Exhibition-only workspace links are absent.
5. Registration and Ticketing remain Event-native.
6. Unsupported Exhibition-dependent modules are disabled in UI and rejected by API.
7. Organizer can create a standalone Conference Event.
8. Organizer can publish it through the server-authoritative publish endpoint.
9. Public discovery/detail stays on Event routes.
10. Universal ticketing works without an Exhibition dependency.
11. Ticket management, availability and free-ticket purchase are covered.
12. Ticket module disablement is enforced at both UI and API layers.

**Assessment:** repository-level second-event-type validation is already substantially complete.

## Exhibition references that should remain

The following are not 001E migration defects and should not be blindly rewritten:

- Stalls and stall inventory.
- Interactive floor plans.
- Exhibition exhibitor participation/booth relationships.
- Exhibition-specific ticket/stall booking compatibility.
- Exhibition content blocks.
- Legacy Exhibition response shapes.
- Legacy Exhibition operational lead/booking bridges where their underlying models are still Exhibition-scoped.

The correct migration target is universal Event identity/lifecycle ownership, not removal of every `exhibitionId` from legitimate operational extensions.

## Security / authorization

### Verified

- Repository-verifiable A2 tenant isolation is closed.
- Event authorization resolves permitted organizer scope server-side.
- Event mutation endpoints require appropriate permissions.
- Participant/module route families use organizer-scoped Event resolution.
- Critical mutation route families have rate-limit contracts.
- Production rate-limit topology fails closed unless explicitly configured for the supported single-instance mode.
- Production HTTP security headers/CORS controls are implemented.
- Upload boundaries are covered by repository tests.

### Remaining security work

**P1 — deployment/security verification**

Repository evidence does not replace:

- Deployment-level penetration testing.
- Real production/staging authorization testing.
- Real proxy/load-balancer rate-limit verification.
- Centralized production log review.
- Secret-management verification.

These should be executed in staging before public launch.

## Production infrastructure gates

These remain external and must not be marked PASS from source inspection.

| Gate | Status | Required evidence |
|---|---|---|
| Production database | NOT VERIFIED | Real PostgreSQL deployment and credentials |
| Production secrets | NOT VERIFIED | Secure secret-manager configuration |
| DNS/TLS | BLOCKED | `exhibittix.com` DNS must resolve and production HTTPS must be reachable |
| Staging deployment | NOT VERIFIED | Real staging URL, build ID, migration and smoke evidence |
| Object storage | PARTIAL | Real S3-compatible bucket upload/read/delete test |
| Backup | PARTIAL | Actual isolated restore drill with measured RTO/RPO |
| Monitoring | PARTIAL | Configured alerts + safe synthetic failure test |
| Razorpay | EXTERNAL / SKIPPED FOR CURRENT DEVELOPMENT | Credentialed provider verification is required before real-money launch |
| Full cross-persona staging E2E | NOT VERIFIED | Execute business lifecycle against deployed staging |
| Rollback drill | NOT VERIFIED | Deploy, rollback and verify recovery |

## Highest-value next engineering work

Because the repository already has strong Universal Event coverage, the next engineering focus should be **production verification rather than more Event abstraction**.

### P0

No repository P0 identified by this audit.

### P1

1. Establish/verify staging deployment.
2. Verify DNS/TLS and public production reachability.
3. Provision and test production object storage.
4. Execute isolated backup/restore drill and record RTO/RPO.
5. Connect monitoring/alerting and execute a synthetic failure test.
6. Run full staging cross-persona E2E excluding real payments where payment integration is intentionally deferred.
7. Perform deployment-level tenant/RBAC and rate-limit verification.

### Payment note

Razorpay implementation should remain outside the current development execution path per project direction. It is a launch gate, not the next repository feature.

## Do not do next

Do not:

- Rebuild 001F.
- Rename Exhibition operational tables to Event.
- Remove legitimate Exhibition-specific relationships.
- Create duplicate ticket/stall/payment systems.
- Replace the existing Exhibition booking flow without a complete Event-native replacement.
- Introduce a distributed rate-limit store before horizontal scaling is actually required.
- Treat documentation or CI as proof that external infrastructure is operational.

## Acceptance criteria for this audit

This audit is complete as a repository assessment when:

- Current `main` state is recorded.
- Universal Event foundation status is evidence-backed.
- Non-Exhibition validation is checked.
- Exhibition compatibility boundaries are explicit.
- Security and rate-limit evidence is separated from deployment claims.
- External launch blockers are listed with concrete evidence requirements.
- Next engineering action is prioritized by production risk.

**Conclusion: ExhibitTix should move from Universal Event migration work into production-environment verification and launch hardening.**
