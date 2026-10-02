// How many sign-in / sign-up attempts one IP may make per 15 minutes.
//
// The default (20) is a security control and is what production always uses. The CI browser
// E2E job drives every spec from a single IP, so it can raise the cap with
// AUTH_RATE_LIMIT_MAX. That override can only ever RAISE the limit (never below the default),
// is capped, and is ignored entirely when NODE_ENV=production, so a stray value in a real
// deployment cannot weaken brute-force protection.
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
