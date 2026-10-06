# ExhibitTix Design System v1.0 - DS-04 Visual Regression Verification

## Scope

DS-04 adds an automated visual-system contract on top of the existing functional Browser E2E suite.

The purpose is to catch design-system regressions that ordinary route/role assertions can miss:
- canonical light-theme token values
- dark-theme semantic token values
- Manrope heading typography
- Inter body/UI typography
- primary action rendering through the canonical Brand Blue token

## Implemented

Added `e2e/design-system.spec.ts` with three checks:

1. Public light-theme token contract
2. Dark-theme semantic token contract
3. Public primary CTA computed-color contract

These tests intentionally verify computed browser styles rather than source strings. This means a future component can only pass if the token is actually resolved by the browser.

## Verification boundary

This does **not** replace screenshot/staging review.

GitHub Browser E2E can prove that the application renders and that the automated style contract passes. It cannot prove pixel-level visual parity across all responsive breakpoints, real content densities, image states, floor-plan interactions, charts, or production browser/device combinations.

Required manual/staging review remains:
- Homepage
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

- Canonical v1 brand tokens are unchanged.
- Light-mode semantic roles resolve to the documented values.
- Dark-mode semantic roles resolve to the documented values.
- Body/UI typography resolves to Inter.
- Heading typography resolves to Manrope.
- Primary public CTA resolves to Brand Blue.
- Browser E2E remains green.
- No claim of full visual parity is made without screenshot/staging evidence.

## Status

**Automated visual-system contract:** IMPLEMENTED.

**Full screenshot/staging visual regression:** NOT VERIFIED.
