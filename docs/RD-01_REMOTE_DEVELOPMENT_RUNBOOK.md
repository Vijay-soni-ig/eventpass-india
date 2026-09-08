# RD-01 Remote Development Runbook

## Goal
Provide a reproducible development environment for ExhibitTix so development can move between machines without depending on one local PC.

## Codespaces
1. Open the `chore/rd-01` branch in GitHub.
2. Select **Code → Codespaces → Create codespace on chore/rd-01**.
3. Allow the devcontainer to build.
4. Copy `.env.example` to `.env` and set local development values.
5. Start PostgreSQL using the configured development service.
6. Run Prisma generation and migrations.
7. Start frontend and backend with `npm run dev:all`.

## Validation
- Frontend: `npm run build`
- Frontend lint: `npm run lint`
- Backend build: `npm --prefix server run build`
- Backend tests: `npm --prefix server test`
- Prisma client: `npm --prefix server run prisma:generate`
- Prisma migrations: `npx --prefix server prisma migrate deploy`

## Safety
- Never copy production secrets into Codespaces.
- Never point the development environment at the production database.
- Use GitHub branches for changes and review before merging to `main`.
- Payment credentials are optional for general development but required for payment-flow testing.

## CI
`.github/workflows/ci.yml` runs dependency installation, Prisma generation/migrations, linting, frontend/backend builds, and backend tests against an isolated PostgreSQL service.
