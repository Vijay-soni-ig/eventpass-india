// How many sign-in / sign-up attempts one IP may make per 15 minutes.
//
// The default (20) is a security control and is what production always uses. Browser E2E
// drives many specs from one IP and raises its non-production cap with AUTH_RATE_LIMIT_MAX.
// Backend integration tests that need many signup fixtures should use the test-only
// X-Test-Rate-Limit-Key to isolate fixture buckets without changing the shared default.
// AUTH_RATE_LIMIT_MAX can only RAISE the limit (never below the default), is capped, and is
// ignored entirely when NODE_ENV=production, so a stray value cannot weaken production protection.
export const DEFAULT_AUTH_ATTEMPT_LIMIT = 20;
export const MAX_AUTH_ATTEMPT_LIMIT_OVERRIDE = 10_000;

export function resolveAuthAttemptLimit(env: Record<string, string | undefined> = process.env): number {
  if (env.NODE_ENV === "production") return DEFAULT_AUTH_ATTEMPT_LIMIT;
  const raw = env.AUTH_RATE_LIMIT_MAX?.trim();
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_AUTH_ATTEMPT_LIMIT;
  const requested = Number(raw);
  if (requested < DEFAULT_AUTH_ATTEMPT_LIMIT) return DEFAULT_AUTH_ATTEMPT_LIMIT;
  return Math.min(requested, MAX_AUTH_ATTEMPT_LIMIT_OVERRIDE);
}
