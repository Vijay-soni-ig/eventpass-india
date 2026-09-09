# Phase 26.2 — Production Deployment Foundation

## Objective
Make ExhibitTix deployable as a production-style frontend + API stack with deterministic builds, database readiness checks, graceful shutdown, secure runtime headers, and persistent upload storage.

## Included
- Multi-stage production Docker image for the React/Vite frontend.
- Nginx SPA fallback and static asset caching.
- Multi-stage production Docker image for the Express/Prisma API.
- Prisma client generation during the image build.
- `prisma migrate deploy` before API startup.
- API liveness endpoint: `/api/health`.
- API readiness endpoint: `/api/health/ready`, backed by a database query.
- Graceful SIGTERM/SIGINT shutdown with Prisma disconnect.
- Production security headers and explicit CORS configuration.
- Persistent Docker volume for uploaded files.
- Production Compose definition with API health-gated frontend startup.

## Deployment contract
The deployment environment must provide:
- Managed PostgreSQL or equivalent production PostgreSQL service.
- Strong `JWT_SECRET`.
- Explicit `CORS_ORIGINS`.
- Razorpay production credentials for real payment processing.
- TLS termination at the hosting/load-balancer layer.
- Persistent and backed-up storage for `/app/uploads` until object storage is introduced.

Secrets must be supplied by the deployment platform, never committed to Git.

## Health semantics
- `/api/health` confirms the Node process is responding.
- `/api/health/ready` confirms the API can reach PostgreSQL.
- A deployment should receive traffic only after readiness succeeds.

## Production limitations to address before high-scale launch
Local Docker volume storage is persistent for a single deployment host but is not suitable for multi-node scaling. Uploaded documents/media should move to object storage (for example S3-compatible storage) before horizontal API scaling.

Razorpay live transaction execution remains an external credential/access gate. CI verifies the provider-independent code paths but cannot prove a real-money transaction without gateway access.

## Verification
CI must pass frontend lint/build, backend build, Prisma migrations, seed, and backend tests. Container smoke tests and live infrastructure verification must be run in the target deployment environment before production launch.
