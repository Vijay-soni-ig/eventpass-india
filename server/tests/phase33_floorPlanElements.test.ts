import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { getPublishedFloorPlan } from "../src/lib/floorPlanQueries";
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

async function setup(label: string, offset: number) {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, label, ts + offset);
  organizerIds.push(organizerId);
  const stall = await createStall(baseUrl, token, firstExhibitionId, 6000);
  assert.equal(stall.status, 201);
  const base = `/api/exhibitions/${firstExhibitionId}/floor-plan-layouts`;
  const create = await jsonRequest(base, token, { method: "POST", body: JSON.stringify({ name: "Hall", canvasWidth: 1000, canvasHeight: 700 }) });
  assert.equal(create.status, 201);
  const plan = (await create.json()).floorPlan as { id: string; version: number };
  const post = (path: string, body: unknown, who = token) => jsonRequest(`${base}/${plan.id}${path}`, who, { method: "POST", body: JSON.stringify(body) });
  const detail = async () => (await jsonRequest(`${base}/${plan.id}`, token)).json();
  return { token, exhibitionId: firstExhibitionId, base, planId: plan.id, version: plan.version, stallId: stall.body.stall.id as string, post, detail };
}

const aisle = (over: Record<string, unknown> = {}) => ({ type: "aisle", x: 100, y: 300, width: 400, height: 40, ...over });

