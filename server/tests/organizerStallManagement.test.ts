import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, createExhibition, cleanupOrganizers, setSubscription } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

function call(token: string, method: string, path: string, body?: unknown) {
  return fetch(baseUrl + path, {
    method,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("organizer stall create / edit / delete enforce lifecycle, duplicate-code and tenant rules", async () => {
  const owner = await bootstrapOrganizer(baseUrl, "stall-mgmt-owner", ts);
  const other = await bootstrapOrganizer(baseUrl, "stall-mgmt-other", ts);
  organizerIds.push(owner.organizerId, other.organizerId);
  await setSubscription(owner.organizerId, "enterprise", "active");
  await setSubscription(other.organizerId, "enterprise", "active");

  const created = await createExhibition(baseUrl, owner.token, "Stall Management Exhibition", {
    stalls: [
      { code: "A-01", price: 5000, stallType: "standard" },
      { code: "A-02", price: 6000, stallType: "premium" },
    ],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const exhibitionId = created.body.exhibition.id as string;
  const stalls = created.body.exhibition.stalls as Array<{ id: string; code: string }>;
  const a01 = stalls.find((s) => s.code === "A-01")!;
  const a02 = stalls.find((s) => s.code === "A-02")!;
  const base = `/api/exhibitions/${exhibitionId}/stalls`;

  // --- create ---
  const add = await call(owner.token, "POST", base, { code: "B-01", stallType: "basic", size: "3x3m", price: 3000 });
  assert.equal(add.status, 201, await add.clone().text());
  const b01 = (await add.json()).stall as { id: string; code: string; status: string };
  assert.equal(b01.status, "available");

  const dup = await call(owner.token, "POST", base, { code: " b-01 ", price: 100 });
  assert.equal(dup.status, 409, "duplicate code (case/space-insensitive) must be rejected");

  const badType = await call(owner.token, "POST", base, { stallType: "Standard", price: 100 });
  assert.equal(badType.status, 400, "capitalised stall type is not a valid enum value");

  // --- edit ---
  const priceEdit = await call(owner.token, "PUT", `${base}/${a01.id}`, { price: 5500 });
  assert.equal(priceEdit.status, 200, await priceEdit.clone().text());
  assert.equal(Number((await priceEdit.json()).stall.price), 5500);

  const statusEdit = await call(owner.token, "PUT", `${base}/${a01.id}`, { status: "sold" });
  assert.equal(statusEdit.status, 400, "organizers must not set booking state directly");
  assert.equal((await prisma.stall.findUniqueOrThrow({ where: { id: a01.id } })).status, "available");

  const emptyEdit = await call(owner.token, "PUT", `${base}/${a01.id}`, {});
  assert.equal(emptyEdit.status, 400);

  const missingEdit = await call(owner.token, "PUT", `${base}/00000000-0000-0000-0000-000000000000`, { price: 1 });
  assert.equal(missingEdit.status, 404);

  const dupEdit = await call(owner.token, "PUT", `${base}/${a01.id}`, { code: "a-02" });
  assert.equal(dupEdit.status, 409, "renaming onto an existing code must be rejected");

  // --- tenant isolation ---
  const crossPut = await call(other.token, "PUT", `${base}/${a01.id}`, { price: 1 });
  assert.equal(crossPut.status, 404);
  const crossDelete = await call(other.token, "DELETE", `${base}/${a01.id}`);
  assert.equal(crossDelete.status, 404);
  assert.equal(Number((await prisma.stall.findUniqueOrThrow({ where: { id: a01.id } })).price), 5500);

  // --- reserved stall: commercial edit and delete blocked ---
  await prisma.stall.update({ where: { id: a02.id }, data: { status: "reserved", reservedAt: new Date() } });
  const reservedEdit = await call(owner.token, "PUT", `${base}/${a02.id}`, { price: 1 });
  assert.equal(reservedEdit.status, 409);
  const reservedDelete = await call(owner.token, "DELETE", `${base}/${a02.id}`);
  assert.equal(reservedDelete.status, 409);
  assert.equal(await prisma.stall.count({ where: { id: a02.id } }), 1);

  // --- booking history: never deletable (would cascade-delete the booking record) ---
  const booking = await prisma.stallBooking.create({ data: { stallId: b01.id, exhibitionId, buyerName: "History Buyer", amountPaid: 0 } });
  const historyDelete = await call(owner.token, "DELETE", `${base}/${b01.id}`);
  assert.equal(historyDelete.status, 409);
  assert.equal(await prisma.stallBooking.count({ where: { id: booking.id } }), 1, "booking record must survive a rejected delete");
  const historyEdit = await call(owner.token, "PUT", `${base}/${b01.id}`, { price: 1 });
  assert.equal(historyEdit.status, 409);

  // --- floor plans: placement on a PUBLISHED plan blocks delete; a DRAFT plan does not ---
  // floor_plans.status is a TEXT column, so fixtures use raw SQL like the floor plan code does.
  const insertPlan = async (id: string, name: string, status: string) =>
    prisma.$executeRaw(Prisma.sql`INSERT INTO floor_plans (id, "exhibitionId", name, status, version, "canvasWidth", "canvasHeight", "updatedAt")
      VALUES (${id}, ${exhibitionId}, ${name}, ${status}, 1, 1000, 800, NOW())`);
  const insertObject = async (id: string, planId: string, stallId: string) =>
    prisma.$executeRaw(Prisma.sql`INSERT INTO floor_plan_objects (id, "floorPlanId", "stallId", x, y, width, height, "updatedAt")
      VALUES (${id}, ${planId}, ${stallId}, 10, 10, 100, 80, NOW())`);
  const c01 = (await (await call(owner.token, "POST", base, { code: "C-01", price: 100 })).json()).stall as { id: string };
  const c02 = (await (await call(owner.token, "POST", base, { code: "C-02", price: 100 })).json()).stall as { id: string };
  await insertPlan(`plan-pub-${ts}`, "Published Plan", "published");
  await insertPlan(`plan-draft-${ts}`, "Draft Plan", "draft");
  await insertObject(`obj-pub-${ts}`, `plan-pub-${ts}`, c01.id);
  await insertObject(`obj-draft-${ts}`, `plan-draft-${ts}`, c02.id);

  const publishedDelete = await call(owner.token, "DELETE", `${base}/${c01.id}`);
  assert.equal(publishedDelete.status, 409, "stall on a published floor plan must not be deletable");
  assert.equal(await prisma.stall.count({ where: { id: c01.id } }), 1);

  const draftDelete = await call(owner.token, "DELETE", `${base}/${c02.id}`);
  assert.equal(draftDelete.status, 204, "stall only on a draft plan can be deleted");
  assert.equal(await prisma.stall.count({ where: { id: c02.id } }), 0);
  const draftObjects = await prisma.$queryRaw<Array<{ n: number }>>(Prisma.sql`SELECT COUNT(*)::int AS n FROM floor_plan_objects WHERE id = ${`obj-draft-${ts}`}`);
  assert.equal(draftObjects[0].n, 0, "draft placement is removed with the stall (cascade)");

  // --- free stall: deletable once, then 404 ---
  const del = await call(owner.token, "DELETE", `${base}/${a01.id}`);
  assert.equal(del.status, 204);
  assert.equal(await prisma.stall.count({ where: { id: a01.id } }), 0);
  const delAgain = await call(owner.token, "DELETE", `${base}/${a01.id}`);
  assert.equal(delAgain.status, 404);

  // --- audit trail ---
  const actions = (await prisma.auditLog.findMany({ where: { entityType: "Stall", entityId: { in: [a01.id, b01.id] } }, select: { action: true } })).map((a) => a.action);
  assert.ok(actions.includes("stall.created"), "create is audited");
  assert.ok(actions.includes("stall.updated"), "update is audited");
  assert.ok(actions.includes("stall.deleted"), "delete is audited");
});
