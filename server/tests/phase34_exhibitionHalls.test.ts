import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { publishFloorPlan } from "../src/lib/floorPlanPublish";
import { getPublishedFloorPlan, getPublishedFloorPlans } from "../src/lib/floorPlanQueries";
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

async function setup(label: string, offset: number, stallCount = 4) {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, label, ts + offset);
  organizerIds.push(organizerId);
  const stallIds: string[] = [];
  for (let i = 0; i < stallCount; i += 1) {
    const stall = await createStall(baseUrl, token, firstExhibitionId, 5000 + i);
    assert.equal(stall.status, 201);
    stallIds.push(stall.body.stall.id);
  }
  const base = `/api/exhibitions/${firstExhibitionId}`;
  const req = (method: string, path: string, body?: unknown, who = token) =>
    jsonRequest(`${base}${path}`, who, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  const createHall = async (name: string) => {
    const res = await req("POST", "/halls", { name });
    assert.equal(res.status, 201, name);
    return (await res.json()).hall.id as string;
  };
  const createPlan = async (hallId: string | undefined, name: string) => {
    const res = await req("POST", "/floor-plan-layouts", { hallId, name, canvasWidth: 1000, canvasHeight: 700 });
    assert.equal(res.status, 201, name);
    return (await res.json()).floorPlan as { id: string; version: number; hallId: string };
  };
  const place = (planId: string, version: number, stallId: string, x = 10) =>
    req("POST", `/floor-plan-layouts/${planId}/objects`, { expectedVersion: version, stallId, x, y: 10, width: 100, height: 60 });
  /** Creates a plan in the hall with the given stalls and returns it (still a draft). */
  const planWith = async (hallId: string | undefined, name: string, stalls: string[]) => {
    const plan = await createPlan(hallId, name);
    const res = await req("POST", `/floor-plan-layouts/${plan.id}/objects/bulk`, {
      expectedVersion: plan.version,
      objects: stalls.map((stallId, i) => ({ stallId, x: 10 + i * 120, y: 10, width: 100, height: 60 })),
    });
    assert.equal(res.status, 201);
    return { ...plan, version: plan.version + 1 };
  };
  const publish = (planId: string, version: number) => req("POST", `/floor-plan-layouts/${planId}/publish`, { expectedVersion: version });
  const plans = async () => (await (await req("GET", "/floor-plan-layouts")).json()).floorPlans as Array<{ id: string; hallId: string; status: string; name: string }>;
  const halls = async () => (await (await req("GET", "/halls")).json()).halls as Array<Record<string, unknown> & { id: string; name: string }>;
  return { token, exhibitionId: firstExhibitionId, stallIds, req, createHall, createPlan, planWith, place, publish, plans, halls };
}

test("plans created without a hall land in an on-demand 'Main Hall' (old clients keep working)", async () => {
  const ctx = await setup("phase34-default", 1, 1);
  assert.deepEqual(await ctx.halls(), []);

  const plan = await ctx.createPlan(undefined, "Floor");
  const halls = await ctx.halls();
  assert.equal(halls.length, 1);
  assert.equal(halls[0].name, "Main Hall");
  assert.equal(halls[0].id, plan.hallId);
  assert.equal(halls[0].draftPlanId, plan.id);
  assert.equal(halls[0].publishedPlanId, null);

  const second = await ctx.createPlan(undefined, "Floor B");
  assert.equal(second.hallId, plan.hallId, "a second hall-less plan reuses the same hall");
  assert.equal((await ctx.halls()).length, 1);

  const detail = await (await ctx.req("GET", `/floor-plan-layouts/${plan.id}`)).json();
  assert.equal(detail.floorPlan.hallId, plan.hallId);
});

