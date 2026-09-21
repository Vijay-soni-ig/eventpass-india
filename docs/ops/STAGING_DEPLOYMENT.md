# ExhibitTix — Staging Deployment Contract

## Purpose

Staging is the production-like verification environment between CI and production. It must use real infrastructure services where they materially affect production behavior, while keeping payment credentials and customer data isolated from production.

This repository now provides a repeatable staging deployment contract. It does **not** create a hosted staging environment by itself; a staging host, PostgreSQL database, S3-compatible bucket, DNS/HTTPS, and secrets still have to be provisioned outside Git.

## Required staging infrastructure

- A dedicated staging host/VM/container platform capable of running Docker Compose.
- A dedicated PostgreSQL database. Never point staging at production.
- A dedicated S3-compatible object-storage bucket and credentials.
- HTTPS for the public frontend and API.
- A staging frontend origin and API origin.
- Secrets stored in the hosting provider/secret manager, not in Git.
- Optional Razorpay test credentials. If unavailable, keep the payment provider on the repository's mock/sandbox path and do not claim real Razorpay verification.

## Deployment

From the repository root on the staging host:

```bash
cp .env.staging.example .env.staging
# Fill every required value with staging-only infrastructure credentials.
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d --build
```

The API container runs `prisma migrate deploy` before starting the application, matching the production container contract.

## Required environment values

`DATABASE_URL`, `JWT_SECRET`, `STAGING_FRONTEND_URL`, `STAGING_API_URL`, `STORAGE_S3_REGION`, `STORAGE_S3_BUCKET`, `STORAGE_S3_ACCESS_KEY_ID`, and `STORAGE_S3_SECRET_ACCESS_KEY` are mandatory.

Use separate staging secrets, database credentials, storage credentials, and domains from production.

## Smoke verification

After deployment:

```bash
node scripts/verify-staging.mjs https://staging-api.example.com
```

The smoke check requires:

- `GET /api/health` → HTTP 200 and `ok=true`
- `GET /api/health/ready` → HTTP 200 and database `ready`

Then verify the frontend URL manually and run the normal Browser E2E suite against the staging origin.

## Production-safety rules

- Never use production database credentials in staging.
- Never upload production customer files into staging.
- Never use production Razorpay credentials in staging.
- Never commit `.env.staging` or any secret values.
- Keep staging payment/provider webhooks isolated from production.
- Keep CORS restricted to the staging frontend origin.
- Treat staging as disposable: test data must be synthetic and recoverable.

## Definition of done

A staging environment is **real and verified** only when:

1. The host is provisioned.
2. PostgreSQL connectivity and migrations succeed.
3. S3-compatible object storage is reachable.
4. HTTPS frontend and API are reachable.
5. Health/readiness checks pass.
6. Browser E2E passes against staging.
7. Logs and monitoring are visible for the staging services.

Until those external steps are completed, this repository change is **staging-ready**, not a claim that staging already exists.
