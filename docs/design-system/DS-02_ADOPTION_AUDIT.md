# ExhibitTix Design System v1.0 - DS-02 Adoption Audit

## Scope

Audit the post-DS-01 codebase on `main` for styling that bypasses the canonical ExhibitTix design tokens.

Reviewed areas:
- Global CSS and Tailwind tokens
- Shared UI primitives
- Public header/navigation
- Organizer, Exhibitor, and Super Admin dashboard surfaces
- Public discovery/event surfaces
- Status and semantic color usage

## Findings

### PASS - Global token foundation

`src/index.css` defines the canonical:
- Brand Navy
- Brand Navy Deep
- Brand Blue
- Brand Cyan
- semantic primary, secondary, accent, destructive, success, and warning tokens
- light and dark mode equivalents
- Manrope display typography and Inter body/UI typography

### PASS - Tailwind exposure

`tailwind.config.ts` exposes the brand tokens under `brand.navy`, `brand.navy-deep`, `brand.blue`, and `brand.cyan`.

Shared semantic utilities continue to resolve through CSS variables.

### PASS - Shared UI primitives

Button, Badge, and StatusBadge use semantic tokens such as:
- `bg-primary`
- `text-primary`
- `bg-secondary`
- `bg-destructive`
- `bg-success`
- `bg-warning`
- `ring`

No new hard-coded brand color was identified in the reviewed primitives.

### PASS - Public and dashboard surfaces

Representative public header and Organizer/Exhibitor/Platform dashboard surfaces use semantic tokens rather than hard-coded brand colors.

### PASS - Legacy teal search

Repository searches found no remaining legacy teal HSL/HEX utility references in application code.

The `gradient-teal` class remains only as a compatibility alias and resolves to the canonical brand gradient.

### FIXED - Dead Vite starter stylesheet

`src/App.css` was an unused Vite starter stylesheet containing:
- hard-coded demo colors
- starter logo animation
- a global `#root` max-width/padding rule
- unused `.card` and `.read-the-docs` rules

`src/main.tsx` imports only `src/index.css`, so `src/App.css` had no runtime dependency.

It has been removed to prevent dead legacy styling from becoming an accidental design-system bypass.

## Remaining verification

A repository audit cannot prove visual parity at every route. The following require browser/staging verification:
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

- No new hard-coded brand primary.
- Shared UI uses semantic tokens.
- Semantic status colors remain distinct from brand colors.
- Legacy teal is not the default visual language.
- Dark mode retains equivalent semantic roles.
- Dead starter CSS is removed.
- Browser visual regression passes on representative persona surfaces.

## Status

**Implementation:** PASS for repository-level adoption findings.

**Browser visual regression:** NOT VERIFIED in this audit. CI/E2E must be used to validate the branch before merge.
