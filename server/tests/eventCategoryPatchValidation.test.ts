import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { slugifyCategoryName } from "../src/lib/eventMapping";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const categoryIds: string[] = [];
const eventTitles: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  if (eventTitles.length) {
    const events = await prisma.event.findMany({
      where: { title: { in: eventTitles } },
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
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `event-category-patch-${ts}` },
    body: JSON.stringify({
      email: `event-category-patch-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: "Event Category Patch Validation",
      userType: "exhibitor",
    }),
  });
  assert.equal(signupResponse.status, 201);
  const signup = await signupResponse.json() as { token: string };

  const bootstrapResponse = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${signup.token}` },
    body: JSON.stringify({
      name: `Event Category Patch Bootstrap ${ts}`,
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

test("standalone Event PATCH rejects inactive/arbitrary categories without mutation and accepts an active canonical category", async () => {
  const token = await signupAndBootstrapOrganizer();
  const initial = await createCategory(`Initial Active Category ${ts}`, true);
  const inactive = await createCategory(`Inactive Update Category ${ts}`, false);
  const replacement = await createCategory(`Replacement Active Category ${ts}`, true);
  const title = `Event Category Patch Target ${ts}`;
  eventTitles.push(title);

  const createResponse = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title,
      status: "DRAFT",
      visibility: "private",
      categoryId: initial.id,
    }),
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json() as { event: { id: string; categoryId: string | null } };
  assert.equal(created.event.categoryId, initial.id);

  const patch = (body: Record<string, unknown>) => fetch(`${baseUrl}/api/events/${created.event.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  const inactiveResponse = await patch({ categoryId: inactive.id });
  assert.equal(inactiveResponse.status, 400);
  assert.match((await inactiveResponse.json()).error, /active Event Category/);

  const arbitraryResponse = await patch({ category: `Unregistered Update Category ${ts}` });
  assert.equal(arbitraryResponse.status, 400);
  assert.match((await arbitraryResponse.json()).error, /existing active Event Category/);

  const afterRejectedUpdates = await prisma.event.findUniqueOrThrow({ where: { id: created.event.id } });
  assert.equal(afterRejectedUpdates.categoryId, initial.id, "rejected PATCH requests must preserve the prior canonical category");

  const validResponse = await patch({ categoryId: replacement.id });
  assert.equal(validResponse.status, 200);
  const updated = await prisma.event.findUniqueOrThrow({ where: { id: created.event.id } });
  assert.equal(updated.categoryId, replacement.id, "valid active canonical category updates must persist");
});
