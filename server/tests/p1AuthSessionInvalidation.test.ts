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

test("password change rolls back when session revocation fails", async () => {
  const email = "p1-session-atomic-" + ts + "@example.com";
  const tokenA = await signup("atomic");
  const login = await fetch(baseUrl + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "p1-session-atomic-login-" + ts },
    body: JSON.stringify({ email, password: "TestPassword123!" }),
  });
  assert.equal(login.status, 200);
  const tokenB = (await login.json()).token as string;
  const before = await prisma.user.findUniqueOrThrow({ where: { email } });

  const client = prisma as unknown as { $transaction: typeof prisma.$transaction };
  const originalTransaction = client.$transaction;
  let injectedFailure = false;
  try {
    client.$transaction = (async (callback: unknown, ...options: unknown[]) => {
      if (typeof callback !== "function") {
        return (originalTransaction as (...args: unknown[]) => Promise<unknown>).apply(prisma, [callback, ...options]);
      }
      return (originalTransaction as (...args: unknown[]) => Promise<unknown>).call(
        prisma,
        async (tx: unknown) => {
          const failingTransactionClient = new Proxy(tx as object, {
            get(target, property, receiver) {
              if (property === "$executeRaw") {
                return async (..._args: unknown[]) => {
                  injectedFailure = true;
                  throw new Error("simulated session revocation failure");
                };
              }
              const value = Reflect.get(target, property, receiver);
              return typeof value === "function" ? value.bind(target) : value;
            },
          });
          return (callback as (transaction: unknown) => Promise<unknown>)(failingTransactionClient);
        },
        ...options,
      );
    }) as typeof client.$transaction;

    const change = await fetch(baseUrl + "/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + tokenA },
      body: JSON.stringify({ currentPassword: "TestPassword123!", newPassword: "AtomicNewPassword456!" }),
    });
    assert.equal(change.status, 500);
  } finally {
    client.$transaction = originalTransaction;
  }

  assert.equal(injectedFailure, true, "the injected failure must occur at session revocation inside the transaction");
  const after = await prisma.user.findUniqueOrThrow({ where: { email } });
  assert.equal(after.passwordHash, before.passwordHash, "password update must roll back with session revocation");
  assert.equal((await me(tokenA)).status, 200, "the original session must remain valid after rollback");
  assert.equal((await me(tokenB)).status, 200, "other sessions must remain valid after rollback");

  const oldPasswordLogin = await fetch(baseUrl + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "p1-session-atomic-old-" + ts },
    body: JSON.stringify({ email, password: "TestPassword123!" }),
  });
  assert.equal(oldPasswordLogin.status, 200);
  const newPasswordLogin = await fetch(baseUrl + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "p1-session-atomic-new-" + ts },
    body: JSON.stringify({ email, password: "AtomicNewPassword456!" }),
  });
  assert.equal(newPasswordLogin.status, 401);
});

test("suspended user cannot reuse an existing session or mutate protected account data", async () => {
  const token = await signup("suspended");
  const email = "p1-session-suspended-" + ts + "@example.com";
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const originalName = user.fullName;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      suspended: true,
      suspendedAt: new Date(),
      suspendedReason: "P1 session invalidation regression",
    },
  });

  const existingSession = await me(token);
  assert.equal(existingSession.status, 403);
  assert.equal(existingSession.body.error, "This account has been suspended");

  const profileMutation = await fetch(baseUrl + "/api/auth/me", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify({ fullName: "Must Not Persist", phone: null }),
  });
  assert.equal(profileMutation.status, 403);
  assert.equal((await profileMutation.json()).error, "This account has been suspended");

  const login = await fetch(baseUrl + "/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Test-Rate-Limit-Key": "p1-session-suspended-login-" + ts,
    },
    body: JSON.stringify({ email, password: "TestPassword123!" }),
  });
  assert.equal(login.status, 403);
  assert.equal((await login.json()).error, "This account has been suspended");

  const persistedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(persistedUser.fullName, originalName);
});
