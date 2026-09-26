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

test("anonymous discovery interactions accept search events without a fake event id", async () => {
  const response = await fetch(`${baseUrl}/api/personalization/interactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "SEARCH",
      sessionId: `phase2-${Date.now()}-search`,
      metadata: { query: "jewellery", source: "homepage" },
    }),
  });

  assert.equal(response.status, 204);
});

test("event-bound personalization interactions reject unpublished or unknown events", async () => {
  const response = await fetch(`${baseUrl}/api/personalization/interactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventId: "00000000-0000-0000-0000-000000000000",
      type: "VIEW",
      sessionId: `phase2-${Date.now()}-view`,
    }),
  });

  assert.equal(response.status, 404);
});

test("visitor preferences require authentication", async () => {
  const response = await fetch(`${baseUrl}/api/personalization/preferences`);
  assert.equal(response.status, 401);
});

test("recommendation analytics is platform-admin protected", async () => {
  const response = await fetch(`${baseUrl}/api/personalization/analytics`);
  assert.equal(response.status, 401);
});
