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

const OLD_PASSWORD = "OldPassword123!";
const NEW_PASSWORD = "BrandNewPass456$";

// Each request gets its own rate-limit key so these tests never trip the
// shared 20-per-window auth limiter.
function headers(token?: string, key = `acct-${Date.now()}-${Math.random()}`) {
  return {
    "Content-Type": "application/json",
    "X-Test-Rate-Limit-Key": key,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function signup() {
  const email = `acct-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email, password: OLD_PASSWORD, fullName: "Account Tester", userType: "visitor" }),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { token: string };
  return { email, token: body.token };
}

async function login(email: string, password: string) {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email, password }),
  });
}

function patchMe(token: string | undefined, body: unknown) {
  return fetch(`${baseUrl}/api/auth/me`, { method: "PATCH", headers: headers(token), body: JSON.stringify(body) });
}

function changePassword(token: string | undefined, body: unknown) {
  return fetch(`${baseUrl}/api/auth/change-password`, { method: "POST", headers: headers(token), body: JSON.stringify(body) });
}

test("PATCH /api/auth/me requires authentication", async () => {
  const res = await patchMe(undefined, { fullName: "Nobody", phone: "" });
  assert.equal(res.status, 401);
});

test("PATCH /api/auth/me updates name and phone, and clears an empty phone", async () => {
  const { token } = await signup();

  const res = await patchMe(token, { fullName: "  Renamed User  ", phone: "+91 98765 43210" });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { user: { fullName: string; phone: string | null } };
  assert.equal(body.user.fullName, "Renamed User");
  assert.equal(body.user.phone, "+91 98765 43210");

  const cleared = await patchMe(token, { fullName: "Renamed User", phone: "" });
  assert.equal(cleared.status, 200);
  assert.equal(((await cleared.json()) as { user: { phone: string | null } }).user.phone, null);
});

test("PATCH /api/auth/me rejects an empty name and a malformed phone", async () => {
  const { token } = await signup();
  assert.equal((await patchMe(token, { fullName: "   ", phone: "" })).status, 400);
  assert.equal((await patchMe(token, { fullName: "Valid", phone: "call me maybe" })).status, 400);
});

test("PATCH /api/auth/me ignores attempts to change privileged fields", async () => {
  const { email, token } = await signup();
  const res = await patchMe(token, { fullName: "Valid", phone: "", email: "hijack@example.com", userType: "organizer", platformRole: "super_admin" });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { user: { email: string; userType: string; roles: { platformAdmin: boolean } } };
  assert.equal(body.user.email, email);
  assert.equal(body.user.userType, "visitor");
  assert.equal(body.user.roles.platformAdmin, false);
});

test("POST /api/auth/change-password requires authentication", async () => {
  const res = await changePassword(undefined, { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD });
  assert.equal(res.status, 401);
});

test("change-password rejects a wrong current password and leaves the password unchanged", async () => {
  const { email, token } = await signup();
  const res = await changePassword(token, { currentPassword: "WrongPassword999!", newPassword: NEW_PASSWORD });
  assert.equal(res.status, 400);
  assert.equal((await login(email, OLD_PASSWORD)).status, 200);
});

test("change-password rejects a weak new password and an unchanged password", async () => {
  const { token } = await signup();
  assert.equal((await changePassword(token, { currentPassword: OLD_PASSWORD, newPassword: "short" })).status, 400);
  assert.equal((await changePassword(token, { currentPassword: OLD_PASSWORD, newPassword: "alllowercase1234!" })).status, 400);
  assert.equal((await changePassword(token, { currentPassword: OLD_PASSWORD, newPassword: OLD_PASSWORD })).status, 400);
});

test("change-password swaps the password, revokes old sessions and returns a working new token", async () => {
  const { email, token: oldToken } = await signup();

  const res = await changePassword(oldToken, { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD });
  assert.equal(res.status, 200);
  const { token: newToken } = (await res.json()) as { token: string };
  assert.ok(newToken);
  assert.notEqual(newToken, oldToken);

  const oldMe = await fetch(`${baseUrl}/api/auth/me`, { headers: headers(oldToken) });
  assert.equal(oldMe.status, 401);
  const newMe = await fetch(`${baseUrl}/api/auth/me`, { headers: headers(newToken) });
  assert.equal(newMe.status, 200);

  assert.equal((await login(email, OLD_PASSWORD)).status, 401);
  assert.equal((await login(email, NEW_PASSWORD)).status, 200);
});

test("change-password limits failed attempts per user without touching login", async () => {
  const { email, token } = await signup();
  for (let i = 0; i < 5; i += 1) {
    assert.equal((await changePassword(token, { currentPassword: "WrongPassword999!", newPassword: NEW_PASSWORD })).status, 400);
  }
  assert.equal((await changePassword(token, { currentPassword: "WrongPassword999!", newPassword: NEW_PASSWORD })).status, 429);
  // Even the correct password is held back until the window resets...
  assert.equal((await changePassword(token, { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD })).status, 429);
  // ...but logging in is unaffected.
  assert.equal((await login(email, OLD_PASSWORD)).status, 200);
});
