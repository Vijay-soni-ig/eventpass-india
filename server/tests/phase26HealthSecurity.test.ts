import { test, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app";

const server: ReturnType<typeof app.listen> = app.listen(0);
const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("failed to bind test HTTP server");
}
const baseUrl = `http://127.0.0.1:${address.port}`;

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("liveness endpoint is dependency-free and returns JSON", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
});

test("health responses include baseline security headers", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.headers.get("x-powered-by"), null);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=()");
  assert.equal(response.headers.get("content-security-policy"), "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
});
