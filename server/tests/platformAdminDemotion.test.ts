import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
let createdUserId: string | null = null;
const email = `platform-demotion-${Date.now()}@example.com`;
const password = "StrongPassword123!";

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  if (createdUserId) {
    await prisma.authSession.deleteMany({ where: { userId: createdUserId } });
    await prisma.user.deleteMany({ where: { id: createdUserId } });
  }
  await stop();
  await prisma.$disconnect();
});

test("demoting a platform admin immediately blocks existing authenticated sessions", async () => {
  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      fullName: "Platform Admin Demotion Regression",
      userType: "visitor",
    }),
  });
  const signupBody = await signup.json();
  assert.equal(signup.status, 201, JSON.stringify(signupBody));
  createdUserId = signupBody.user.id as string;

  // Grant the role through the database to model an operator-approved admin
  // assignment. Public signup must not be used to provision platform admins.
  await prisma.user.update({
    where: { id: createdUserId },
    data: { platformRole: "super_admin" },
  });

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = await login.json();
  assert.equal(login.status, 200, JSON.stringify(loginBody));
  assert.equal(loginBody.user.platformRole, "super_admin");
  const authorization = { Authorization: `Bearer ${loginBody.token}` };

  const whileAdmin = await fetch(`${baseUrl}/api/platform/dashboard`, {
    headers: authorization,
  });
  assert.equal(whileAdmin.status, 200, await whileAdmin.text());

  await prisma.user.update({
    where: { id: createdUserId },
    data: { platformRole: null },
  });

  // The JWT has not expired and the session remains valid; authorization
  // must nevertheless use the current database role, not stale token claims.
  const afterDemotion = await fetch(`${baseUrl}/api/platform/dashboard`, {
    headers: authorization,
  });
  assert.equal(afterDemotion.status, 403, await afterDemotion.text());

  const stillAuthenticated = await fetch(`${baseUrl}/api/auth/me`, {
    headers: authorization,
  });
  assert.equal(stillAuthenticated.status, 200, await stillAuthenticated.text());
  const currentUser = await stillAuthenticated.json();
  assert.notEqual(currentUser.user.platformRole, "super_admin");
});
