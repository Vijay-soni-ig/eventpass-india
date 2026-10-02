import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, createStall, cleanupOrganizers, setSubscription } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const organizerIds: string[] = [];
const ts = Date.now();

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

async function jsonRequest(path: string, token: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

async function setup(label: string, offset: number, stallCount: number) {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, label, ts + offset);
  organizerIds.push(organizerId);
  const stallIds: string[] = [];
  for (let i = 0; i < stallCount; i += 1) {
    const stall = await createStall(baseUrl, token, firstExhibitionId, 5000 + i);
    assert.equal(stall.status, 201);
    stallIds.push(stall.body.stall.id);
  }
  const base = `/api/exhibitions/${firstExhibitionId}/floor-plan-layouts`;
  const create = await jsonRequest(base, token, { method: "POST", body: JSON.stringify({ name: "Hall", canvasWidth: 1000, canvasHeight: 700 }) });
  assert.equal(create.status, 201);
  const plan = (await create.json()).floorPlan as { id: string; version: number };
  return { token, exhibitionId: firstExhibitionId, base, planId: plan.id, version: plan.version, stallIds };
}

const box = (stallId: string, i: number) => ({ stallId, x: 10 + i * 60, y: 10, width: 50, height: 50 });

test("bulk place maps every stall in one atomic call and bumps the version once", async () => {
  const ctx = await setup("phase32-bulk-ok", 1, 3);
  const res = await jsonRequest(`${ctx.base}/${ctx.planId}/objects/bulk`, ctx.token, {
    method: "POST",
    body: JSON.stringify({ expectedVersion: ctx.version, objects: ctx.stallIds.map(box) }),
  });
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { created: 3, version: ctx.version + 1 });

  const detail = await (await jsonRequest(`${ctx.base}/${ctx.planId}`, ctx.token)).json();
  assert.equal(detail.objects.length, 3);
  assert.equal(detail.floorPlan.version, ctx.version + 1);
});

test("bulk place is all-or-nothing: an out-of-bounds item leaves the plan untouched", async () => {
  const ctx = await setup("phase32-bulk-bounds", 2, 2);
  const objects = [box(ctx.stallIds[0], 0), { ...box(ctx.stallIds[1], 1), x: 990 }];
  const res = await jsonRequest(`${ctx.base}/${ctx.planId}/objects/bulk`, ctx.token, {
    method: "POST",
    body: JSON.stringify({ expectedVersion: ctx.version, objects }),
  });
  assert.equal(res.status, 400);
  const detail = await (await jsonRequest(`${ctx.base}/${ctx.planId}`, ctx.token)).json();
  assert.equal(detail.objects.length, 0);
  assert.equal(detail.floorPlan.version, ctx.version);
});

test("bulk place rejects stale versions, duplicates, already-mapped stalls and foreign stalls", async () => {
  const ctx = await setup("phase32-bulk-rules", 3, 2);
  const other = await setup("phase32-bulk-other", 4, 1);
  const path = `${ctx.base}/${ctx.planId}/objects/bulk`;
  const post = (body: unknown) => jsonRequest(path, ctx.token, { method: "POST", body: JSON.stringify(body) });

  const stale = await post({ expectedVersion: ctx.version + 5, objects: [box(ctx.stallIds[0], 0)] });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).code, "FLOOR_PLAN_VERSION_CONFLICT");

  const dup = await post({ expectedVersion: ctx.version, objects: [box(ctx.stallIds[0], 0), box(ctx.stallIds[0], 1)] });
  assert.equal(dup.status, 400);

  const empty = await post({ expectedVersion: ctx.version, objects: [] });
  assert.equal(empty.status, 400);

  const foreign = await post({ expectedVersion: ctx.version, objects: [box(other.stallIds[0], 0)] });
  assert.equal(foreign.status, 400);

  const first = await post({ expectedVersion: ctx.version, objects: [box(ctx.stallIds[0], 0)] });
  assert.equal(first.status, 201);
  const again = await post({ expectedVersion: ctx.version + 1, objects: [box(ctx.stallIds[0], 0), box(ctx.stallIds[1], 1)] });
  assert.equal(again.status, 409);

  // Another organizer cannot write to this plan.
  const crossTenant = await jsonRequest(path, other.token, {
    method: "POST",
    body: JSON.stringify({ expectedVersion: ctx.version + 1, objects: [box(ctx.stallIds[1], 1)] }),
  });
  assert.equal(crossTenant.status, 404);
});