test("elements can be added, are returned with the plan, and bump the version once", async () => {
  const ctx = await setup("phase33-add", 1);
  const res = await ctx.post("/elements/bulk", {
    expectedVersion: ctx.version,
    elements: [aisle(), { type: "label", label: "  Hall A  ", x: 20, y: 20, width: 160, height: 40 }, { type: "stage", x: 600, y: 500, width: 300, height: 150, rotation: 10, zIndex: 2 }],
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.created, 3);
  assert.equal(body.version, ctx.version + 1);
  assert.equal(body.ids.length, 3);

  const detail = await ctx.detail();
  assert.equal(detail.floorPlan.version, ctx.version + 1);
  assert.equal(detail.elements.length, 3);
  const label = detail.elements.find((e: { type: string }) => e.type === "label");
  assert.equal(label.label, "Hall A");
  const stage = detail.elements.find((e: { type: string }) => e.type === "stage");
  assert.equal(Number(stage.rotation), 10);
  assert.equal(stage.zIndex, 2);
  assert.equal(detail.objects.length, 0);
});

test("adding elements is all-or-nothing and validated", async () => {
  const ctx = await setup("phase33-validate", 2);
  const bad = async (elements: unknown[], status: number, version = ctx.version) => {
    const res = await ctx.post("/elements/bulk", { expectedVersion: version, elements });
    assert.equal(res.status, status, JSON.stringify(await res.clone().json()));
  };
  await bad([aisle(), aisle({ x: 900, width: 400 })], 400); // second one leaves the canvas
  await bad([{ type: "label", x: 10, y: 10, width: 100, height: 30 }], 400); // label needs text
  await bad([{ type: "label", label: "   ", x: 10, y: 10, width: 100, height: 30 }], 400);
  await bad([{ type: "tree", x: 10, y: 10, width: 10, height: 10 }], 400); // unknown type
  await bad([aisle({ width: 0 })], 400);
  await bad([], 400);
  await bad([aisle()], 409, ctx.version + 4); // stale version
  const detail = await ctx.detail();
  assert.equal(detail.elements.length, 0);
  assert.equal(detail.floorPlan.version, ctx.version);
});

test("a removed element can be put back under its old id (undo), but ids cannot clash", async () => {
  const ctx = await setup("phase33-undo", 3);
  const id = crypto.randomUUID();
  const add = await ctx.post("/elements/bulk", { expectedVersion: ctx.version, elements: [{ ...aisle(), id }] });
  assert.equal(add.status, 201);
  assert.deepEqual((await add.json()).ids, [id]);

  const clash = await ctx.post("/elements/bulk", { expectedVersion: ctx.version + 1, elements: [{ ...aisle(), id }] });
  assert.equal(clash.status, 409);
  assert.equal((await clash.json()).code, "ELEMENT_EXISTS");

  const del = await ctx.post("/elements/bulk-delete", { expectedVersion: ctx.version + 1, elementIds: [id] });
  assert.equal(del.status, 200);
  const back = await ctx.post("/elements/bulk", { expectedVersion: ctx.version + 2, elements: [{ ...aisle(), id }] });
  assert.equal(back.status, 201);
  assert.equal((await ctx.detail()).elements[0].id, id);
});

test("elements can be moved, relabelled and retyped; invalid updates change nothing", async () => {
  const ctx = await setup("phase33-update", 4);
  const add = await ctx.post("/elements/bulk", {
    expectedVersion: ctx.version,
    elements: [aisle(), { type: "label", label: "Stage", x: 20, y: 20, width: 160, height: 40 }],
  });
  const [aisleId, labelId] = (await add.json()).ids as string[];
  const v = ctx.version + 1;

  const ok = await ctx.post("/elements/bulk-update", {
    expectedVersion: v,
    updates: [{ elementId: aisleId, x: 200, y: 250, type: "entrance", label: "Main gate" }, { elementId: labelId, label: "Food court", rotation: 90 }],
  });
  assert.equal(ok.status, 200);
  const detail = await ctx.detail();
  const a = detail.elements.find((e: { id: string }) => e.id === aisleId);
  assert.equal(a.type, "entrance");
  assert.equal(a.label, "Main gate");
  assert.equal(Number(a.x), 200);
  assert.equal(detail.floorPlan.version, v + 1);

  const blank = await ctx.post("/elements/bulk-update", { expectedVersion: v + 1, updates: [{ elementId: aisleId, x: 10 }, { elementId: labelId, label: "" }] });
  assert.equal(blank.status, 400);
  const toLabel = await ctx.post("/elements/bulk-update", { expectedVersion: v + 1, updates: [{ elementId: aisleId, type: "label", label: null }] });
  assert.equal(toLabel.status, 400);
  const oob = await ctx.post("/elements/bulk-update", { expectedVersion: v + 1, updates: [{ elementId: aisleId, x: 990 }] });
  assert.equal(oob.status, 400);
  const missing = await ctx.post("/elements/bulk-update", { expectedVersion: v + 1, updates: [{ elementId: aisleId, x: 10 }, { elementId: "nope", x: 10 }] });
  assert.equal(missing.status, 404);
  const stale = await ctx.post("/elements/bulk-update", { expectedVersion: v, updates: [{ elementId: aisleId, x: 10 }] });
  assert.equal(stale.status, 409);

  const after = await ctx.detail();
  assert.equal(after.floorPlan.version, v + 1);
  assert.equal(Number(after.elements.find((e: { id: string }) => e.id === aisleId).x), 200);
});

test("elements can be removed in a group; unknown ids remove nothing", async () => {
  const ctx = await setup("phase33-delete", 5);
  const add = await ctx.post("/elements/bulk", { expectedVersion: ctx.version, elements: [aisle(), aisle({ y: 400 }), aisle({ y: 500 })] });
  const ids = (await add.json()).ids as string[];
  const v = ctx.version + 1;

  const missing = await ctx.post("/elements/bulk-delete", { expectedVersion: v, elementIds: [ids[0], "nope"] });
  assert.equal(missing.status, 404);
  assert.equal((await ctx.detail()).elements.length, 3);

  const ok = await ctx.post("/elements/bulk-delete", { expectedVersion: v, elementIds: [ids[0], ids[1]] });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true, deleted: 2, version: v + 1 });
  assert.equal((await ctx.detail()).elements.length, 1);
});