test("halls can be created, renamed and reordered; names are unique; there is a cap", async () => {
  const ctx = await setup("phase34-crud", 2, 0);
  const a = await ctx.createHall("Hall A");
  const b = await ctx.createHall("Hall B");
  const listed = await ctx.halls();
  assert.deepEqual(listed.map((h) => h.name), ["Hall A", "Hall B"]);
  assert.deepEqual(listed.map((h) => h.sortOrder), [0, 1]);

  assert.equal((await ctx.req("POST", "/halls", { name: "Hall A" })).status, 409);
  assert.equal((await ctx.req("POST", "/halls", { name: "   " })).status, 400);
  assert.equal((await ctx.req("POST", "/halls", {})).status, 400);

  assert.equal((await ctx.req("PATCH", `/halls/${b}`, { name: "Atrium", sortOrder: 0 })).status, 200);
  assert.equal((await ctx.req("PATCH", `/halls/${a}`, { sortOrder: 5 })).status, 200);
  assert.deepEqual((await ctx.halls()).map((h) => h.name), ["Atrium", "Hall A"]);
  assert.equal((await ctx.req("PATCH", `/halls/${a}`, { name: "Atrium" })).status, 409);
  assert.equal((await ctx.req("PATCH", `/halls/${a}`, {})).status, 400);
  assert.equal((await ctx.req("PATCH", `/halls/${crypto.randomUUID()}`, { name: "X" })).status, 404);

  for (let i = 3; i <= 20; i += 1) await ctx.createHall(`Hall ${i}`);
  const over = await ctx.req("POST", "/halls", { name: "One too many" });
  assert.equal(over.status, 400);
  assert.match((await over.json()).error, /at most 20 halls/);
});

test("halls publish independently: publishing in one hall never archives another hall's plan", async () => {
  const ctx = await setup("phase34-independent", 3, 4);
  const [s1, s2, s3, s4] = ctx.stallIds;
  const hallA = await ctx.createHall("Hall A");
  const hallB = await ctx.createHall("Hall B");

  const planA = await ctx.planWith(hallA, "Plan A", [s1, s2]);
  const planB = await ctx.planWith(hallB, "Plan B", [s3]);
  assert.equal((await ctx.publish(planA.id, planA.version)).status, 200);
  assert.equal((await ctx.publish(planB.id, planB.version)).status, 200);

  const states = await ctx.plans();
  assert.equal(states.filter((p) => p.status === "published").length, 2, "one published plan per hall");

  // A newer plan in Hall A replaces only Hall A's plan.
  const planA2 = await ctx.planWith(hallA, "Plan A v2", [s4]);
  // s1/s2 are still on Hall A's published plan, but Hall A is the same hall, so s4 is fine.
  assert.equal((await ctx.publish(planA2.id, planA2.version)).status, 200);
  const after = await ctx.plans();
  assert.equal(after.find((p) => p.id === planA.id)!.status, "archived");
  assert.equal(after.find((p) => p.id === planA2.id)!.status, "published");
  assert.equal(after.find((p) => p.id === planB.id)!.status, "published", "Hall B is untouched");

  const halls = await ctx.halls();
  assert.equal(halls.find((h) => h.id === hallA)!.publishedPlanId, planA2.id);
  assert.equal(halls.find((h) => h.id === hallB)!.publishedPlanId, planB.id);
});

test("publishing different halls at the same instant succeeds for both", async () => {
  const ctx = await setup("phase34-parallel", 4, 2);
  const hallA = await ctx.createHall("Hall A");
  const hallB = await ctx.createHall("Hall B");
  const planA = await ctx.planWith(hallA, "Plan A", [ctx.stallIds[0]]);
  const planB = await ctx.planWith(hallB, "Plan B", [ctx.stallIds[1]]);

  const results = await Promise.allSettled([
    publishFloorPlan(ctx.exhibitionId, planA.id, planA.version),
    publishFloorPlan(ctx.exhibitionId, planB.id, planB.version),
  ]);
  assert.deepEqual(results.map((r) => r.status), ["fulfilled", "fulfilled"]);
  assert.equal((await ctx.plans()).filter((p) => p.status === "published").length, 2);
});

test("two drafts of the same hall still can't both go live", async () => {
  const ctx = await setup("phase34-same-hall", 5, 2);
  const hall = await ctx.createHall("Hall A");
  const one = await ctx.planWith(hall, "One", [ctx.stallIds[0]]);
  const two = await ctx.planWith(hall, "Two", [ctx.stallIds[1]]);

  const results = await Promise.allSettled([
    publishFloorPlan(ctx.exhibitionId, one.id, one.version),
    publishFloorPlan(ctx.exhibitionId, two.id, two.version),
  ]);
  const ok = results.filter((r) => r.status === "fulfilled").length;
  assert.equal(ok, 1, "exactly one of the racing publishes wins");
  assert.equal((await ctx.plans()).filter((p) => p.status === "published").length, 1);
});

