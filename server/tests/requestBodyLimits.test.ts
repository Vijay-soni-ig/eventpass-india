import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.CORS_ORIGINS = "https://app.example.com";

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

test("rejects JSON requests larger than the global 1 MB body limit", async () => {
  await withServer(async (baseUrl) => {
    const oversizedBody = JSON.stringify({ payload: "x".repeat(1_048_576) });
    const response = await fetch(`${baseUrl}/api/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: oversizedBody,
    });

    assert.equal(response.status, 413);
  });
});

test("keeps payment webhook bodies capped at 100 KB for signature processing", async () => {
  await withServer(async (baseUrl) => {
    const oversizedBody = "x".repeat(100 * 1024 + 1);
    const response = await fetch(`${baseUrl}/api/webhooks/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: oversizedBody,
    });

    assert.equal(response.status, 413);
  });
});
