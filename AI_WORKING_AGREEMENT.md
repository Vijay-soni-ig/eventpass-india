# ExhibitTix AI Working Agreement

This document is the persistent operating contract for AI-assisted work on ExhibitTix. Read it at the start of every new project task/chat before acting.

## 1. Start with evidence
- Identify the requested outcome and affected persona/workflow.
- Inspect current repository state, relevant code, docs, PR, and exact commit before making recommendations or changes.
- Read existing phase reports and relevant decisions. Do not duplicate work that is already completed and verified.
- Treat user screenshots, reports, CI logs, and developer claims as clues—not proof. Verify independently where access allows.

## 2. Diagnose before fixing
- Reproduce or trace the failure and identify the root cause before proposing a fix.
- Do not guess, pile on speculative fixes, or repeat a failed approach without new evidence.
- Prefer the smallest safe change that addresses the proven root cause.
- Preserve business rules, RBAC, tenant isolation, data integrity, migrations, and established architecture.

## 3. Implementation loop
For code changes:
1. Inspect and establish baseline.
2. Trace UI → API → authorization → service/business logic → DB, as relevant.
3. State the root cause and intended fix.
4. Make one controlled change (or logically cohesive changes).
5. Run targeted tests for the exact scenario.
6. Run relevant regression/typecheck/build/security tests.
7. Inspect the resulting diff and test evidence.
8. Open/update PR with scope, cause, fix, tests, risks, and remaining gaps.
9. Check CI against the exact current PR head SHA—not an older commit.
10. After merge, verify the merge commit and deployment/E2E where available.

Do not report tests as passed unless they were actually run and results were inspected.

## 4. QA reporting vocabulary
Use only evidence-backed statuses:
- **PASS** — specific verification completed and passed.
- **PARTIAL PASS** — some checks passed; stated coverage gaps remain.
- **FAIL** — verified failure.
- **BLOCKED** — cannot proceed because a dependency/access/environment is missing.
- **NOT TESTED** — no verification performed.

Separate **Implemented**, **Verified**, **Partially verified**, and **Not verified**. A green check, successful build, API 200, or UI screenshot alone is not proof of a whole feature.

## 5. Priorities
- **P0:** Critical/blocking security, data-integrity, or core business failure.
- **P1:** Required before production/launch.
- **P2:** Important follow-up.
- **P3:** Nice-to-have.
Resolve critical product/security/data issues before cosmetic improvements or new features.

## 6. Production product standards
For each feature, assess applicable: purpose/value, persona, flow, UI states (loading/empty/error/success), API, database, CRUD, ownership, RBAC, validation, edge cases, notifications, audit logs, analytics, security, accessibility, responsive behavior, tests, and dependencies.

Financial/booking systems require server-side authority, transactions, idempotency, concurrency protection, webhook/signature verification, refunds/reconciliation, and audit trail as applicable.

## 7. Continuity across chats
At task start, read:
- this agreement,
- `PROJECT_STATE.md`,
- `TASK_TRACKER.md`,
- relevant `docs/DECISIONS.md` entries if present,
- linked phase reports and source code for the specific task.

At task end, update `TASK_TRACKER.md` with the exact current task, evidence, branch/PR/commit, checks actually run, failures/blockers, and next action. Update `PROJECT_STATE.md` only when a meaningful verified state change occurs. Record durable decisions in `docs/DECISIONS.md` (create only if needed).

If a document is missing, stale, or contradictory, verify from GitHub/code/CI and correct it. Do not pretend context or verification exists when it does not. Git/code/CI evidence outranks stale documentation; document discrepancies rather than silently assuming.

## 8. Communication
- Be direct, concise, and candid.
- Give the verified current status first, then blocker/risk, then the single best next action.
- Avoid unnecessary repeated questions or re-explaining established project context.
- Never promise autonomous work, continuous monitoring, or access that is not actually running/available.
- Do not claim a task is done until the relevant acceptance criteria and verification are satisfied.
