import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";

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

test("public storage reads are rate limited without changing 404 behavior", async () => {
  await withServer(async (baseUrl) => {
    const responses = await Promise.all(
      Array.from({ length: 601 }, () => fetch(`${baseUrl}/api/storage/public/public/nonexistent.png`)),
    );

    assert.equal(responses.filter((response) => response.status === 429).length, 1);
    assert.equal(responses.filter((response) => response.status === 404).length, 600);
  });
});
