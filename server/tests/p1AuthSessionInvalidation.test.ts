import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => { ({ baseUrl, stop } = await startTestServer()); });
after(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: "p1-session-" } } });
  await stop();
  await prisma.$disconnect();
});

async function signup(label: string) {
  const response = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "p1-session-" + label + "-" + ts },
    body: JSON.stringify({
      email: "p1-session-" + label + "-" + ts + "@example.com",
      password: "TestPassword123!",
      fullName: "P1 Session " + label,
      userType: "visitor",
    }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).token as string;
}

async function me(token: string) {
  const response = await fetch(baseUrl + "/api/auth/me", {
    headers: { Authorization: "Bearer " + token },
  });
  return { status: response.status, body: await response.json() };
}

test("logout revokes only the current session", async () => {
  const tokenA = await signup("logout-a");
  const tokenB = await signup("logout-b");

  const logout = await fetch(baseUrl + "/api/auth/logout", {
    method: "POST",
    headers: { Authorization: "Bearer " + tokenA },
  });
  assert.equal(logout.status, 204);

  assert.equal((await me(tokenA)).status, 401);
  assert.equal((await me(tokenB)).status, 200);
});

test("logout-all revokes every active session", async () => {
  const email = "p1-session-all-" + ts + "@example.com";
  const signupResponse = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "p1-session-all-" + ts },
    body: JSON.stringify({
      email,
      password: "TestPassword123!",
      fullName: "P1 Logout All",
      userType: "visitor",
    }),
  });
  assert.equal(signupResponse.status, 201);
  const tokenA = (await signupResponse.json()).token as string;

  const login = await fetch(baseUrl + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "p1-session-login-" + ts },
    body: JSON.stringify({ email, password: "TestPassword123!" }),
  });
  assert.equal(login.status, 200);
  const tokenB = (await login.json()).token as string;

  const logoutAll = await fetch(baseUrl + "/api/auth/logout-all", {
    method: "POST",
    headers: { Authorization: "Bearer " + tokenA },
  });
  assert.equal(logoutAll.status, 204);

  assert.equal((await me(tokenA)).status, 401);
  assert.equal((await me(tokenB)).status, 401);
});

test("password change revokes old sessions and returns a usable fresh session", async () => {
  const email = "p1-session-password-" + ts + "@example.com";
  const tokenA = await signup("password-a");

  const login = await fetch(baseUrl + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "p1-session-password-login-" + ts },
    body: JSON.stringify({ email: "p1-session-password-a-" + ts + "@example.com", password: "TestPassword123!" }),
  });
  assert.equal(login.status, 200);
  const tokenB = (await login.json()).token as string;

  const change = await fetch(baseUrl + "/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + tokenA },
    body: JSON.stringify({ currentPassword: "TestPassword123!", newPassword: "NewPassword123!" }),
  });
  assert.equal(change.status, 200);
  const freshToken = (await change.json()).token as string;

  assert.equal((await me(tokenA)).status, 401);
  assert.equal((await me(tokenB)).status, 401);
  assert.equal((await me(freshToken)).status, 200);

  const relogin = await fetch(baseUrl + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "p1-session-password-relogin-" + ts },
    body: JSON.stringify({ email: "p1-session-password-a-" + ts + "@example.com", password: "NewPassword123!" }),
  });
  assert.equal(relogin.status, 200);
});
