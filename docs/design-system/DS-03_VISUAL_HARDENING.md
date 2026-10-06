# ExhibitTix Design System v1.0 - DS-03 Visual Hardening Audit

## Scope

Post-DS-02 hardening pass on `main`, focused on verified design-system bypasses and semantic status usage in representative public and dashboard surfaces.

## Verified findings and fixes

### FIXED - Free-event price bypass

**Surface:** `src/components/home/NearbyEventsSection.tsx`

The "Free" price label used an inline HSL color:

`hsl(160, 72%, 36%)`

This bypassed the canonical semantic color system and made the component harder to maintain consistently.

**Fix:** replaced the inline color with the existing `text-success` semantic token.

### FIXED - Refunded status incorrectly mapped to destructive

**Surface:** `src/components/ui/status-badge.tsx`

`refunded` was using the destructive red treatment. A refund is a completed financial state, not a failure or destructive action. Red creates the wrong operational meaning for payment/reconciliation screens.

**Fix:** `refunded` now uses the neutral secondary status treatment. `partially_refunded` remains warning because it represents an incomplete reversal state.

## Repository-level verification

- Canonical brand tokens remain defined in `src/index.css`.
- Tailwind brand tokens remain exposed in `tailwind.config.ts`.
- Legacy `gradient-teal` compatibility alias remains intentionally retained and resolves to the canonical brand gradient.
- DS-02 removed the unused Vite starter stylesheet.
- Shared Button, Badge, StatusBadge, StatCard and KPI components use semantic tokens.

## Visual verification boundary

This audit does **not** claim pixel-perfect visual regression across every route. GitHub repository inspection and CI/E2E evidence can validate implementation and functional rendering, but screenshots/staging review are required to claim full visual parity.

Representative surfaces requiring staging/browser review remain:

- Public homepage
- Event discovery
- Event detail
- Ticket checkout
- Organizer dashboard
- Organizer event editor
- Exhibitor dashboard
- Super Admin dashboard
- Floor-plan editor/viewer
- Analytics/chart surfaces
- Mobile navigation
- Dark mode

## Acceptance criteria

- No verified hard-coded brand/status color bypass remains in the audited findings.
- Semantic status colors communicate operational meaning correctly.
- Free/paid pricing states use the semantic design system.
- Legacy teal is not the default visual language.
- Dark-mode semantic roles remain intact.
- CI, Browser E2E, and Dependency Audit must pass before merge.

## Status

**Implementation:** PASS for the verified DS-03 fixes.

**Full visual regression:** NOT VERIFIED until browser/staging screenshots are reviewed.
