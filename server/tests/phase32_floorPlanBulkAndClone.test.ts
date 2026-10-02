import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, createStall, cleanupOrganizers } from "./helpers/entitlementFixtures";

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
