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
  if (createdUserIds.length) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await stop();
});

async function signupAdmin(label: string) {
  const email = `evtcat-admin-${label}-${ts}@example.com`;
  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "TestPassword123!", fullName: `EvtCat Admin ${label}`, userType: "visitor" }),
  }).then((r) => r.json());
  createdUserIds.push(signup.user.id);
  await prisma.user.update({ where: { id: signup.user.id }, data: { platformRole: "super_admin" } });
  return { token: signup.token as string, userId: signup.user.id as string };
}

async function signupNonAdmin(label: string) {
  const email = `evtcat-nonadmin-${label}-${ts}@example.com`;
  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "TestPassword123!", fullName: `EvtCat NonAdmin ${label}`, userType: "visitor" }),
  }).then((r) => r.json());
  createdUserIds.push(signup.user.id);
  return { token: signup.token as string };
}

test("Category CRUD: admin can create, get, list, update, and archive a category", async () => {
  const { token } = await signupAdmin("crud");
  const name = `EvtCat Widgets ${ts}`;

  const createRes = await fetch(`${baseUrl}/api/platform/event-categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  });
  assert.equal(createRes.status, 201);
  const createBody = await createRes.json();
  assert.equal(createBody.category.name, name);
  assert.equal(createBody.category.slug, `evtcat-widgets-${ts}`);
  assert.equal(createBody.category.active, true);
  const categoryId = createBody.category.id;

  const getRes = await fetch(`${baseUrl}/api/platform/event-categories/${categoryId}`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(getRes.status, 200);

  const listRes = await fetch(`${baseUrl}/api/platform/event-categories`, { headers: { Authorization: `Bearer ${token}` } });
  const listBody = await listRes.json();
  assert.ok(listBody.categories.some((c: { id: string }) => c.id === categoryId));

  const updateRes = await fetch(`${baseUrl}/api/platform/event-categories/${categoryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ description: "Updated description", sortOrder: 5 }),
  });
  assert.equal(updateRes.status, 200);
  const updateBody = await updateRes.json();
  assert.equal(updateBody.category.description, "Updated description");
  assert.equal(updateBody.category.sortOrder, 5);

  const archiveRes = await fetch(`${baseUrl}/api/platform/event-categories/${categoryId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(archiveRes.status, 204);
  const archived = await prisma.eventCategory.findUniqueOrThrow({ where: { id: categoryId } });
  assert.equal(archived.active, false, "DELETE archives (active:false), it never hard-deletes");
});

test("Duplicate slug is rejected with 409, not a 500", async () => {
  const { token } = await signupAdmin("dup-slug");
  const name = `EvtCat Dup ${ts}`;
  const first = await fetch(`${baseUrl}/api/platform/event-categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  });
  assert.equal(first.status, 201);
  const second = await fetch(`${baseUrl}/api/platform/event-categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  });
  assert.equal(second.status, 409);
});

test("Category admin authorization: non-admin (including an authenticated organizer owner) is rejected with 403; unauthenticated is 401", async () => {
  const { token: nonAdminToken } = await signupNonAdmin("auth");
  const res = await fetch(`${baseUrl}/api/platform/event-categories`, { headers: { Authorization: `Bearer ${nonAdminToken}` } });
  assert.equal(res.status, 403);

  const unauth = await fetch(`${baseUrl}/api/platform/event-categories`);
  assert.equal(unauth.status, 401);

  const createAsNonAdmin = await fetch(`${baseUrl}/api/platform/event-categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${nonAdminToken}` },
    body: JSON.stringify({ name: "Should not be created" }),
  });
  assert.equal(createAsNonAdmin.status, 403);
});

test("Category cycle prevention: A -> B -> C, then attempting C -> A as parent is rejected", async () => {
  const { token } = await signupAdmin("cycle");
  async function create(name: string, parentCategoryId?: string) {
    const res = await fetch(`${baseUrl}/api/platform/event-categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, parentCategoryId }),
    });
    const body = await res.json();
    return body.category;
  }

  const a = await create(`EvtCat Cycle A ${ts}`);
  const b = await create(`EvtCat Cycle B ${ts}`, a.id);
  const c = await create(`EvtCat Cycle C ${ts}`, b.id);

  const cycleAttempt = await fetch(`${baseUrl}/api/platform/event-categories/${a.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ parentCategoryId: c.id }),
  });
  assert.equal(cycleAttempt.status, 400);

  const selfParentAttempt = await fetch(`${baseUrl}/api/platform/event-categories/${a.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ parentCategoryId: a.id }),
  });
  assert.equal(selfParentAttempt.status, 400);

  const unchanged = await prisma.eventCategory.findUniqueOrThrow({ where: { id: a.id } });
  assert.equal(unchanged.parentCategoryId, null, "a rejected cycle attempt must not have mutated the category");
});

test("Inactive parent categories are rejected on create and update", async () => {
  const { token } = await signupAdmin("inactive-parent");
  const parentRes = await fetch(`${baseUrl}/api/platform/event-categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: `EvtCat Inactive Parent ${ts}`, active: false }),
  });
  assert.equal(parentRes.status, 201);
  const parent = (await parentRes.json()).category;

  const createChild = await fetch(`${baseUrl}/api/platform/event-categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: `EvtCat Child Create ${ts}`, parentCategoryId: parent.id }),
  });
  assert.equal(createChild.status, 400);

  const childRes = await fetch(`${baseUrl}/api/platform/event-categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: `EvtCat Child Update ${ts}` }),
  });
  assert.equal(childRes.status, 201);
  const child = (await childRes.json()).category;

  const updateChild = await fetch(`${baseUrl}/api/platform/event-categories/${child.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ parentCategoryId: parent.id }),
  });
  assert.equal(updateChild.status, 400);

  const unchanged = await prisma.eventCategory.findUniqueOrThrow({ where: { id: child.id } });
  assert.equal(unchanged.parentCategoryId, null);
});

