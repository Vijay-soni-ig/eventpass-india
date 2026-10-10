# Staging Smoke Verification

## Purpose

The staging environment is an external deployment dependency. Repository configuration alone does not prove that staging exists or is healthy.

This workflow provides a repeatable, auditable smoke check for the deployed release candidate.

Workflow:

`.github/workflows/staging-smoke.yml`

## Required GitHub environment

Create a GitHub environment named `staging` and configure these **environment secrets**:

- `STAGING_API_URL` — public HTTPS base URL for the API service (for example, `https://staging-api.example.com`).
- `STAGING_FRONTEND_URL` — public HTTPS base URL for the frontend (for example, `https://staging.example.com`).

Use HTTPS for real staging. HTTP is accepted only for localhost/127.0.0.1 development targets. The API and frontend can share a hostname if the deployment intentionally routes them that way, but each URL must point to the correct service/path contract.

No production credentials are required by this smoke check.

## Verification performed

The workflow checks:

1. Both URLs are configured and use HTTPS outside localhost.
2. API `GET /api/health` returns HTTP 2xx and `{"ok":true}`.
3. API `GET /api/health/ready` returns HTTP 2xx, `{"ok":true}`, and database state `ready`.
4. API public Event discovery at `GET /api/public/events?limit=1` returns a response containing the `events` field.
5. API security headers include `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: no-referrer`.
6. The frontend root returns HTTP 2xx and HTML content.
7. The tested commit SHA and workflow run are recorded in the job output.

## Run the check

1. Confirm the GitHub `staging` environment contains both secrets and that both services are deployed.
2. Open **Actions → Staging Smoke Check → Run workflow**.
3. Review every step in the run; do not infer success from workflow creation alone.
4. Record the successful workflow run URL, commit SHA, API URL, and frontend URL as staging evidence.

## What this does not prove

A passing smoke check does not replace:

- CI quality and Browser E2E;
- authentication/RBAC and tenant-isolation verification against staging;
- payment sandbox verification (intentionally deferred in current development);
- object-storage upload/read/delete verification;
- backup/restore drill;
- external monitoring and alert delivery;
- rollback/recovery drill;
- production infrastructure readiness.

## Current status

The workflow is implemented, but **staging is not verified** until the `staging` environment is configured with real deployed URLs and this workflow completes successfully against them.
