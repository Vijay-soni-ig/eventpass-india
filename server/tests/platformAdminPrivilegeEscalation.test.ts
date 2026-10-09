import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const email = `platform-escalation-${Date.now()}@example.com`;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await stop();
  await prisma.$disconnect();
});

test("public signup cannot grant platform-admin privileges through extra fields", async () => {
  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "StrongPassword123!",
      fullName: "Privilege Escalation Regression",
      userType: "visitor",
      platformRole: "super_admin",
      roles: { platformAdmin: true },
    }),
  });

  const body = await signup.json();
  assert.equal(signup.status, 201, JSON.stringify(body));
  assert.ok(body.token, "signup should issue a normal authenticated session");
  assert.notEqual(body.user.platformRole, "super_admin");

  const persistedUser = await prisma.user.findUniqueOrThrow({ where: { email } });
  assert.notEqual(
    persistedUser.platformRole,
    "super_admin",
    "untrusted signup fields must never assign a platform role in the database",
  );

  const protectedResponse = await fetch(`${baseUrl}/api/platform/dashboard`, {
    headers: { Authorization: `Bearer ${body.token}` },
  });
  assert.equal(
    protectedResponse.status,
    403,
    "a newly registered visitor must not access platform APIs even when signup includes forged admin fields",
  );
});
