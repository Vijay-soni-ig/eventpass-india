# Exhibitor Experience Sprint Audit

Date: 2026-11-21
Base: main at d6f8d9d93c6da037f14911f5249c69d06a3b641e
Scope: My Business navigation, Insights, Documents, exhibitor regression

## Evidence status

This is a source audit only. Live Codespace/browser execution and test execution were unavailable during this audit. Nothing in this document should be interpreted as runtime verification.

## My Business

Source-level coverage exists in `e2e/exhibitor-business-navigation.spec.ts`. It exercises workspace navigation to My Business, Company Profile, Bank Setup, Team & Roles, back-navigation, direct profile URL, refresh, and active navigation state.

- Status: PARTIAL — test exists; execution not verified.

## Insights

`src/pages/exhibitor/analytics/Analytics.tsx` includes loading, business-selection, error/retry, no-data, metrics, and confirmed-participation states. Backend coverage exists for selected-business resolution and cross-exhibitor lead isolation; inspect the exact tests before relying on broad analytics test names.

Gap: no dedicated exhibitor Analytics browser E2E was found in the inspected E2E filenames.

Proposed browser checks:
- exhibitor opens Analytics and sees correct page heading and content/state
- loading state transitions to data or empty state
- retry recovers from an injected request failure
- business selection/switching scopes data correctly
- cross-business data is not exposed

- Status: PARTIAL — component and backend tests exist; dedicated browser flow and execution are not verified.

## Documents

`src/pages/exhibitor/documents/Documents.tsx` includes scoped preview/download requests, PDF and image preview handling, unsupported-MIME messaging, loading/error states, active/archive filtering, archive/restore controls, and permission-aware management UI.

Backend source tests inspected include `server/tests/documentAuthorization.test.ts`, `server/tests/exhibitorDocumentLifecycle.test.ts`, and `server/tests/pr01PrivateDocumentAccess.test.ts`, covering authorization boundaries, archive/restore lifecycle, private file delivery, and related failure paths.

Gap: no dedicated exhibitor Documents browser E2E was found in the inspected E2E filenames.

Proposed browser checks:
- active/archive list and empty states
- PDF preview, image preview, close-preview behavior
- successful download
- unsupported file type shows a clear error
- failed/missing document request shows recoverable error
- business switching and unauthorized business access do not leak documents

- Status: PARTIAL — component/backend coverage exists; browser flow and execution are not verified.

## Regression gate

Before sprint close, run and record results for:
- exhibitor login/dashboard
- My Business navigation/direct routes/refresh
- Insights route, retry, empty/data states, business selection
- Documents preview/download/archive/restore/error states
- mobile navigation smoke test
- PR #909-related exhibitor persona regression
- tenant isolation / permission negative tests
- CI and browser E2E on the exact candidate commit

## Release decision

Do not mark the sprint complete until the missing browser coverage is implemented (or existing coverage is demonstrated), tests run in an executable environment, failures are fixed, and the exact candidate commit has green required checks.

## Environment limitation

The provided Codespace URL could not be fetched through the available browser access. Repository source inspection is possible, but local app startup, Playwright execution, visual inspection, and live interaction are BLOCKED until a browser/terminal execution environment is available.
