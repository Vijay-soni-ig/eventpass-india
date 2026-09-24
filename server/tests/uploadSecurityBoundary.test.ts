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

test("does not expose exhibitor documents through the public uploads path", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/uploads/exhibitor-documents/test.pdf`);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("content-type")?.startsWith("application/json"), true);
  });
});

test("keeps upload boundary inaccessible even when a path resembles a stored document", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/uploads/exhibitor-documents/../../server/src/app.ts`);
    assert.notEqual(response.status, 200);
  });
});
