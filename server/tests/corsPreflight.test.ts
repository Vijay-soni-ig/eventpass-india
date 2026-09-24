import test from "node:test";
import assert from "node:assert/strict";

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

test("honors the explicit CORS allowlist for preflight requests", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/payments`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://admin.example.com",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Authorization, Content-Type, Idempotency-Key",
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://admin.example.com");
    assert.match(response.headers.get("access-control-allow-methods") ?? "", /POST/);
    assert.match(response.headers.get("access-control-allow-headers") ?? "", /Authorization/);
    assert.match(response.headers.get("access-control-allow-headers") ?? "", /Idempotency-Key/);
  });
});
