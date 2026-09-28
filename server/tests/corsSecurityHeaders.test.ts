import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "production";
process.env.CORS_ORIGINS = "https://app.example.com, https://admin.example.com";
process.env.STORAGE_PROVIDER = "s3";
process.env.STORAGE_S3_REGION = "ap-south-1";
process.env.STORAGE_S3_BUCKET = "test-bucket";
process.env.STORAGE_S3_ACCESS_KEY_ID = "test-access-key";
process.env.STORAGE_S3_SECRET_ACCESS_KEY = "test-secret-key";

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

    const preflight = await fetch(`${baseUrl}/api/events`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://app.example.com",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Authorization, Content-Type",
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "https://app.example.com");
    assert.match(preflight.headers.get("access-control-allow-methods") ?? "", /POST/);

    const rejectedPreflight = await fetch(`${baseUrl}/api/events`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example.com",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Authorization, Content-Type",
      },
    });
    assert.equal(rejectedPreflight.status, 500);
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
    assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains");
  });
});
