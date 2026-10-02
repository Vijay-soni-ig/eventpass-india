import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { DEFAULT_AUTH_ATTEMPT_LIMIT, MAX_AUTH_ATTEMPT_LIMIT_OVERRIDE, resolveAuthAttemptLimit } from "../src/lib/authRateLimitConfig";

test("the sign-in limit defaults to 20 attempts", () => {
  assert.equal(DEFAULT_AUTH_ATTEMPT_LIMIT, 20);
  assert.equal(resolveAuthAttemptLimit({}), 20);
  assert.equal(resolveAuthAttemptLimit({ NODE_ENV: "test" }), 20);
  assert.equal(resolveAuthAttemptLimit({ AUTH_RATE_LIMIT_MAX: "" }), 20);
  assert.equal(resolveAuthAttemptLimit({ AUTH_RATE_LIMIT_MAX: "   " }), 20);
});

test("a non-production environment can raise the limit", () => {
  assert.equal(resolveAuthAttemptLimit({ AUTH_RATE_LIMIT_MAX: "200" }), 200);
  assert.equal(resolveAuthAttemptLimit({ AUTH_RATE_LIMIT_MAX: " 500 " }), 500);
  assert.equal(resolveAuthAttemptLimit({ NODE_ENV: "development", AUTH_RATE_LIMIT_MAX: "100" }), 100);
  assert.equal(resolveAuthAttemptLimit({ AUTH_RATE_LIMIT_MAX: "20" }), 20);
});

test("the override can never lower the limit or exceed the cap", () => {
  assert.equal(resolveAuthAttemptLimit({ AUTH_RATE_LIMIT_MAX: "5" }), 20);
  assert.equal(resolveAuthAttemptLimit({ AUTH_RATE_LIMIT_MAX: "0" }), 20);
  assert.equal(resolveAuthAttemptLimit({ AUTH_RATE_LIMIT_MAX: "99999999" }), MAX_AUTH_ATTEMPT_LIMIT_OVERRIDE);
});

test("junk values are ignored rather than half-parsed", () => {
  for (const value of ["abc", "-50", "1e9", "200abc", "20.5", "NaN", "Infinity", "0x100"]) {
    assert.equal(resolveAuthAttemptLimit({ AUTH_RATE_LIMIT_MAX: value }), 20, value);
  }
});

test("production ignores the override completely", () => {
  assert.equal(resolveAuthAttemptLimit({ NODE_ENV: "production", AUTH_RATE_LIMIT_MAX: "5000" }), 20);
  assert.equal(resolveAuthAttemptLimit({ NODE_ENV: "production", AUTH_RATE_LIMIT_MAX: "200" }), 20);
});

test("the login and signup limiter really uses it", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "src", "routes", "auth.ts"), "utf8");
  assert.match(source, /limit:\s*resolveAuthAttemptLimit\(\)/);
  assert.doesNotMatch(source, /const authRateLimit = rateLimit\(\{[^}]*limit:\s*20,/s, "no hard-coded 20 left behind");
});
