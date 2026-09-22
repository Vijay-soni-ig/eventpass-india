import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { publishFloorPlan } from "../src/lib/floorPlanPublish";
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

async function createDraftPlan(token: string, exhibitionId: string, name: string) {
  const res = await jsonRequest(`/api/exhibitions/${exhibitionId}/floor-plan-layouts`, token, {
    method: "POST",
    body: JSON.stringify({ name, canvasWidth: 1000, canvasHeight: 700 }),
  });
  assert.equal(res.status, 201, `plan creation must succeed: ${JSON.stringify(await res.clone().json())}`);
  const body = (await res.json()) as { floorPlan: { id: string; version: number } };
  return body.floorPlan;
}

async function mapStall(token: string, exhibitionId: string, planId: string, stallId: string, expectedVersion: number) {
  const res = await jsonRequest(`/api/exhibitions/${exhibitionId}/floor-plan-layouts/${planId}/objects`, token, {
    method: "POST",
    body: JSON.stringify({ expectedVersion, stallId, x: 10, y: 10, width: 100, height: 100 }),
  });
  assert.equal(res.status, 201, `stall mapping must succeed: ${JSON.stringify(await res.clone().json())}`);
  const body = await res.json() as { version: number };
  return body.version;
}

test("FP-07: concurrent floor-plan publishes cannot leave two plans published", async () => {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase29-publish-race", ts);
  organizerIds.push(organizerId);

  const stallA = await createStall(baseUrl, token, firstExhibitionId, 16001);
  const stallB = await createStall(baseUrl, token, firstExhibitionId, 16002);
  assert.equal(stallA.status, 201);
  assert.equal(stallB.status, 201);

  const planA = await createDraftPlan(token, firstExhibitionId, "Publish Race A");
  const planB = await createDraftPlan(token, firstExhibitionId, "Publish Race B");
  const versionA = await mapStall(token, firstExhibitionId, planA.id, stallA.body.stall.id, planA.version);
  const versionB = await mapStall(token, firstExhibitionId, planB.id, stallB.body.stall.id, planB.version);

  // Racing this over HTTP (two fetch() calls via Promise.all) doesn't
  // reliably produce genuine server-side overlap: connection setup and
  // response-round-trip jitter routinely let one request's entire lifecycle
  // finish before the other's handler even starts, which isn't actually the
  // scenario under test. Calling the underlying publish function directly
  // (as the route itself does) forces the two attempts to genuinely run
  // concurrently, the same way phase31_notificationDispatcher.test.ts races
  // its claim functions directly rather than through HTTP.
  const results = await Promise.allSettled([
    publishFloorPlan(firstExhibitionId, planA.id, versionA),
    publishFloorPlan(firstExhibitionId, planB.id, versionB),
  ]);

  const statuses = results
    .map((result) => (result.status === "fulfilled" ? 200 : ((result.reason as { status?: number })?.status ?? 500)))
    .sort((a, b) => a - b);
  assert.deepEqual(statuses, [200, 409], "exactly one concurrent publish should succeed and the other should receive a conflict");

  const published = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "floor_plans" WHERE "exhibitionId" = ${firstExhibitionId} AND status = 'published'
  `;
  assert.equal(published.length, 1, "exactly one floor plan may be published for an exhibition");
});
