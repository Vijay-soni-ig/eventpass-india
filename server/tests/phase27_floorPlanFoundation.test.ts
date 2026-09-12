import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
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
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

test("floor plan foundation persists layout objects and publishes atomically", async () => {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase27-floor-plan", ts);
  organizerIds.push(organizerId);
  const stall = await createStall(baseUrl, token, firstExhibitionId, 12000);
  assert.equal(stall.status, 201);

  const create = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts`, token, {
    method: "POST",
    body: JSON.stringify({ name: "Main Hall", canvasWidth: 1000, canvasHeight: 700 }),
  });
  assert.equal(create.status, 201);
  const created = await create.json() as { floorPlan: { id: string } };

  const addObject = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${created.floorPlan.id}/objects`, token, {
    method: "POST",
    body: JSON.stringify({ stallId: stall.body.stall.id, x: 100, y: 100, width: 200, height: 120 }),
  });
  assert.equal(addObject.status, 201);

  const publish = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${created.floorPlan.id}/publish`, token, { method: "POST", body: "{}" });
  assert.equal(publish.status, 200);

  const persisted = await prisma.$queryRaw<Array<{ status: string; objectCount: bigint }>>(Prisma.sql`
    SELECT fp.status, (SELECT COUNT(*) FROM "floor_plan_objects" fpo WHERE fpo."floorPlanId" = fp.id) AS "objectCount"
    FROM "floor_plans" fp WHERE fp.id = ${created.floorPlan.id}
  `);
  assert.equal(persisted[0]?.status, "published");
  assert.equal(Number(persisted[0]?.objectCount), 1);
});

test("floor plan foundation rejects a stall from another exhibition", async () => {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase27-cross-tenant", ts + 1);
  organizerIds.push(organizerId);
  const second = await bootstrapOrganizer(baseUrl, "phase27-cross-tenant-2", ts + 2);
  organizerIds.push(second.organizerId);
  const foreignStall = await createStall(baseUrl, second.token, second.firstExhibitionId, 13000);
  assert.equal(foreignStall.status, 201);

  const create = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts`, token, {
    method: "POST",
    body: JSON.stringify({ name: "Cross Tenant Test", canvasWidth: 800, canvasHeight: 600 }),
  });
  assert.equal(create.status, 201);
  const created = await create.json() as { floorPlan: { id: string } };

  const addObject = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${created.floorPlan.id}/objects`, token, {
    method: "POST",
    body: JSON.stringify({ stallId: foreignStall.body.stall.id, x: 10, y: 10, width: 100, height: 100 }),
  });
  assert.equal(addObject.status, 400);
});