test("Active parent categories cannot be archived while they have active children", async () => {
  const { token } = await signupAdmin("archive-parent");
  async function create(name: string, parentCategoryId?: string) {
    const res = await fetch(`${baseUrl}/api/platform/event-categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, parentCategoryId }),
    });
    assert.equal(res.status, 201);
    return (await res.json()).category;
  }

  const parent = await create(`EvtCat Archive Parent ${ts}`);
  await create(`EvtCat Archive Child ${ts}`, parent.id);

  const archiveParent = await fetch(`${baseUrl}/api/platform/event-categories/${parent.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(archiveParent.status, 409);
  const body = await archiveParent.json();
  assert.equal(body.activeChildCount, 1);

  const unchanged = await prisma.eventCategory.findUniqueOrThrow({ where: { id: parent.id } });
  assert.equal(unchanged.active, true);
});

test("Archived child categories cannot be restored while their parent is archived", async () => {
  const { token } = await signupAdmin("restore-parent");
  const parentRes = await fetch(`${baseUrl}/api/platform/event-categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: `EvtCat Restore Parent ${ts}` }),
  });
  assert.equal(parentRes.status, 201);
  const parent = (await parentRes.json()).category;

  const childRes = await fetch(`${baseUrl}/api/platform/event-categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: `EvtCat Restore Child ${ts}`, parentCategoryId: parent.id }),
  });
  assert.equal(childRes.status, 201);
  const child = (await childRes.json()).category;

  const archiveChild = await fetch(`${baseUrl}/api/platform/event-categories/${child.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(archiveChild.status, 204);

  const archiveParent = await fetch(`${baseUrl}/api/platform/event-categories/${parent.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(archiveParent.status, 204);

  const restoreChild = await fetch(`${baseUrl}/api/platform/event-categories/${child.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ active: true }),
  });
  assert.equal(restoreChild.status, 400);

  const unchanged = await prisma.eventCategory.findUniqueOrThrow({ where: { id: child.id } });
  assert.equal(unchanged.active, false);
});

test("Invalid parentCategoryId (nonexistent) is rejected on both create and update", async () => {
  const { token } = await signupAdmin("bad-parent");
  const createRes = await fetch(`${baseUrl}/api/platform/event-categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: `EvtCat BadParent ${ts}`, parentCategoryId: "does-not-exist" }),
  });
  assert.equal(createRes.status, 400);
});


test("Category list supports search, active filter, parent filter, sorting, and pagination", async () => {
  const { token } = await signupAdmin("list-query");
  const parentName = `EvtCat Parent ${ts}`;
  const parentRes = await fetch(`${baseUrl}/api/platform/event-categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: parentName, sortOrder: 20 }),
  });
  assert.equal(parentRes.status, 201);
  const parent = (await parentRes.json()).category;

  for (const [name, active, sortOrder] of [
    [`EvtCat Query Alpha ${ts}`, true, 30],
    [`EvtCat Query Beta ${ts}`, false, 10],
    [`EvtCat Query Gamma ${ts}`, true, 40],
  ] as const) {
    const res = await fetch(`${baseUrl}/api/platform/event-categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, active, sortOrder, parentCategoryId: name.includes("Gamma") ? parent.id : undefined }),
    });
    assert.equal(res.status, 201);
  }

  const searchRes = await fetch(
    `${baseUrl}/api/platform/event-categories?search=query%20alpha&active=true&page=1&limit=10`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  assert.equal(searchRes.status, 200);
  const searchBody = await searchRes.json();
  assert.equal(searchBody.total, 1);
  assert.equal(searchBody.categories[0].name, `EvtCat Query Alpha ${ts}`);

  const inactiveRes = await fetch(
    `${baseUrl}/api/platform/event-categories?active=false&search=query&page=1&limit=10`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  assert.equal(inactiveRes.status, 200);
  const inactiveBody = await inactiveRes.json();
  assert.equal(inactiveBody.total, 1);
  assert.equal(inactiveBody.categories[0].active, false);

  const parentRes2 = await fetch(
    `${baseUrl}/api/platform/event-categories?parentCategoryId=${parent.id}&page=1&limit=10`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  assert.equal(parentRes2.status, 200);
  const parentBody = await parentRes2.json();
  assert.equal(parentBody.total, 1);
  assert.equal(parentBody.categories[0].parentCategoryId, parent.id);

  const sortedRes = await fetch(
    `${baseUrl}/api/platform/event-categories?search=query&sort=name&page=1&limit=2`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  assert.equal(sortedRes.status, 200);
  const sortedBody = await sortedRes.json();
  assert.equal(sortedBody.total, 3);
  assert.equal(sortedBody.page, 1);
  assert.equal(sortedBody.pageSize, 2);
  assert.equal(sortedBody.categories.length, 2);
  assert.ok(sortedBody.categories[0].name < sortedBody.categories[1].name);
});
