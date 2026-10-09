# ExhibitTix — Staging Deployment Contract

## Purpose

Staging is the production-like verification environment between CI and production. It must use real infrastructure services where they materially affect production behavior, while keeping payment credentials and customer data isolated from production.

This repository provides a repeatable staging deployment contract. It does **not** create a hosted staging environment by itself; a staging host, PostgreSQL database, S3-compatible bucket, DNS, and secrets must still be provisioned outside Git.

## Required staging infrastructure

- A dedicated staging host/VM/container platform capable of running Docker Compose.
- A dedicated PostgreSQL database. Never point staging at production.
- A dedicated S3-compatible object-storage bucket and credentials.
- Two DNS hostnames pointing to the staging host: frontend and API.
- Public inbound TCP ports 80 and 443 (and UDP 443 for HTTP/3).
- Secrets stored in the hosting provider/secret manager, not in Git.
- Optional Razorpay test credentials. If unavailable, keep the payment provider on the repository's mock/sandbox path and do not claim real Razorpay verification.

The staging Compose file now includes Caddy as the TLS ingress. Caddy obtains and renews certificates automatically when both hostnames resolve to the server and ports 80/443 are reachable. The frontend and API containers are not published directly to the public host ports.

## DNS and environment setup

1. Create DNS A records for the frontend hostname and API hostname pointing to the staging server's public IPv4 address. Add AAAA records only if IPv6 is configured and reachable.
2. Copy `.env.staging.example` to `.env.staging`.
3. Replace the example hostnames with your actual staging hostnames in `STAGING_FRONTEND_HOST`, `STAGING_API_HOST`, `STAGING_FRONTEND_URL`, and `STAGING_API_URL`.
4. Set all required database, JWT, and object-storage values using staging-only credentials.
5. Keep `.env.staging` out of Git. Prefer the hosting provider's secret manager when available.

## Deployment

From the repository root on the staging host:

```bash
cp .env.staging.example .env.staging
# Edit .env.staging with real staging hostnames and staging-only credentials.
docker compose --env-file .env.staging -f docker-compose.staging.yml config
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d --build
```

The API container runs `prisma migrate deploy` before starting the application, matching the production container contract. Caddy persists certificates/configuration in named Docker volumes.

## Required environment values

`DATABASE_URL`, `JWT_SECRET`, `STAGING_FRONTEND_HOST`, `STAGING_API_HOST`, `STAGING_FRONTEND_URL`, `STAGING_API_URL`, `STORAGE_S3_REGION`, `STORAGE_S3_BUCKET`, `STORAGE_S3_ACCESS_KEY_ID`, and `STORAGE_S3_SECRET_ACCESS_KEY` are mandatory.

Use separate staging secrets, database credentials, storage credentials, and domains from production.

## Smoke verification

After deployment:

```bash
node scripts/verify-staging.mjs https://staging-api.your-domain
```

The smoke check requires:

- `GET /api/health` → HTTP 200 and `ok=true`
- `GET /api/health/ready` → HTTP 200 and database `ready`

Then verify the frontend URL manually and run the normal Browser E2E suite against the staging frontend origin. Also verify the browser can reach the API hostname and that CORS permits only the configured frontend origin.

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

1. The host is provisioned and its firewall permits only required ports.
2. DNS resolves correctly for both staging hostnames.
3. HTTPS certificates are issued and valid.
4. PostgreSQL connectivity and migrations succeed.
5. S3-compatible object storage is reachable and upload/read/delete have been tested.
6. Health/readiness checks pass through the public API hostname.
7. Browser E2E passes against staging.
8. Logs and monitoring are visible for the staging services.

Until those external steps are completed, this repository change is **deployment-configured**, not a claim that staging already exists.