test("elements follow the plan lifecycle: cloned to drafts, served once published, immutable after", async () => {
  const ctx = await setup("phase33-lifecycle", 6);
  const add = await ctx.post("/elements/bulk", { expectedVersion: ctx.version, elements: [aisle(), { type: "label", label: "Entrance hall", x: 10, y: 10, width: 200, height: 40 }] });
  const ids = (await add.json()).ids as string[];
  const placed = await ctx.post("/objects/bulk", { expectedVersion: ctx.version + 1, objects: [{ stallId: ctx.stallId, x: 600, y: 100, width: 100, height: 80 }] });
  assert.equal(placed.status, 201);

  const publish = await ctx.post("/publish", { expectedVersion: ctx.version + 2 });
  assert.equal(publish.status, 200);

  // Public / exhibitor readers get the elements of the published plan.
  const published = await getPublishedFloorPlan(ctx.exhibitionId);
  assert.ok(published);
  assert.equal(published.elements.length, 2);
  assert.deepEqual(published.elements.map((e) => e.type).sort(), ["aisle", "label"]);
  assert.equal(published.objects.length, 1);

  // A published plan cannot be changed.
  const locked = await ctx.post("/elements/bulk", { expectedVersion: ctx.version + 3, elements: [aisle({ y: 600 })] });
  assert.equal(locked.status, 409);
  assert.equal((await ctx.post("/elements/bulk-update", { expectedVersion: ctx.version + 3, updates: [{ elementId: ids[0], x: 5 }] })).status, 409);
  assert.equal((await ctx.post("/elements/bulk-delete", { expectedVersion: ctx.version + 3, elementIds: [ids[0]] })).status, 409);

  // Editing a published plan copies its elements into the draft.
  const clone = await ctx.post("/clone", undefined);
  assert.equal(clone.status, 201);
  const draftId = (await clone.json()).floorPlan.id as string;
  const draft = await (await jsonRequest(`${ctx.base}/${draftId}`, ctx.token)).json();
  assert.equal(draft.elements.length, 2);
  assert.ok(draft.elements.every((e: { id: string }) => !ids.includes(e.id)), "copies get new ids");

  // The draft's elements are independent of the published ones.
  const del = await jsonRequest(`${ctx.base}/${draftId}/elements/bulk-delete`, ctx.token, {
    method: "POST",
    body: JSON.stringify({ expectedVersion: 1, elementIds: [draft.elements[0].id] }),
  });
  assert.equal(del.status, 200);
  assert.equal((await getPublishedFloorPlan(ctx.exhibitionId))!.elements.length, 2);
});

test("a canvas can't be shrunk below an element", async () => {
  const ctx = await setup("phase33-canvas", 7);
  const add = await ctx.post("/elements/bulk", { expectedVersion: ctx.version, elements: [aisle({ x: 500, width: 400 })] });
  assert.equal(add.status, 201);
  const shrink = await jsonRequest(`${ctx.base}/${ctx.planId}`, ctx.token, {
    method: "PATCH",
    body: JSON.stringify({ expectedVersion: ctx.version + 1, canvasWidth: 600 }),
  });
  assert.equal(shrink.status, 409);
  const grow = await jsonRequest(`${ctx.base}/${ctx.planId}`, ctx.token, {
    method: "PATCH",
    body: JSON.stringify({ expectedVersion: ctx.version + 1, canvasWidth: 1200 }),
  });
  assert.equal(grow.status, 200);
});

test("elements are not reachable by another organizer", async () => {
  const ctx = await setup("phase33-tenant", 8);
  const other = await setup("phase33-tenant-other", 9);
  const add = await ctx.post("/elements/bulk", { expectedVersion: ctx.version, elements: [aisle()] });
  const [id] = (await add.json()).ids as string[];
  const v = ctx.version + 1;
  assert.equal((await ctx.post("/elements/bulk", { expectedVersion: v, elements: [aisle()] }, other.token)).status, 404);
  assert.equal((await ctx.post("/elements/bulk-update", { expectedVersion: v, updates: [{ elementId: id, x: 5 }] }, other.token)).status, 404);
  assert.equal((await ctx.post("/elements/bulk-delete", { expectedVersion: v, elementIds: [id] }, other.token)).status, 404);
  assert.equal((await ctx.detail()).elements.length, 1);
});
