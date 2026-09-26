# AVM P0/P1 Production Hardening

Date: 2026-09-26

## Goal

Close the highest-value Advanced Venue Management production gaps in one implementation package without breaking the existing Exhibition compatibility architecture.

## Included in this PR

1. **Event → Venue allocation foundation**
   - Event-scoped venue/building/floor/zone/space allocations.
   - Tenant-scoped CRUD, archive/restore and audit logging.
   - Hierarchy ownership validation.
   - Advisory-lock duplicate protection for concurrent allocation writes.

2. **Availability / maintenance integration boundary**
   - AVM-12D venue-wide Event publish protection remains server-authoritative.
   - The allocation model provides the missing persisted Event → physical-space usage boundary needed for safe future floor/space conflict enforcement.
   - Existing Exhibition stall/floor-plan ownership remains unchanged.

3. **Concurrency hardening**
   - Allocation writes use PostgreSQL transaction advisory locks.
   - Regression coverage verifies concurrent duplicate requests produce one success and one conflict.

4. **Security / tenant isolation**
   - Allocation routes use Event ownership plus existing event:view / event:update permissions.
   - Cross-tenant Event access returns not-found behavior.
   - A1 endpoint inventory is updated.

## Explicitly not claimed complete by code alone

These are deployment/operations activities and cannot be truthfully marked complete from a repository PR:

- Loading real production venue/building/floor/space data.
- Configuring production credentials/secrets and Razorpay credentials.
- Executing a real production backup + restore drill against the deployed environment.
- Performing final production smoke/E2E against real infrastructure.
- Confirming production object storage, monitoring, alert routing, DNS/TLS and rollback procedures.

The repository already contains backup/restore helpers and CI syntax validation; this PR does not pretend that helper presence equals a completed recovery drill.

## Acceptance criteria

- [ ] Event can reference a reusable physical Venue and optionally allocate specific physical scope.
- [ ] Allocation cannot cross the Event's Venue hierarchy.
- [ ] Duplicate allocation is rejected.
- [ ] Concurrent duplicate allocation cannot create two records.
- [ ] Cross-tenant Event access is rejected.
- [ ] Existing AVM-12D venue-wide scheduling guard remains active.
- [ ] Existing Exhibition commercial ownership remains unchanged.
- [ ] CI, Browser E2E and Dependency Audit pass on the final PR head.
- [ ] Deployment-level production checks are completed separately before launch.