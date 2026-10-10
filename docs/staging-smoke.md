# Staging Smoke Gate

The repository includes a manual GitHub Actions smoke workflow at `.github/workflows/staging-smoke.yml`.

## Purpose

This is a repeatable operational check for a real staging deployment. It verifies:

- both API and frontend URLs are configured in the GitHub `staging` environment;
- each URL uses HTTPS outside localhost;
- the API liveness endpoint responds with `{"ok":true}`;
- the database-backed readiness endpoint reports `{"ok":true,"database":"ready"}`;
- public Event discovery responds with the expected `events` field;
- required API security headers are present;
- the frontend root responds with HTML;
- the tested commit SHA and workflow run are recorded in the job output.

## Usage

1. Deploy the API and frontend to staging.
2. Configure a GitHub environment named `staging`.
3. Add these **environment secrets**:
   - `STAGING_API_URL` — public base URL for the API service, such as `https://staging-api.example.com`.
   - `STAGING_FRONTEND_URL` — public base URL for the frontend, such as `https://staging.example.com`.
4. Run **Actions → Staging Smoke Check → Run workflow**.
5. Inspect all steps and record the successful workflow run URL and commit SHA as staging evidence.

Use HTTPS for real staging. HTTP is accepted only for localhost/127.0.0.1 development targets. The API and frontend may use the same hostname if both URLs resolve to the correct service/path contract.

## Scope

A successful smoke run provides basic reachability, API/database readiness, public discovery, security-header, and frontend checks. It does not replace:

- Browser E2E;
- authentication/RBAC and tenant-isolation verification;
- payment sandbox verification;
- object-storage verification;
- backup/restore verification;
- rollback/recovery drill;
- external monitoring and alerting verification.

This is an operational gate, not a claim that staging or production is fully verified.

## Current status

Staging remains **NOT VERIFIED** until real deployed URLs are configured and this workflow passes against the running services.
