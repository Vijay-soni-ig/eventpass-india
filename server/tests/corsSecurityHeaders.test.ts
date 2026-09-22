import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.CORS_ORIGINS = "https://app.example.com, https://admin.example.com";

import { app } from "../src/app";

async function withServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = app.listen(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test("allows configured CORS origins and rejects unlisted origins", async () => {
  await withServer(async (baseUrl) => {
    const allowed = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: "https://app.example.com" },
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("access-control-allow-origin"), "https://app.example.com");

    const rejected = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: "https://evil.example.com" },
    });
    assert.equal(rejected.status, 200);
    assert.equal(rejected.headers.get("access-control-allow-origin"), null);
  });
});

test("emits production security headers without exposing server identity", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-powered-by"), null);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=()");
    assert.equal(response.headers.get("content-security-policy"), "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  });
});
