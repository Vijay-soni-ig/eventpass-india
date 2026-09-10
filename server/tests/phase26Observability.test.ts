import { test, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app";

const server = app.listen(0);
const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("failed to bind test HTTP server");
}
const baseUrl = `http://127.0.0.1:${address.port}`;

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("responses include a unique request correlation ID", async () => {
  const first = await fetch(`${baseUrl}/api/health`);
  const second = await fetch(`${baseUrl}/api/health`);

  const firstId = first.headers.get("x-request-id");
  const secondId = second.headers.get("x-request-id");

  assert.ok(firstId);
  assert.ok(secondId);
  assert.match(firstId, /^[0-9a-f-]{36}$/);
  assert.match(secondId, /^[0-9a-f-]{36}$/);
  assert.notEqual(firstId, secondId);
});