test("clone copies a published plan into an editable draft; publishing it archives the original", async () => {
  const ctx = await setup("phase32-clone", 5, 2);
  const add = await jsonRequest(`${ctx.base}/${ctx.planId}/objects/bulk`, ctx.token, {
    method: "POST",
    body: JSON.stringify({ expectedVersion: ctx.version, objects: ctx.stallIds.map((id, i) => ({ ...box(id, i), rotation: 15 })) }),
  });
  assert.equal(add.status, 201);

  // A draft cannot be cloned.
  const cloneDraft = await jsonRequest(`${ctx.base}/${ctx.planId}/clone`, ctx.token, { method: "POST" });
  assert.equal(cloneDraft.status, 409);

  const publish = await jsonRequest(`${ctx.base}/${ctx.planId}/publish`, ctx.token, { method: "POST", body: JSON.stringify({ expectedVersion: ctx.version + 1 }) });
  assert.equal(publish.status, 200);

  const clone = await jsonRequest(`${ctx.base}/${ctx.planId}/clone`, ctx.token, { method: "POST" });
  assert.equal(clone.status, 201);
  const cloned = (await clone.json()).floorPlan as { id: string; name: string; status: string; version: number };
  assert.equal(cloned.status, "draft");
  assert.equal(cloned.name, "Hall (draft)");
  assert.notEqual(cloned.id, ctx.planId);

  const detail = await (await jsonRequest(`${ctx.base}/${cloned.id}`, ctx.token)).json();
  assert.equal(detail.floorPlan.status, "draft");
  assert.equal(detail.objects.length, 2);
  assert.ok(detail.objects.every((o: { rotation: string | number; floorPlanId: string }) => Number(o.rotation) === 15 && o.floorPlanId === cloned.id));

  // The published plan is untouched and still serves visitors.
  const original = await (await jsonRequest(`${ctx.base}/${ctx.planId}`, ctx.token)).json();
  assert.equal(original.floorPlan.status, "published");
  assert.equal(original.objects.length, 2);

  // Only one draft at a time.
  const second = await jsonRequest(`${ctx.base}/${ctx.planId}/clone`, ctx.token, { method: "POST" });
  assert.equal(second.status, 409);
  assert.equal((await second.json()).code, "FLOOR_PLAN_DRAFT_EXISTS");

  // The draft is editable and publishing it archives the original.
  const edit = await jsonRequest(`${ctx.base}/${cloned.id}/objects/${detail.objects[0].id}`, ctx.token, {
    method: "PATCH",
    body: JSON.stringify({ expectedVersion: cloned.version, x: 400 }),
  });
  assert.equal(edit.status, 200);
  const republish = await jsonRequest(`${ctx.base}/${cloned.id}/publish`, ctx.token, { method: "POST", body: JSON.stringify({ expectedVersion: cloned.version + 1 }) });
  assert.equal(republish.status, 200);
  const archived = await (await jsonRequest(`${ctx.base}/${ctx.planId}`, ctx.token)).json();
  assert.equal(archived.floorPlan.status, "archived");

  // Cloning the archived plan again yields a distinct, unique name.
  const again = await jsonRequest(`${ctx.base}/${ctx.planId}/clone`, ctx.token, { method: "POST" });
  assert.equal(again.status, 201);
  assert.equal((await again.json()).floorPlan.name, "Hall (draft 2)");
});

