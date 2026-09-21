# Staging Smoke Gate

The repository includes a manual GitHub Actions smoke workflow at `.github/workflows/staging-smoke.yml`.

## Purpose

This is a repeatable operational check for a real staging deployment. It verifies:

- a staging base URL is configured in the GitHub `staging` environment;
- the URL uses HTTPS outside localhost;
- the API liveness endpoint responds with `{"ok":true}`;
- the database-backed readiness endpoint reports `{"ok":true,"database":"ready"}`;
- the frontend root responds with non-empty content;
- the tested commit SHA and workflow run are recorded in the job output.

## Usage

1. Configure the GitHub `staging` environment.
2. Add `STAGING_BASE_URL` as an environment secret.
3. Run **Actions → Staging Smoke Check → Run workflow**.
4. Record the successful workflow run URL and commit SHA as staging evidence.

## Scope

A successful smoke run proves that the deployed application is reachable and its database readiness check is healthy. It does not replace:

- Browser E2E;
- authentication/RBAC and tenant-isolation verification;
- payment sandbox verification;
- object-storage verification;
- backup/restore verification;
- external monitoring and alerting verification.

This is an operational gate, not a claim that staging or production is fully verified.