test("a stall can only be placed in one hall at a time", async () => {
  const ctx = await setup("phase34-exclusive", 6, 3);
  const [s1, s2, s3] = ctx.stallIds;
  const hallA = await ctx.createHall("Hall A");
  const hallB = await ctx.createHall("Hall B");
  const planA = await ctx.planWith(hallA, "Plan A", [s1, s2]);
  const planB = await ctx.createPlan(hallB, "Plan B");

  // Single placement.
  const single = await ctx.place(planB.id, planB.version, s1);
  assert.equal(single.status, 409);
  const body = await single.json();
  assert.equal(body.code, "STALL_IN_OTHER_HALL");
  assert.match(body.error, /already placed in Hall A/);

  // Bulk placement is all-or-nothing.
  const bulk = await ctx.req("POST", `/floor-plan-layouts/${planB.id}/objects/bulk`, {
    expectedVersion: planB.version,
    objects: [{ stallId: s3, x: 10, y: 10, width: 50, height: 50 }, { stallId: s2, x: 80, y: 10, width: 50, height: 50 }],
  });
  assert.equal(bulk.status, 409);
  assert.equal((await (await ctx.req("GET", `/floor-plan-layouts/${planB.id}`)).json()).objects.length, 0);

  // Re-pointing an existing object at another hall's stall is refused too.
  const own = await ctx.place(planB.id, planB.version, s3);
  assert.equal(own.status, 201);
  const objectId = (await own.json()).object.id as string;
  const repoint = await ctx.req("PATCH", `/floor-plan-layouts/${planB.id}/objects/${objectId}`, { expectedVersion: planB.version + 1, stallId: s1 });
  assert.equal(repoint.status, 409);
  assert.equal((await repoint.json()).code, "STALL_IN_OTHER_HALL");

  // While Hall A's plan is only a draft it still holds the stall; once published it keeps holding it.
  assert.equal((await ctx.publish(planA.id, planA.version)).status, 200);
  assert.equal((await ctx.place(planB.id, planB.version + 1, s1)).status, 409);

  // Move the stall: take it off Hall A's plan and publish, then Hall B can have it.
  const clone = await ctx.req("POST", `/floor-plan-layouts/${planA.id}/clone`);
  assert.equal(clone.status, 201);
  const draftA = (await clone.json()).floorPlan as { id: string; version: number };
  const draftDetail = await (await ctx.req("GET", `/floor-plan-layouts/${draftA.id}`)).json();
  const s1Object = draftDetail.objects.find((o: { stallId: string }) => o.stallId === s1);
  const removed = await ctx.req("DELETE", `/floor-plan-layouts/${draftA.id}/objects/${s1Object.id}?version=${draftA.version}`);
  assert.equal(removed.status, 204);
  assert.equal((await ctx.publish(draftA.id, draftA.version + 1)).status, 200);
  assert.equal((await ctx.place(planB.id, planB.version + 1, s1, 300)).status, 201);
});

test("plan names are unique per hall, not per exhibition", async () => {
  const ctx = await setup("phase34-names", 7, 0);
  const hallA = await ctx.createHall("Hall A");
  const hallB = await ctx.createHall("Hall B");
  await ctx.createPlan(hallA, "Floor");
  await ctx.createPlan(hallB, "Floor");
  const dup = await ctx.req("POST", "/floor-plan-layouts", { hallId: hallA, name: "Floor", canvasWidth: 500, canvasHeight: 500 });
  assert.equal(dup.status, 409);
  const unknownHall = await ctx.req("POST", "/floor-plan-layouts", { hallId: crypto.randomUUID(), name: "X", canvasWidth: 500, canvasHeight: 500 });
  assert.equal(unknownHall.status, 404);

  const onlyA = await (await ctx.req("GET", `/floor-plan-layouts?hallId=${hallA}`)).json();
  assert.equal(onlyA.floorPlans.length, 1);
  assert.equal(onlyA.floorPlans[0].hallId, hallA);
  assert.equal((await ctx.req("GET", "/floor-plan-layouts?hallId=bad%20id%20%25")).status, 200); // unknown id: empty, not an error
});

test("'Edit plan' is per hall: one hall's draft doesn't block another hall", async () => {
  const ctx = await setup("phase34-clone", 8, 2);
  const hallA = await ctx.createHall("Hall A");
  const hallB = await ctx.createHall("Hall B");
  const planA = await ctx.planWith(hallA, "Plan A", [ctx.stallIds[0]]);
  const planB = await ctx.planWith(hallB, "Plan B", [ctx.stallIds[1]]);
  assert.equal((await ctx.publish(planA.id, planA.version)).status, 200);
  assert.equal((await ctx.publish(planB.id, planB.version)).status, 200);

  const cloneA = await ctx.req("POST", `/floor-plan-layouts/${planA.id}/clone`);
  assert.equal(cloneA.status, 201);
  const cloneB = await ctx.req("POST", `/floor-plan-layouts/${planB.id}/clone`);
  assert.equal(cloneB.status, 201, "Hall B may have its own draft while Hall A has one");
  assert.equal((await cloneB.json()).floorPlan.name, "Plan B (draft)");

  const again = await ctx.req("POST", `/floor-plan-layouts/${planA.id}/clone`);
  assert.equal(again.status, 409);
  assert.equal((await again.json()).code, "FLOOR_PLAN_DRAFT_EXISTS");

  const hallsNow = await ctx.halls();
  assert.ok(hallsNow.every((h) => h.draftPlanId && h.publishedPlanId));
  const copies = (await ctx.plans()).filter((p) => p.name.endsWith("(draft)"));
  assert.deepEqual(new Set(copies.map((p) => p.hallId)), new Set([hallA, hallB]));
});

