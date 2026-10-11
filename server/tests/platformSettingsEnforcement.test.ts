import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
let adminToken: string;
const createdEmails: string[] = [];
const suffix = Date.now();

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
  await prisma.platformSettings.upsert({
    where: { id: "singleton" },
    update: { allowOrganizerRegistration: true, allowExhibitionCreation: true },
    create: { id: "singleton", allowOrganizerRegistration: true, allowExhibitionCreation: true },
  });

  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "platform-policy-admin-login" },
    body: JSON.stringify({ email: "platform.admin@eventpass.test", password: "DevPassword123!" }),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  adminToken = body.token as string;
});

after(async () => {
  await prisma.platformSettings.upsert({
    where: { id: "singleton" },
    update: { allowOrganizerRegistration: true, allowExhibitionCreation: true },
    create: { id: "singleton", allowOrganizerRegistration: true, allowExhibitionCreation: true },
  });
  if (createdEmails.length) {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  }
  await stop();
  await prisma.$disconnect();
});

async function updatePlatformSettings(data: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/api/platform/settings`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(data),
  });
  return { status: response.status, body: await response.json() };
}

async function signup(label: string, userType: "visitor" | "exhibitor" | "organizer") {
  const email = `platform-policy-${label}-${suffix}@example.com`;
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Test-Rate-Limit-Key": `platform-policy-signup-${label}`,
    },
    body: JSON.stringify({
      email,
      password: "TestPassword123!",
      fullName: `Platform Policy ${label}`,
      userType,
    }),
  });
  const body = await response.json();
  if (response.status === 201) createdEmails.push(email);
  return { status: response.status, body, email };
}

test("disabling organizer registration rejects new organizer signups but keeps visitor signup available", async () => {
  const updated = await updatePlatformSettings({ allowOrganizerRegistration: false });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));

  const organizer = await signup("blocked-organizer", "organizer");
  assert.equal(organizer.status, 403, JSON.stringify(organizer.body));
  assert.match(organizer.body.error, /organizer registrations are temporarily disabled/i);
  assert.equal(await prisma.user.findUnique({ where: { email: organizer.email } }), null, "blocked signup must not create a user");

  const visitor = await signup("allowed-visitor", "visitor");
  assert.equal(visitor.status, 201, JSON.stringify(visitor.body));
  assert.ok(visitor.body.user?.id, "visitor signup must remain available");
});

test("disabling exhibition creation blocks API creation before organizer bootstrap or database writes", async () => {
  const account = await signup("exhibitor", "exhibitor");
  assert.equal(account.status, 201, JSON.stringify(account.body));
  const userId = account.body.user.id as string;
  const token = account.body.token as string;

  const updated = await updatePlatformSettings({ allowExhibitionCreation: false });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));

  const response = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: `Blocked Exhibition ${suffix}`,
      status: "draft",
      visibility: "public",
      ticketTypes: [],
      stalls: [],
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 403, JSON.stringify(body));
  assert.match(body.error, /exhibition creation is temporarily disabled/i);
  assert.equal(await prisma.exhibition.count({ where: { name: `Blocked Exhibition ${suffix}` } }), 0);
  assert.equal(await prisma.organizer.findUnique({ where: { bootstrappedByUserId: userId } }), null, "blocked creation must not bootstrap an organizer");
});
