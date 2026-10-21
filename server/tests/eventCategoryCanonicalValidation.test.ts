import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { slugifyCategoryName } from "../src/lib/eventMapping";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const categoryIds: string[] = [];
const createdEventTitles: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  if (createdEventTitles.length) {
    const events = await prisma.event.findMany({
      where: { title: { in: createdEventTitles } },
      select: { id: true },
    });
    if (events.length) {
      await prisma.eventModuleEnablement.deleteMany({ where: { eventId: { in: events.map((event) => event.id) } } });
      await prisma.event.deleteMany({ where: { id: { in: events.map((event) => event.id) } } });
    }
  }
  if (categoryIds.length) {
    await prisma.eventCategory.deleteMany({ where: { id: { in: categoryIds } } });
  }
  await stop();
});

async function signupAndBootstrapOrganizer() {
  const signupResponse = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `event-category-validation-${ts}` },
    body: JSON.stringify({
      email: `event-category-validation-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: "Event Category Validation",
      userType: "exhibitor",
    }),
  });
  assert.equal(signupResponse.status, 201);
  const signup = await signupResponse.json() as { token: string };

  const bootstrapResponse = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${signup.token}` },
    body: JSON.stringify({
      name: `Event Category Bootstrap ${ts}`,
      status: "draft",
      visibility: "public",
      ticketTypes: [],
      stalls: [],
    }),
  });
  assert.equal(bootstrapResponse.status, 201);
  return signup.token;
}

async function createCategory(name: string, active: boolean) {
  const category = await prisma.eventCategory.create({
    data: { name, slug: slugifyCategoryName(name), active, sortOrder: 0 },
  });
  categoryIds.push(category.id);
  return category;
}

test("standalone Event category validation rejects inactive IDs and arbitrary names, but accepts active canonical IDs", async () => {
  const token = await signupAndBootstrapOrganizer();
  const inactive = await createCategory(`Inactive Category ${ts}`, false);
  const active = await createCategory(`Active Category ${ts}`, true);

  const postEvent = async (title: string, extra: Record<string, unknown>) => {
    createdEventTitles.push(title);
    return fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        eventType: "CONFERENCE",
        title,
        status: "DRAFT",
        visibility: "private",
        ...extra,
      }),
    });
  };

  const inactiveIdResponse = await postEvent(`Rejected Inactive Category ${ts}`, { categoryId: inactive.id });
  assert.equal(inactiveIdResponse.status, 400);
  assert.match((await inactiveIdResponse.json()).error, /active Event Category/);

  const arbitraryNameResponse = await postEvent(`Rejected Arbitrary Category ${ts}`, { category: `Not Registered ${ts}` });
  assert.equal(arbitraryNameResponse.status, 400);
  assert.match((await arbitraryNameResponse.json()).error, /existing active Event Category/);

  const [inactivePersisted, arbitraryPersisted] = await Promise.all([
    prisma.event.findFirst({ where: { title: `Rejected Inactive Category ${ts}` } }),
    prisma.event.findFirst({ where: { title: `Rejected Arbitrary Category ${ts}` } }),
  ]);
  assert.equal(inactivePersisted, null, "inactive category ID must not persist an Event");
  assert.equal(arbitraryPersisted, null, "arbitrary category text must not persist an Event");

  const validTitle = `Accepted Canonical Category ${ts}`;
  const validResponse = await postEvent(validTitle, { categoryId: active.id });
  assert.equal(validResponse.status, 201);
  const validBody = await validResponse.json() as { event: { id: string; categoryId: string | null } };
  assert.equal(validBody.event.categoryId, active.id);

  const persisted = await prisma.event.findUniqueOrThrow({ where: { id: validBody.event.id } });
  assert.equal(persisted.categoryId, active.id);
});
