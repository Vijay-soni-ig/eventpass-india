# ExhibitTix Project State

**Snapshot date:** 2026-11-22  
**Repository:** `Vijay-soni-ig/eventpass-india`  
**Snapshot source:** GitHub repository tree read on 2026-11-22 (tree SHA: `eaf0ce04829f2c7e0ff06607a1ced0619ae33225`). This is not a full current CI, production, or deployment audit.

## Product
ExhibitTix is an exhibition/event operations platform for Super Admin, Organizers, Exhibitors, and Visitors. Core lifecycle: event setup → venue/hall/stall inventory → exhibitor application/booking/payment → visitor registration/ticket purchase/payment → QR check-in → lead capture/follow-up → analytics/refunds/reconciliation.

## Architecture (repository-documented)
- Frontend: React, TypeScript, Vite, React Router, TanStack Query, Tailwind/shadcn.
- Backend: Node.js, Express, TypeScript, Prisma, PostgreSQL-compatible database.
- Infrastructure/config: Docker, Nginx, GitHub Actions.
- Core requirements: server-side RBAC/tenant boundaries, transaction-safe booking/capacity, verified payments/webhooks/idempotency, auditability.

## Existing documentation that must be reused
The repository already has substantial phase reports, production-readiness documentation, feature inventory, security matrices, test checklists, and a documentation index. Avoid creating duplicate “master” documents. Use and update the relevant existing document where appropriate.
- `docs/EXHIBITTIX_DOCUMENTATION_INDEX.md`
- `docs/EXHIBITTIX_MASTER_FEATURE_INVENTORY.md`
- `docs/PRODUCTION_READINESS_CURRENT_STATE.md`
- `docs/PRODUCTION_READINESS_GATE_TRACKER.md`
- `docs/INTEGRATION_TEST_CHECKLIST.md`
- `docs/PHASE_21E_CROSS_PERSONA_INTEGRATION_AUDIT_REPORT.md`
- Relevant security and workflow phase reports in `docs/`

## Evidence-backed notes from inspected documentation
- Phase 21E report records a passing continuous cross-persona lifecycle integration run, 126 tests reported passing at that phase, and one lead-analytics cache invalidation gap fixed.
- The Phase 21E report also records verification gaps: live interactive lead-capture click-through was not completed, some security/RBAC/idempotency matrices were not re-executed in that phase, and mobile audit was out of scope.
- Production readiness documents describe external gates such as real staging/production infrastructure, secrets, TLS/DNS, payment provider configuration, storage, monitoring/alerting, and backup/restore drills. Their dated claims need fresh verification before being treated as current.
- The current source tree includes the existing production-readiness and documentation files. This snapshot did **not** run application tests, CI, Browser E2E, production checks, or inspect every source file.

## Rules for maintaining this state
- Keep this file short and current. Add only verified facts and meaningful state changes.
- Every status should include evidence/date where practical.
- For PR/CI status, record exact PR head SHA and check names/results.
- For production/deployment status, use environment evidence—not repository files alone.
- When unsure, label `UNKNOWN`, `NOT VERIFIED`, or `STALE`.
