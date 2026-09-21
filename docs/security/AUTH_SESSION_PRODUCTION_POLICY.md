# Authentication and Session Production Policy

## Verified implementation

ExhibitTix authenticates API requests with signed JWT bearer tokens backed by server-side auth-session records.

The current implementation:

- signs tokens with HS256;
- requires `JWT_SECRET` at process startup;
- validates issuer and audience on verification;
- requires both `userId` and `jti` claims;
- assigns a random UUID as the JWT ID (`jti`);
- defaults token lifetime to `8h` when `JWT_EXPIRES_IN` is not supplied;
- persists issued sessions so individual sessions can be revoked;
- supports logout and logout-all session revocation;
- periodically prunes expired auth-session records.

Source of truth: `server/src/lib/jwt.ts` and `server/src/routes/auth.ts`.

## Production requirements

The following must be explicit in every production deployment:

1. `JWT_SECRET` must be a high-entropy secret supplied through the deployment secret manager. It must never be committed to Git or printed in logs.
2. `JWT_ISSUER` and `JWT_AUDIENCE` should be explicitly configured for the production application rather than relying on development defaults.
3. `JWT_EXPIRES_IN` should remain short-lived. The repository default is `8h`; production operators should not increase it to multi-day or long-lived values without a security review.
4. Authentication endpoints must remain protected by the existing rate limit.
5. Logout and logout-all must remain available so compromised sessions can be revoked server-side.
6. Production deployments must use HTTPS and must not expose bearer tokens through URLs, logs, analytics payloads, or error messages.

## Verification checklist

Before production launch, verify in the real deployment environment:

- [ ] `JWT_SECRET` is present in the secret manager and is not present in repository files or build artifacts.
- [ ] `JWT_ISSUER` is set to the production issuer.
- [ ] `JWT_AUDIENCE` is set to the production audience.
- [ ] `JWT_EXPIRES_IN` is configured to a reviewed short-lived value.
- [ ] Login and signup create server-side auth-session records.
- [ ] Logout revokes the presented session.
- [ ] Logout-all revokes all sessions for the user.
- [ ] Expired/revoked sessions are rejected by authentication middleware.
- [ ] Authentication rate limiting is active in production.
- [ ] No authentication secret or bearer token is emitted by application logging.

## Current production-readiness status

Repository-level authentication/session controls are implemented and testable. Credential provisioning, secret-manager configuration, HTTPS, and credentialed verification in the real production environment remain external deployment responsibilities and are not claimed by this document.
