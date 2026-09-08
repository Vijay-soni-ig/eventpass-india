import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await stop();
});

test("exhibitor document files are not publicly served from /uploads", async () => {
  const response = await fetch(`${baseUrl}/uploads/exhibitor-documents/nonexistent.pdf`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Not found" });
});

test("document download endpoint requires authentication", async () => {
  const response = await fetch(`${baseUrl}/api/documents/00000000-0000-0000-0000-000000000000/download`);
  assert.equal(response.status, 401);
});
