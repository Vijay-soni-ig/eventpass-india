import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { signToken } from "../src/lib/jwt";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await stop();
});

test("API responses include production security headers", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=()");
  assert.equal(
    response.headers.get("content-security-policy"),
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
  );
});

test("configured CORS allowlist permits only listed browser origins", async () => {
  const previous = process.env.CORS_ORIGINS;
  process.env.CORS_ORIGINS = "https://app.exhibittix.test, https://www.exhibittix.test";

  try {
    const allowed = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: "https://app.exhibittix.test" },
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("access-control-allow-origin"), "https://app.exhibittix.test");

    const blocked = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: "https://attacker.example" },
    });
    assert.equal(blocked.status, 200);
    assert.equal(blocked.headers.get("access-control-allow-origin"), null);
  } finally {
    if (previous === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = previous;
  }
});

test("JWT lifetime is bounded by the configured production policy", () => {
  const token = signToken({ userId: "pr01-security-test-user" });
  const decoded = jwt.decode(token);
  assert.ok(decoded && typeof decoded === "object");
  assert.equal(typeof decoded.iat, "number");
  assert.equal(typeof decoded.exp, "number");

  const lifetimeSeconds = decoded.exp! - decoded.iat!;
  assert.ok(lifetimeSeconds > 0, "JWT must have a positive lifetime");
  assert.ok(lifetimeSeconds <= 24 * 60 * 60, "default JWT lifetime must not exceed 24 hours");
});

test("oversized JSON bodies are rejected without exposing internals", async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "a@b.com", password: "x".repeat(1_100_000) }),
  });
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: "Invalid request" });
});
