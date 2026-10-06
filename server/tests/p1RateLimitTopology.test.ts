import assert from "node:assert/strict";
import { test } from "node:test";
import { assertRateLimitTopology } from "../src/lib/rateLimitTopology";

test("production requires an explicit single-instance rate-limit topology", () => {
  assert.equal(
    assertRateLimitTopology({ NODE_ENV: "production", RATE_LIMIT_TOPOLOGY: "single-instance" }),
    "single-instance",
  );
});

test("development defaults to single-instance", () => {
  assert.equal(assertRateLimitTopology({ NODE_ENV: "test" }), "single-instance");
});

test("production without topology configuration fails closed", () => {
  assert.throws(
    () => assertRateLimitTopology({ NODE_ENV: "production" }),
    /RATE_LIMIT_TOPOLOGY must be explicitly set to single-instance/,
  );
});

test("shared-store mode is rejected until a shared store is implemented", () => {
  assert.throws(
    () => assertRateLimitTopology({ NODE_ENV: "production", RATE_LIMIT_TOPOLOGY: "shared-store" }),
    /shared-store is not implemented yet/,
  );
});

test("invalid topology values fail closed", () => {
  assert.throws(
    () => assertRateLimitTopology({ NODE_ENV: "production", RATE_LIMIT_TOPOLOGY: "multi-instance" }),
    /RATE_LIMIT_TOPOLOGY must be explicitly set to single-instance/,
  );
});