test("cloning an old plan is refused if its stalls now sit in another hall", async () => {
  const ctx = await setup("phase34-clone-moved", 9, 2);
  const [s1, s2] = ctx.stallIds;
  const hallA = await ctx.createHall("Hall A");
  const hallB = await ctx.createHall("Hall B");
  const old = await ctx.planWith(hallA, "Old", [s1, s2]);
  assert.equal((await ctx.publish(old.id, old.version)).status, 200);
  // Hall A moves on to a plan with only s2; the first plan is archived and s1 is free.
  const next = await ctx.planWith(hallA, "Next", [s2]);
  assert.equal((await ctx.publish(next.id, next.version)).status, 200);
  const planB = await ctx.planWith(hallB, "Plan B", [s1]);
  assert.equal((await ctx.publish(planB.id, planB.version)).status, 200);
  // Free Hall A's draft slot, then try to resurrect the archived plan that still lists s1.
  const clone = await ctx.req("POST", `/floor-plan-layouts/${old.id}/clone`);
  assert.equal(clone.status, 409);
  assert.equal((await clone.json()).code, "STALL_IN_OTHER_HALL");
  assert.equal((await ctx.plans()).filter((p) => p.hallId === hallA && p.status === "draft").length, 0, "nothing half-created");
});

test("a hall can be deleted unless its live plan has reserved or sold stalls", async () => {
  const ctx = await setup("phase34-delete", 10, 3);
  const [s1, s2, s3] = ctx.stallIds;
  const hallA = await ctx.createHall("Hall A");
  const hallB = await ctx.createHall("Hall B");
  const hallC = await ctx.createHall("Hall C");
  const planA = await ctx.planWith(hallA, "Plan A", [s1]);
  const planB = await ctx.planWith(hallB, "Plan B", [s2]);
  const planC = await ctx.planWith(hallC, "Plan C", [s3]);
  for (const p of [planA, planB, planC]) assert.equal((await ctx.publish(p.id, p.version)).status, 200);

  await prisma.stall.update({ where: { id: s2 }, data: { status: "reserved" } });
  const blocked = await ctx.req("DELETE", `/halls/${hallB}`);
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).code, "HALL_HAS_BOOKED_STALLS");
  assert.ok((await ctx.halls()).some((h) => h.id === hallB), "still there");

  const deleted = await ctx.req("DELETE", `/halls/${hallA}`);
  assert.equal(deleted.status, 200);
  const remaining = await ctx.plans();
  assert.ok(!remaining.some((p) => p.hallId === hallA), "its plans went with it");
  assert.ok(remaining.some((p) => p.hallId === hallB) && remaining.some((p) => p.hallId === hallC), "other halls untouched");
  assert.equal(await prisma.stall.count({ where: { id: s1 } }), 1, "the stall itself is kept");
  assert.equal((await ctx.req("DELETE", `/halls/${hallA}`)).status, 404);

  // The freed stall can be placed in another hall again.
  const draftC = await ctx.req("POST", `/floor-plan-layouts/${planC.id}/clone`);
  const c = (await draftC.json()).floorPlan as { id: string; version: number };
  assert.equal((await ctx.place(c.id, c.version, s1, 400)).status, 201);
});

