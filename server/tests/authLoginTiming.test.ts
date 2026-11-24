import assert from "node:assert/strict";
import { after, test } from "node:test";
import { prisma } from "../src/lib/prisma";
import { compareLoginPassword } from "../src/lib/authCredentials";
import { startTestServer } from "./helpers/testServer";

const suffix = Date.now().toString();
const email = `a1-login-timing-${suffix}@example.com`;
let baseUrl: string;
let stop: (() => Promise<void>) | undefined;

function bcryptCost(hash: string): number {
  const match = /^\$2[aby]\$(\d{2})\$/.exec(hash);
  assert.ok(match, `expected a bcrypt hash, received ${hash.slice(0, 7)}`);
  return Number(match[1]);
}

test("unknown accounts perform both supported dummy bcrypt comparisons and never authenticate", async () => {
  const comparedHashes: string[] = [];
  const result = await compareLoginPassword(
    "attacker-supplied-password",
    undefined,
    async (_password, hash) => {
      comparedHashes.push(hash);
      return true;
    },
  );

  assert.equal(result, false, "an unknown account must never authenticate");
  assert.deepEqual(comparedHashes.map(bcryptCost), [10, 12]);
});

test("cost-10 legacy accounts receive a complementary cost-12 dummy comparison", async () => {
  const storedHash = "$2b$10$test-hash-placeholder";
  const comparedHashes: string[] = [];
  const result = await compareLoginPassword(
    "candidate-password",
    storedHash,
    async (_password, hash) => {
      comparedHashes.push(hash);
      return true;
    },
  );

  assert.equal(comparedHashes[0], storedHash);
  assert.deepEqual(comparedHashes.map(bcryptCost), [10, 12]);
  assert.equal(result, true);
});

test("cost-12 accounts receive a complementary cost-10 dummy comparison", async () => {
  const storedHash = "$2b$12$test-hash-placeholder";
  const comparedHashes: string[] = [];
  const result = await compareLoginPassword(
    "candidate-password",
    storedHash,
    async (_password, hash) => {
      comparedHashes.push(hash);
      return true;
    },
  );

  assert.equal(comparedHashes[0], storedHash);
  assert.deepEqual(comparedHashes.map(bcryptCost), [12, 10]);
  assert.equal(result, true);
});

test("login keeps the same generic failure response for unknown email and wrong password", async () => {
  ({ baseUrl, stop } = await startTestServer());

  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Test-Rate-Limit-Key": `a1-login-timing-signup-${suffix}`,
    },
    body: JSON.stringify({
      email,
      password: "TestPassword123!",
      fullName: "A1 Login Timing",
      userType: "visitor",
    }),
  });
  assert.equal(signup.status, 201);

  const [wrongPassword, unknownEmail] = await Promise.all([
    fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Test-Rate-Limit-Key": `a1-login-timing-wrong-${suffix}`,
      },
      body: JSON.stringify({ email, password: "WrongPassword123!" }),
    }),
    fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Test-Rate-Limit-Key": `a1-login-timing-missing-${suffix}`,
      },
      body: JSON.stringify({ email: `missing-${suffix}@example.com`, password: "WrongPassword123!" }),
    }),
  ]);

  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.deepEqual(await wrongPassword.json(), { error: "Invalid email or password" });
  assert.deepEqual(await unknownEmail.json(), { error: "Invalid email or password" });
});

after(async () => {
  if (stop) await stop();
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});