test("clone is unavailable to other organizers and for unknown plans", async () => {
  const ctx = await setup("phase32-clone-auth", 6, 1);
  const other = await setup("phase32-clone-auth-other", 7, 0);
  const foreign = await jsonRequest(`${ctx.base}/${ctx.planId}/clone`, other.token, { method: "POST" });
  assert.equal(foreign.status, 404);
  const missing = await jsonRequest(`${ctx.base}/does-not-exist/clone`, ctx.token, { method: "POST" });
  assert.equal(missing.status, 404);
});

const block = (over: Record<string, unknown> = {}) => ({
  prefix: "A-",
  startNumber: 1,
  padding: 2,
  count: 6,
  stallType: "standard",
  size: "3x3",
  price: 7500,
  x: 20,
  y: 20,
  width: 80,
  height: 60,
  columns: 3,
  gap: 10,
  ...over,
});

test("generate-stalls creates stalls and places them in one atomic call", async () => {
  const ctx = await setup("phase32-gen-ok", 8, 0);
  const res = await jsonRequest(`${ctx.base}/${ctx.planId}/generate-stalls`, ctx.token, {
    method: "POST",
    body: JSON.stringify({ expectedVersion: ctx.version, ...block() }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.created, 6);
  assert.equal(body.version, ctx.version + 1);

  const stalls = await prisma.stall.findMany({ where: { exhibitionId: ctx.exhibitionId }, orderBy: { code: "asc" } });
  assert.deepEqual(stalls.map((s) => s.code), ["A-01", "A-02", "A-03", "A-04", "A-05", "A-06"]);
  assert.ok(stalls.every((s) => Number(s.price) === 7500 && s.stallType === "standard" && s.size === "3x3" && s.status === "available"));

  const detail = await (await jsonRequest(`${ctx.base}/${ctx.planId}`, ctx.token)).json();
  assert.equal(detail.objects.length, 6);
  const byStall = new Map(detail.objects.map((o: { stallId: string; x: string; y: string }) => [o.stallId, o]));
  const a04 = byStall.get(stalls[3].id) as { x: string; y: string };
  // 4th stall = column 0 of row 1: x = 20, y = 20 + (60 + 10)
  assert.equal(Number(a04.x), 20);
  assert.equal(Number(a04.y), 90);
  const a03 = byStall.get(stalls[2].id) as { x: string; y: string };
  assert.equal(Number(a03.x), 20 + 2 * 90);
});

test("generate-stalls is all-or-nothing on duplicate codes, bounds, stale version and plan limits", async () => {
  const ctx = await setup("phase32-gen-rules", 9, 0);
  const path = `${ctx.base}/${ctx.planId}/generate-stalls`;
  const post = (body: unknown) => jsonRequest(path, ctx.token, { method: "POST", body: JSON.stringify(body) });
  const stallCount = () => prisma.stall.count({ where: { exhibitionId: ctx.exhibitionId } });

  const first = await post({ expectedVersion: ctx.version, ...block({ count: 2 }) });
  assert.equal(first.status, 201);
  assert.equal(await stallCount(), 2);

  // Overlapping codes (A-02 exists, case-insensitively) -> 409, nothing created.
  const dup = await post({ expectedVersion: ctx.version + 1, ...block({ prefix: "a-", startNumber: 2, count: 3 }) });
  assert.equal(dup.status, 409);
  assert.equal((await dup.json()).code, "STALL_CODE_DUPLICATE");
  assert.equal(await stallCount(), 2);

  // Out of canvas bounds (1000 wide) -> 400, nothing created.
  const oob = await post({ expectedVersion: ctx.version + 1, ...block({ prefix: "B-", count: 30, columns: 30 }) });
  assert.equal(oob.status, 400);
  assert.equal(await stallCount(), 2);

  // Stale version -> 409 conflict.
  const stale = await post({ expectedVersion: ctx.version, ...block({ prefix: "C-", count: 1 }) });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).code, "FLOOR_PLAN_VERSION_CONFLICT");

  // Invalid input.
  assert.equal((await post({ expectedVersion: ctx.version + 1, ...block({ count: 0 }) })).status, 400);
  assert.equal((await post({ expectedVersion: ctx.version + 1, ...block({ count: 201 }) })).status, 400);
  assert.equal((await post({ expectedVersion: ctx.version + 1, ...block({ price: -1 }) })).status, 400);

  const detail = await (await jsonRequest(`${ctx.base}/${ctx.planId}`, ctx.token)).json();
  assert.equal(detail.objects.length, 2);
  assert.equal(detail.floorPlan.version, ctx.version + 1);
});

