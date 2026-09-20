# Staging Smoke Verification

## Purpose

The staging environment is an external deployment dependency. Repository configuration alone does not prove that staging exists or is healthy.

This workflow provides a repeatable, auditable smoke check for the deployed release candidate.

Workflow:

`.github/workflows/staging-smoke.yml`

## Required GitHub environment

Create a GitHub environment named `staging` and configure:

- `STAGING_BASE_URL` — the public base URL of the staging deployment.

Use an HTTPS URL for real staging. HTTP is accepted only for localhost/127.0.0.1 development targets.

No production credentials are required by this smoke check.

## Verification performed

The workflow checks:

1. `GET /api/health` returns HTTP 2xx and `{"ok":true}`.
2. `GET /api/health/ready` returns HTTP 2xx, `{"ok":true}`, and database state `ready`.
3. The frontend root returns HTTP 2xx and a non-empty response.
4. The exact GitHub commit SHA and workflow run are recorded in the job output.

## What this does not prove

A passing smoke check does not replace:

- CI quality
- Browser E2E
- RBAC/tenant-isolation verification
- payment sandbox verification
- upload/private-document verification
- rollback/recovery drill
- production infrastructure readiness

Those remain separate release gates.

## Current status

The workflow is implemented, but **staging is not verified** until the `staging` environment is configured with a real deployed URL and this workflow completes successfully against it.
