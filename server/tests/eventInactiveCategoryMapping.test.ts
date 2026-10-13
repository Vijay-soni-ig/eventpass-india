import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { slugifyCategoryName } from "../src/lib/eventMapping";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const categoryName = `Inactive Legacy Category ${ts}`;
const categorySlug = slugifyCategoryName(categoryName);
let categoryId: string | undefined;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  if (categoryId) {
    await prisma.eventCategory.deleteMany({ where: { id: categoryId } });
  }
  await stop();
});

test("Legacy Exhibition free-text category never links a canonical Event to an inactive category", async () => {
  const category = await prisma.eventCategory.create({
    data: { name: categoryName, slug: categorySlug, active: false, sortOrder: 0 },
  });
  categoryId = category.id;

  const signupResponse = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `inactive-category-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: "Inactive Category Regression",
      userType: "exhibitor",
    }),
  });
  assert.equal(signupResponse.status, 201);
  const { token } = await signupResponse.json() as { token: string };

  const createResponse = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: `Inactive Category Exhibition ${ts}`,
      category: categoryName,
      status: "draft",
      visibility: "public",
      ticketTypes: [],
      stalls: [],
    }),
  });
  assert.equal(createResponse.status, 201);
  const { exhibition } = await createResponse.json() as { exhibition: { id: string; eventId: string; category: string } };

  const event = await prisma.event.findUniqueOrThrow({ where: { id: exhibition.eventId } });
  assert.equal(exhibition.category, categoryName, "legacy Exhibition category text must remain compatible");
  assert.equal(event.categoryId, null, "canonical Event must not point to an inactive category");
});