test("generate-stalls respects the organizer's plan stall limit and tenant isolation", async () => {
  const ctx = await setup("phase32-gen-limit", 10, 0);
  const other = await setup("phase32-gen-limit-other", 11, 0);
  const organizerId = organizerIds[organizerIds.length - 2];
  await setSubscription(organizerId, "starter", "active");
  const path = `${ctx.base}/${ctx.planId}/generate-stalls`;

  const over = await jsonRequest(path, ctx.token, { method: "POST", body: JSON.stringify({ expectedVersion: ctx.version, ...block({ prefix: "L-", count: 200, columns: 10, width: 30, height: 20, gap: 2 }) }) });
  assert.equal(over.status, 409);
  assert.equal((await over.json()).error.code, "PLAN_LIMIT_EXCEEDED");
  assert.equal(await prisma.stall.count({ where: { exhibitionId: ctx.exhibitionId } }), 0);

  const foreign = await jsonRequest(path, other.token, { method: "POST", body: JSON.stringify({ expectedVersion: ctx.version, ...block() }) });
  assert.equal(foreign.status, 404);
});

async function planWithObjects(label: string, offset: number, n: number) {
  const ctx = await setup(label, offset, n);
  const add = await jsonRequest(`${ctx.base}/${ctx.planId}/objects/bulk`, ctx.token, {
    method: "POST",
    body: JSON.stringify({ expectedVersion: ctx.version, objects: ctx.stallIds.map(box) }),
  });
  assert.equal(add.status, 201);
  const detail = await (await jsonRequest(`${ctx.base}/${ctx.planId}`, ctx.token)).json();
  return { ...ctx, version: ctx.version + 1, objects: detail.objects as Array<{ id: string; x: string; y: string; width: string }> };
}

test("bulk-update moves a group atomically with a single version bump", async () => {
  const ctx = await planWithObjects("phase32-bu-ok", 12, 3);
  const res = await jsonRequest(`${ctx.base}/${ctx.planId}/objects/bulk-update`, ctx.token, {
    method: "POST",
    body: JSON.stringify({ expectedVersion: ctx.version, updates: ctx.objects.map((o, i) => ({ objectId: o.id, x: 500 + i * 60, y: 300 })) }),
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, updated: 3, version: ctx.version + 1 });
  const detail = await (await jsonRequest(`${ctx.base}/${ctx.planId}`, ctx.token)).json();
  assert.deepEqual(detail.objects.map((o: { x: string }) => Number(o.x)).sort((a: number, b: number) => a - b), [500, 560, 620]);
  assert.ok(detail.objects.every((o: { y: string }) => Number(o.y) === 300));
  assert.equal(detail.floorPlan.version, ctx.version + 1);
});

test("bulk-update is all-or-nothing and rejects stale versions, duplicates and foreign objects", async () => {
  const ctx = await planWithObjects("phase32-bu-rules", 13, 2);
  const other = await planWithObjects("phase32-bu-other", 14, 1);
  const path = `${ctx.base}/${ctx.planId}/objects/bulk-update`;
  const post = (token: string, body: unknown) => jsonRequest(path, token, { method: "POST", body: JSON.stringify(body) });

  const oob = await post(ctx.token, { expectedVersion: ctx.version, updates: [{ objectId: ctx.objects[0].id, x: 100 }, { objectId: ctx.objects[1].id, x: 990 }] });
  assert.equal(oob.status, 400);
  const stale = await post(ctx.token, { expectedVersion: ctx.version + 3, updates: [{ objectId: ctx.objects[0].id, x: 100 }] });
  assert.equal(stale.status, 409);
  const dup = await post(ctx.token, { expectedVersion: ctx.version, updates: [{ objectId: ctx.objects[0].id, x: 100 }, { objectId: ctx.objects[0].id, x: 200 }] });
  assert.equal(dup.status, 400);
  const foreignObject = await post(ctx.token, { expectedVersion: ctx.version, updates: [{ objectId: other.objects[0].id, x: 100 }] });
  assert.equal(foreignObject.status, 404);
  const crossTenant = await post(other.token, { expectedVersion: ctx.version, updates: [{ objectId: ctx.objects[0].id, x: 100 }] });
  assert.equal(crossTenant.status, 404);

  const detail = await (await jsonRequest(`${ctx.base}/${ctx.planId}`, ctx.token)).json();
  assert.equal(detail.floorPlan.version, ctx.version);
  assert.deepEqual(detail.objects.map((o: { x: string }) => Number(o.x)).sort((a: number, b: number) => a - b), [10, 70]);
});

