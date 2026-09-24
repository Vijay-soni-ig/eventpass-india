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

test("login rate limit blocks repeated authentication attempts", async () => {
  const key = `a1-auth-${Date.now()}`;
  const responses: Response[] = [];

  for (let attempt = 0; attempt < 20; attempt += 1) {
    responses.push(
      await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Test-Rate-Limit-Key": key,
        },
        body: JSON.stringify({
          email: `missing-${attempt}-${key}@example.com`,
          password: "WrongPassword123!",
        }),
      }),
    );
  }

  assert.ok(responses.every((response) => response.status === 401));

  const blocked = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Test-Rate-Limit-Key": key,
    },
    body: JSON.stringify({
      email: `blocked-${key}@example.com`,
      password: "WrongPassword123!",
    }),
  });

  assert.equal(blocked.status, 429);
});
