# JWT and Session Security Policy

Updated: 2026-09-24

This document records the repository-verifiable authentication lifetime policy so production configuration can be checked against a concrete security contract.

## JWT contract

The API signs access tokens with these controls:

- Algorithm: `HS256` only.
- Issuer: `JWT_ISSUER`, default `exhibittix`.
- Audience: `JWT_AUDIENCE`, default `exhibittix-app`.
- Token ID: a cryptographically generated UUID is assigned to every token as `jti`.
- Lifetime: `JWT_EXPIRES_IN`, default `8h`.
- Maximum accepted configured lifetime: `24h`.
- Lifetime values must use a numeric `s`, `m`, `h`, or `d` duration and must be greater than zero.
- `JWT_SECRET` is mandatory. The application fails startup if it is absent.

The implementation is in `server/src/lib/jwt.ts`.

## Request authentication contract

Protected API requests must provide a `Bearer` token. Verification checks the signature, algorithm, issuer, audience, expiry, and required `userId` and `jti` claims.

After JWT verification, the request must also pass the server-side authentication-session validation using the token `jti`. This allows a server-side session to invalidate an otherwise cryptographically valid token.

Suspended accounts are denied access. Invalid, expired, missing, or revoked sessions return an authentication failure rather than being treated as authenticated.

The middleware contract is implemented in `server/src/middleware/auth.ts`.

## Optional authentication

Public routes may use optional authentication. Invalid or expired optional credentials are ignored so public access is preserved. A valid token is still subject to the same JWT and server-side session validation before a user is attached to the request.

Optional authentication must never be used as the sole authorization mechanism for protected resources.

## Production configuration requirements

Before production deployment, verify the following values are explicitly controlled as deployment secrets/configuration:

1. `JWT_SECRET` is a high-entropy secret that is not committed to source control.
2. `JWT_EXPIRES_IN` is set to a deliberate lifetime no greater than `24h`; the recommended baseline is `8h` unless the deployment has a documented reason to use another value.
3. `JWT_ISSUER` and `JWT_AUDIENCE` are stable production-specific identifiers and are not changed independently across application instances.
4. Existing authentication-session storage is durable and available to every application instance so token revocation is consistent.
5. Key rotation and emergency session invalidation procedures are documented before production launch.

## Regression expectations

Changes to JWT or authentication-session handling must preserve:

- rejection of expired tokens;
- rejection of wrong issuer or audience;
- rejection of unsupported signing algorithms;
- rejection of missing `userId` or `jti` claims;
- rejection of revoked/invalid server-side sessions;
- rejection of suspended accounts;
- enforcement of the configured lifetime maximum.

Any change to these controls requires fresh CI and Browser E2E evidence on the exact PR head before merge.

## Deployment blocker boundary

Source control can verify the implementation and configuration constraints above, but it cannot verify the actual production secret values, production session-store availability, key rotation execution, or deployment behavior. Those remain deployment-level production-readiness gates and must be verified in the real environment.