test("bulk-delete removes several objects atomically and refuses published plans", async () => {
  const ctx = await planWithObjects("phase32-bd", 15, 3);
  const path = `${ctx.base}/${ctx.planId}/objects/bulk-delete`;
  const post = (body: unknown) => jsonRequest(path, ctx.token, { method: "POST", body: JSON.stringify(body) });

  const missing = await post({ expectedVersion: ctx.version, objectIds: [ctx.objects[0].id, "does-not-exist"] });
  assert.equal(missing.status, 404);
  assert.equal((await (await jsonRequest(`${ctx.base}/${ctx.planId}`, ctx.token)).json()).objects.length, 3);

  const ok = await post({ expectedVersion: ctx.version, objectIds: [ctx.objects[0].id, ctx.objects[1].id] });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true, deleted: 2, version: ctx.version + 1 });
  const detail = await (await jsonRequest(`${ctx.base}/${ctx.planId}`, ctx.token)).json();
  assert.equal(detail.objects.length, 1);
  // Stalls survive; only their map placement is removed.
  assert.equal(await prisma.stall.count({ where: { exhibitionId: ctx.exhibitionId } }), 3);

  const publish = await jsonRequest(`${ctx.base}/${ctx.planId}/publish`, ctx.token, { method: "POST", body: JSON.stringify({ expectedVersion: ctx.version + 1 }) });
  assert.equal(publish.status, 200);
  const published = await post({ expectedVersion: ctx.version + 2, objectIds: [ctx.objects[2].id] });
  assert.equal(published.status, 409);
  const updatePublished = await jsonRequest(`${ctx.base}/${ctx.planId}/objects/bulk-update`, ctx.token, { method: "POST", body: JSON.stringify({ expectedVersion: ctx.version + 2, updates: [{ objectId: ctx.objects[2].id, x: 5 }] }) });
  assert.equal(updatePublished.status, 409);
});

test("bulk-update can restore rotation, stacking order and label visibility (used by undo)", async () => {
  const ctx = await planWithObjects("phase32-bu-fields", 16, 2);
  const res = await jsonRequest(`${ctx.base}/${ctx.planId}/objects/bulk-update`, ctx.token, {
    method: "POST",
    body: JSON.stringify({
      expectedVersion: ctx.version,
      updates: [
        { objectId: ctx.objects[0].id, rotation: 45, zIndex: 3, labelVisible: false },
        { objectId: ctx.objects[1].id, labelVisible: false },
      ],
    }),
  });
  assert.equal(res.status, 200);
  const detail = await (await jsonRequest(`${ctx.base}/${ctx.planId}`, ctx.token)).json();
  const byId = new Map(detail.objects.map((o: { id: string; rotation: string; zIndex: number; labelVisible: boolean }) => [o.id, o]));
  const first = byId.get(ctx.objects[0].id) as { rotation: string; zIndex: number; labelVisible: boolean };
  assert.equal(Number(first.rotation), 45);
  assert.equal(first.zIndex, 3);
  assert.equal(first.labelVisible, false);
  assert.equal((byId.get(ctx.objects[1].id) as { labelVisible: boolean }).labelVisible, false);
});
