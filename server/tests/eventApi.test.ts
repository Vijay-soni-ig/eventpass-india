import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});
after(async () => {
  await stop();
});

async function signup(label: string, userType: "exhibitor" | "visitor" = "exhibitor") {
  const email = `evtapi-${label}-${ts}@example.com`;
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `event-api-${label}` },
    body: JSON.stringify({ email, password: "TestPassword123!", fullName: `EvtApi ${label}`, userType }),
  }).then((r) => r.json());
  return { token: res.token as string, userId: res.user.id as string };
}

