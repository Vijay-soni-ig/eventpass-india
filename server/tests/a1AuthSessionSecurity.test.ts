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

async function signup(email: string) {
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "TestPassword123!",
      fullName: "A1 Auth Regression",
      userType: "visitor",
    }),
  });

  assert.equal(response.status, 201);
  const body = (await response.json()) as { token: string };
  assert.ok(body.token);
  return body.token;
}

test("logout revokes the current session token", async () => {
  const token = await signup(`a1-logout-${Date.now()}@example.com`);

  const meBefore = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(meBefore.status, 200);

  const logout = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(logout.status, 204);

  const meAfter = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(meAfter.status, 401);
});

test("logout-all revokes all active sessions for the user", async () => {
  const email = `a1-logout-all-${Date.now()}@example.com`;
  const tokenA = await signup(email);

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "TestPassword123!" }),
  });
  assert.equal(login.status, 200);
  const tokenB = ((await login.json()) as { token: string }).token;

  const logoutAll = await fetch(`${baseUrl}/api/auth/logout-all`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.equal(logoutAll.status, 204);

  const [meA, meB] = await Promise.all([
    fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    }),
    fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    }),
  ]);

  assert.equal(meA.status, 401);
  assert.equal(meB.status, 401);
});

test("password change revokes existing sessions and returns a fresh session", async () => {
  const email = `a1-password-${Date.now()}@example.com`;
  const token = await signup(email);

  const change = await fetch(`${baseUrl}/api/auth/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      currentPassword: "TestPassword123!",
      newPassword: "NewTestPassword456!",
    }),
  });
  assert.equal(change.status, 200);
  const freshToken = ((await change.json()) as { token: string }).token;
  assert.ok(freshToken);

  const oldSession = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(oldSession.status, 401);

  const freshSession = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${freshToken}` },
  });
  assert.equal(freshSession.status, 200);

  const oldPasswordLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "TestPassword123!" }),
  });
  assert.equal(oldPasswordLogin.status, 401);

  const newPasswordLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "NewTestPassword456!" }),
  });
  assert.equal(newPasswordLogin.status, 200);
});

test("authenticated profile mutation rejects malformed input", async () => {
  const token = await signup(`a1-profile-${Date.now()}@example.com`);

  const response = await fetch(`${baseUrl}/api/auth/me`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      fullName: "",
      phone: "not-a-phone",
    }),
  });

  assert.equal(response.status, 400);
});
