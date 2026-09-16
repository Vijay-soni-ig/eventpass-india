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
  const body = (await res.json()) as { floorPlan: { id: string } };
  return body.floorPlan.id;
}

async function mapStall(token: string, exhibitionId: string, planId: string, stallId: string) {
  const res = await jsonRequest(`/api/exhibitions/${exhibitionId}/floor-plan-layouts/${planId}/objects`, token, {
    method: "POST",
    body: JSON.stringify({ stallId, x: 10, y: 10, width: 100, height: 100 }),
  });
  assert.equal(res.status, 201, `stall mapping must succeed: ${JSON.stringify(await res.clone().json())}`);
}

async function publish(token: string, exhibitionId: string, planId: string) {
  const res = await jsonRequest(`/api/exhibitions/${exhibitionId}/floor-plan-layouts/${planId}/publish`, token, {
    method: "POST",
    body: "{}",
  });
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
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
  await mapStall(token, firstExhibitionId, planA, stallA.body.stall.id);
  await mapStall(token, firstExhibitionId, planB, stallB.body.stall.id);

  const results = await Promise.all([
    publish(token, firstExhibitionId, planA),
    publish(token, firstExhibitionId, planB),
  ]);

  // The database invariant is the authoritative assertion. Depending on the
  // transaction race, the losing request may surface as a conflict or a
  // database uniqueness error until the route maps that error explicitly.
  assert.ok(results.every((result) => [200, 409, 500].includes(result.status)), "publish requests should return an HTTP response");
  const published = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "floor_plans" WHERE "exhibitionId" = ${firstExhibitionId} AND status = 'published'
  `;
  assert.equal(published.length, 1, "exactly one floor plan may be published for an exhibition");
});
