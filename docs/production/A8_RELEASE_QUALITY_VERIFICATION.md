# A8 Release Quality Verification

## Purpose

A8 verifies that the ExhibitTix release candidate meets the production quality baseline across performance, accessibility, responsive/mobile behavior, and critical visitor/organizer workflows.

## Repository evidence already available

- `scripts/verify-frontend-performance.mjs` enforces JavaScript/CSS asset budgets after a production build.
- `scripts/verify-accessibility-contract.mjs` checks image alt attributes, positive tab-index usage, document language, viewport metadata, and keyboard skip-link requirements.
- CI and Browser E2E remain mandatory merge gates.
- Browser E2E is repository evidence only; it does not replace deployed device/browser verification.

## Required release-candidate verification

Record the exact deployed commit SHA and environment before execution.

### Performance

- Production build completes successfully.
- Frontend performance budget script passes.
- Verify representative public event detail and ticket checkout routes on desktop and mobile.
- Record Lighthouse/PageSpeed results for representative public pages.
- Check LCP, INP, CLS, TTFB and total transferred bytes.
- Investigate regressions rather than accepting an aggregate score alone.

### Accessibility

- Accessibility contract script passes.
- Run automated accessibility scan against representative public and authenticated pages.
- Keyboard-only navigation covers event discovery, ticket selection, checkout, QR ticket view, organizer event management, and scanner.
- Verify focus visibility, dialog focus management, form labels/errors, headings/landmarks, contrast, and touch target sizing.
- Verify screen-reader names for critical actions and status messages.

### Responsive/mobile

Verify at minimum:
- iPhone-sized viewport
- Android-sized viewport
- tablet viewport
- desktop viewport

Critical journeys:
- public event discovery/detail
- ticket purchase
- QR ticket display
- organizer dashboard
- stall/floor-plan workflow
- exhibitor lead capture
- scanner/check-in

Record horizontal overflow, clipped controls, modal/dialog usability, sticky/fixed controls, touch targets, and keyboard behavior.

### Data/workflow regression

Cross-check UI and API behavior for:
- Event publication and visibility
- ticket availability/capacity
- checkout/reservation
- QR ticket rendering
- check-in
- lead capture
- organizer analytics

## Completion classification

- **PASS:** exact release candidate has repository checks plus deployed performance, accessibility, and mobile evidence with no unresolved P0/P1 defects.
- **PARTIAL PASS:** repository checks are green but one or more deployed/device measurements remain outstanding.
- **BLOCKED:** required staging/deployed environment or device/browser access is unavailable.
- **FAIL:** a required invariant or quality threshold is violated.

## Current status

**PARTIAL PASS / BLOCKED for deployed evidence.**

Repository-side verification exists, but this document does not claim Lighthouse/PageSpeed, real-device, or deployed accessibility evidence. Those require execution against the release candidate environment.
