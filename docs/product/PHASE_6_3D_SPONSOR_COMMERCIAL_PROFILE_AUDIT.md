# Phase 6.3D — Sponsor Commercial Profile Integration Audit

## Scope
- Reuse the existing 6.2 sponsor package/profile foundation.
- Expose sponsor package presentation on the public participant profile.
- Keep sponsor pricing and commercial amounts private.
- Only active sponsor packages are publicly presented.
- Reuse existing PARTICIPANTS public visibility and event publication gates.
- Add regression coverage.

## Public contract
Allowed:
- sponsor branding fields
- public sponsor website
- active package name/description
- package benefits/deliverables
- explicit public benefit/deliverable overrides

Not exposed:
- package amount
- amount override
- internal currency/commercial pricing fields
- email/phone/private participant fields
- inactive/archived package presentation

## Security / isolation
- Published + public Event gate remains required.
- PARTICIPANTS module gate remains required.
- Participant must be ACTIVE, public, non-archived and non-STAFF.
- Sponsor specialization is only returned for SPONSOR participants.
- No payment, invoice, sponsorship transaction or financial settlement behavior is introduced.

## Verification target
- Backend build/tests
- Frontend lint/build
- Browser E2E
- Dependency/security audit
- Repository CI
- Merge only after all hard gates are green.
