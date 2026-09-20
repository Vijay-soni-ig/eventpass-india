import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const createdUserIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await stop();
});

async function signup(label: string) {
  const email = `evtcat-read-${label}-${ts}@example.com`;
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `event-cat-read-${label}` },
    body: JSON.stringify({
      email,
      password: "TestPassword123!",
      fullName: `Event Category Read ${label}`,
      userType: "visitor",
    }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  createdUserIds.push(body.user.id);
  return { token: body.token as string, userId: body.user.id as string };
}

async function bootstrapOrganizer(label: string) {
  const account = await signup(label);
  const res = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${account.token}` },
    body: JSON.stringify({
      name: `Event Category Read Bootstrap ${label} ${ts}`,
      status: "draft",
      visibility: "public",
      ticketTypes: [],
      stalls: [],
    }),
  });
  assert.equal(res.status, 201);
  return account;
}

async function createAdminCategory(adminToken: string, name: string, active = true) {
  const res = await fetch(`${baseUrl}/api/platform/event-categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ name, active, sortOrder: 10 }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  return body.category as { id: string; name: string; active: boolean };
}

test("Organizer category read endpoint requires auth and organizer access", async () => {
  const unauthenticated = await fetch(`${baseUrl}/api/event-categories`);
  assert.equal(unauthenticated.status, 401);

  const nonOrganizer = await signup("non-organizer");
  const forbidden = await fetch(`${baseUrl}/api/event-categories`, {
    headers: { Authorization: `Bearer ${nonOrganizer.token}` },
  });
  assert.equal(forbidden.status, 403);
});

test("Organizer category read returns active categories in deterministic order", async () => {
  const admin = await signup("admin");
  await prisma.user.update({ where: { id: admin.userId }, data: { platformRole: "super_admin" } });

  const beta = await createAdminCategory(admin.token, `Read Beta ${ts}`);
  const alpha = await createAdminCategory(admin.token, `Read Alpha ${ts}`);
  const archived = await createAdminCategory(admin.token, `Read Archived ${ts}`, false);

  const organizer = await bootstrapOrganizer("organizer");
  const res = await fetch(`${baseUrl}/api/event-categories`, {
    headers: { Authorization: `Bearer ${organizer.token}` },
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.categories));
  const returnedIds = body.categories.map((category: { id: string }) => category.id);

  assert.ok(returnedIds.includes(alpha.id));
  assert.ok(returnedIds.includes(beta.id));
  assert.equal(returnedIds.includes(archived.id), false);

  // The endpoint returns the complete active catalog, which may include seeded
  // categories. Verify deterministic name ordering specifically within the
  // same-sortOrder categories created by this test.
  const controlledNames = body.categories
    .filter((category: { id: string }) => category.id === alpha.id || category.id === beta.id)
    .map((category: { name: string }) => category.name);
  assert.deepEqual(
    controlledNames,
    [alpha.name, beta.name].sort((a, b) => a.localeCompare(b)),
    "same sortOrder must fall back to name ascending",
  );
});

test("Organizer category read can explicitly include archived categories", async () => {
  const admin = await signup("admin-all");
  await prisma.user.update({ where: { id: admin.userId }, data: { platformRole: "super_admin" } });

  const archived = await createAdminCategory(admin.token, `Read Archived Explicit ${ts}`, false);
  const organizer = await bootstrapOrganizer("organizer-all");

  const res = await fetch(`${baseUrl}/api/event-categories?active=false`, {
    headers: { Authorization: `Bearer ${organizer.token}` },
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.categories.some((category: { id: string; active: boolean }) => category.id === archived.id && category.active === false));
});