test("readers return every hall's published plan in hall order", async () => {
  const ctx = await setup("phase34-readers", 11, 3);
  const hallB = await ctx.createHall("Zeta Hall");
  const hallA = await ctx.createHall("Alpha Hall");
  await ctx.req("PATCH", `/halls/${hallA}`, { sortOrder: 5 });
  const planB = await ctx.planWith(hallB, "B", [ctx.stallIds[0]]);
  const planA = await ctx.planWith(hallA, "A", [ctx.stallIds[1], ctx.stallIds[2]]);
  await ctx.createHall("Empty Hall"); // a hall with nothing published is simply absent
  assert.equal((await ctx.publish(planA.id, planA.version)).status, 200);
  assert.equal((await ctx.publish(planB.id, planB.version)).status, 200);

  const all = await getPublishedFloorPlans(ctx.exhibitionId);
  assert.deepEqual(all.map((p) => p.hall.name), ["Zeta Hall", "Alpha Hall"], "ordered by hall sortOrder, not name");
  assert.deepEqual(all.map((p) => p.objects.length), [1, 2]);
  assert.equal((await getPublishedFloorPlan(ctx.exhibitionId))!.hall.name, "Zeta Hall", "legacy reader = first hall");

  // Public endpoint: needs the paired event to be public and published.
  const exhibition = await prisma.exhibition.findUniqueOrThrow({ where: { id: ctx.exhibitionId }, select: { eventId: true } });
  assert.ok(exhibition.eventId);
  await prisma.event.update({ where: { id: exhibition.eventId }, data: { status: "PUBLISHED", visibility: "public" } });
  const res = await fetch(`${baseUrl}/api/public/exhibitions/${ctx.exhibitionId}/floor-plans`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.floorPlans.map((p: { hall: { name: string } }) => p.hall.name), ["Zeta Hall", "Alpha Hall"]);
  assert.equal(body.floorPlans[0].objects[0].stall.price, 5000);
  const single = await fetch(`${baseUrl}/api/public/exhibitions/${ctx.exhibitionId}/floor-plan`);
  assert.equal(single.status, 200);
  assert.equal((await single.json()).floorPlan.hall.name, "Zeta Hall");

  // With nothing published, the list is empty (not a 404) and the single route keeps its 404.
  const other = await setup("phase34-readers-empty", 12, 0);
  const otherEx = await prisma.exhibition.findUniqueOrThrow({ where: { id: other.exhibitionId }, select: { eventId: true } });
  await prisma.event.update({ where: { id: otherEx.eventId! }, data: { status: "PUBLISHED", visibility: "public" } });
  const empty = await fetch(`${baseUrl}/api/public/exhibitions/${other.exhibitionId}/floor-plans`);
  assert.equal(empty.status, 200);
  assert.deepEqual((await empty.json()).floorPlans, []);
  assert.equal((await fetch(`${baseUrl}/api/public/exhibitions/${other.exhibitionId}/floor-plan`)).status, 404);
});

test("halls are not reachable by another organizer", async () => {
  const ctx = await setup("phase34-tenant", 13, 1);
  const other = await setup("phase34-tenant-other", 14, 0);
  const hall = await ctx.createHall("Hall A");
  const plan = await ctx.planWith(hall, "Plan", [ctx.stallIds[0]]);

  assert.equal((await ctx.req("GET", "/halls", undefined, other.token)).status, 404);
  assert.equal((await ctx.req("POST", "/halls", { name: "Mine" }, other.token)).status, 404);
  assert.equal((await ctx.req("PATCH", `/halls/${hall}`, { name: "Mine" }, other.token)).status, 404);
  assert.equal((await ctx.req("DELETE", `/halls/${hall}`, undefined, other.token)).status, 404);
  assert.equal((await ctx.req("POST", "/floor-plan-layouts", { hallId: hall, name: "Z", canvasWidth: 100, canvasHeight: 100 }, other.token)).status, 404);

  // Another exhibition of the same organizer can't use this hall either.
  const foreignHall = await other.createHall("Their hall");
  const cross = await ctx.req("POST", "/floor-plan-layouts", { hallId: foreignHall, name: "Z", canvasWidth: 100, canvasHeight: 100 });
  assert.equal(cross.status, 404);
  assert.equal((await ctx.halls()).length, 1);
  assert.equal(plan.hallId, hall);
});

test("the database refuses a plan whose hall belongs to another exhibition", async () => {
  const ctx = await setup("phase34-fk", 15, 0);
  const other = await setup("phase34-fk-other", 16, 0);
  const foreignHall = await other.createHall("Their hall");
  await assert.rejects(
    prisma.$executeRawUnsafe(
      `INSERT INTO "floor_plans" (id, "exhibitionId", "hallId", name, status, version, "canvasWidth", "canvasHeight", "updatedAt")
       VALUES ($1, $2, $3, 'sneaky', 'draft', 1, 100, 100, CURRENT_TIMESTAMP)`,
      crypto.randomUUID(),
      ctx.exhibitionId,
      foreignHall
    )
  );
});
