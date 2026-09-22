import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import {
  bootstrapOrganizer,
  createStall,
  cleanupOrganizers,
} from "./helpers/entitlementFixtures";

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

async function createDraftPlan(token: string, exhibitionId: string, name: string) {
  const res = await jsonRequest(`/api/exhibitions/${exhibitionId}/floor-plan-layouts`, token, {
    method: "POST",
    body: JSON.stringify({ name, canvasWidth: 1000, canvasHeight: 700 }),
  });
  assert.equal(res.status, 201, JSON.stringify(await res.clone().json()));
  const body = await res.json() as { floorPlan: { id: string; version: number } };
  return body.floorPlan;
}

async function addObject(token: string, exhibitionId: string, planId: string, stallId: string, expectedVersion: number) {
  return jsonRequest(`/api/exhibitions/${exhibitionId}/floor-plan-layouts/${planId}/objects`, token, {
    method: "POST",
    body: JSON.stringify({ expectedVersion, stallId, x: 10, y: 10, width: 100, height: 100 }),
  });
}

test("FP-08: concurrent object edits are optimistic-lock protected and exactly one writer wins", async () => {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase31-edit-race", ts);
  organizerIds.push(organizerId);

  const stall = await createStall(baseUrl, token, firstExhibitionId, 16000);
  assert.equal(stall.status, 201);
  const plan = await createDraftPlan(token, firstExhibitionId, "Edit Race Hall");

  const add = await addObject(token, firstExhibitionId, plan.id, stall.body.stall.id, plan.version);
  assert.equal(add.status, 201, JSON.stringify(await add.clone().json()));
  const addBody = await add.json() as { object: { id: string }; version: number };
  assert.equal(addBody.version, plan.version + 1);

  const [first, second] = await Promise.all([
    jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${plan.id}/objects/${addBody.object.id}`, token, {
      method: "PATCH",
      body: JSON.stringify({ expectedVersion: addBody.version, x: 200 }),
    }),
    jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${plan.id}/objects/${addBody.object.id}`, token, {
      method: "PATCH",
      body: JSON.stringify({ expectedVersion: addBody.version, x: 400 }),
    }),
  ]);

  const statuses = [first.status, second.status].sort((a, b) => a - b);
  assert.deepEqual(statuses, [200, 409]);

  const detail = await jsonRequest(
    `/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${plan.id}`,
    token
  );
  assert.equal(detail.status, 200);
  const detailBody = await detail.json() as {
    floorPlan: { version: number };
    objects: Array<{ x: number }>;
  };
  assert.equal(detailBody.floorPlan.version, addBody.version + 1);
  assert.ok([200, 400].includes(Number(detailBody.objects[0]?.x)));
});

test("FP-08: concurrent stall mapping with the same version cannot both commit", async () => {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase31-map-race", ts + 1);
  organizerIds.push(organizerId);

  const stallA = await createStall(baseUrl, token, firstExhibitionId, 16001);
  const stallB = await createStall(baseUrl, token, firstExhibitionId, 16002);
  assert.equal(stallA.status, 201);
  assert.equal(stallB.status, 201);

  const plan = await createDraftPlan(token, firstExhibitionId, "Map Race Hall");
  const [first, second] = await Promise.all([
    addObject(token, firstExhibitionId, plan.id, stallA.body.stall.id, plan.version),
    addObject(token, firstExhibitionId, plan.id, stallB.body.stall.id, plan.version),
  ]);

  const statuses = [first.status, second.status].sort((a, b) => a - b);
  assert.deepEqual(statuses, [201, 409]);

  const detail = await jsonRequest(
    `/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${plan.id}`,
    token
  );
  assert.equal(detail.status, 200);
  const body = await detail.json() as {
    floorPlan: { version: number };
    objects: Array<{ stallId: string }>;
  };
  assert.equal(body.floorPlan.version, plan.version + 1);
  assert.equal(body.objects.length, 1);
});

test("FP-08: stale publish is rejected after a draft edit", async () => {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase31-publish-stale", ts + 2);
  organizerIds.push(organizerId);

  const stall = await createStall(baseUrl, token, firstExhibitionId, 16003);
  assert.equal(stall.status, 201);
  const plan = await createDraftPlan(token, firstExhibitionId, "Stale Publish Hall");

  const add = await addObject(token, firstExhibitionId, plan.id, stall.body.stall.id, plan.version);
  assert.equal(add.status, 201);
  const addBody = await add.json() as { version: number };

  const stalePublish = await jsonRequest(
    `/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${plan.id}/publish`,
    token,
    { method: "POST", body: JSON.stringify({ expectedVersion: plan.version }) }
  );
  assert.equal(stalePublish.status, 409);

  const currentPublish = await jsonRequest(
    `/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${plan.id}/publish`,
    token,
    { method: "POST", body: JSON.stringify({ expectedVersion: addBody.version }) }
  );
  assert.equal(currentPublish.status, 200);
});
