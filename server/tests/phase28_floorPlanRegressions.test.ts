import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, createStall, cleanupOrganizers, login } from "./helpers/entitlementFixtures";

const TEST_PASSWORD = "TestPassword123!";

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

async function createDraftPlan(token: string, exhibitionId: string, name: string, canvasWidth = 1000, canvasHeight = 700) {
  const res = await jsonRequest(`/api/exhibitions/${exhibitionId}/floor-plan-layouts`, token, {
    method: "POST",
    body: JSON.stringify({ name, canvasWidth, canvasHeight }),
  });
  assert.equal(res.status, 201, `plan creation must succeed: ${JSON.stringify(await res.clone().json())}`);
  const body = (await res.json()) as { floorPlan: { id: string } };
  return body.floorPlan.id;
}

test("floor plan regressions: out-of-bounds object is rejected with 400", async () => {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase28-bounds", ts);
  organizerIds.push(organizerId);
  const stall = await createStall(baseUrl, token, firstExhibitionId, 14000);
  assert.equal(stall.status, 201);
  const planId = await createDraftPlan(token, firstExhibitionId, "Bounds Hall");

  const addObject = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${planId}/objects`, token, {
    method: "POST",
    // canvas is 1000x700; x + width = 950 + 200 = 1150 > 1000 => out of bounds
    body: JSON.stringify({ stallId: stall.body.stall.id, x: 950, y: 100, width: 200, height: 120 }),
  });
  assert.equal(addObject.status, 400);
});

test("floor plan regressions: mapping the same stall twice on one plan is rejected with 409", async () => {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase28-dup-stall", ts + 1);
  organizerIds.push(organizerId);
  const stall = await createStall(baseUrl, token, firstExhibitionId, 14001);
  assert.equal(stall.status, 201);
  const planId = await createDraftPlan(token, firstExhibitionId, "Dup Stall Hall");

  const first = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${planId}/objects`, token, {
    method: "POST",
    body: JSON.stringify({ stallId: stall.body.stall.id, x: 10, y: 10, width: 100, height: 100 }),
  });
  assert.equal(first.status, 201);

  const duplicate = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${planId}/objects`, token, {
    method: "POST",
    body: JSON.stringify({ stallId: stall.body.stall.id, x: 300, y: 300, width: 100, height: 100 }),
  });
  assert.equal(duplicate.status, 409);
});

test("floor plan regressions: publishing a plan with zero mapped objects is rejected with 400", async () => {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase28-empty-publish", ts + 2);
  organizerIds.push(organizerId);
  const planId = await createDraftPlan(token, firstExhibitionId, "Empty Hall");

  const publish = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${planId}/publish`, token, { method: "POST", body: "{}" });
  assert.equal(publish.status, 400);
});

test("floor plan regressions: publishing a new draft archives the previously-published plan", async () => {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase28-republish", ts + 3);
  organizerIds.push(organizerId);
  const stallOne = await createStall(baseUrl, token, firstExhibitionId, 14002);
  const stallTwo = await createStall(baseUrl, token, firstExhibitionId, 14003);
  assert.equal(stallOne.status, 201);
  assert.equal(stallTwo.status, 201);

  const firstPlanId = await createDraftPlan(token, firstExhibitionId, "First Hall");
  const addFirstObject = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${firstPlanId}/objects`, token, {
    method: "POST",
    body: JSON.stringify({ stallId: stallOne.body.stall.id, x: 10, y: 10, width: 100, height: 100 }),
  });
  assert.equal(addFirstObject.status, 201);
  const firstPublish = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${firstPlanId}/publish`, token, { method: "POST", body: "{}" });
  assert.equal(firstPublish.status, 200);

  const secondPlanId = await createDraftPlan(token, firstExhibitionId, "Second Hall");
  const addSecondObject = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${secondPlanId}/objects`, token, {
    method: "POST",
    body: JSON.stringify({ stallId: stallTwo.body.stall.id, x: 10, y: 10, width: 100, height: 100 }),
  });
  assert.equal(addSecondObject.status, 201);
  const secondPublish = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${secondPlanId}/publish`, token, { method: "POST", body: "{}" });
  assert.equal(secondPublish.status, 200);

  const firstPlanGet = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${firstPlanId}`, token);
  const firstPlanBody = (await firstPlanGet.json()) as { floorPlan: { status: string } };
  assert.equal(firstPlanBody.floorPlan.status, "archived");

  const secondPlanGet = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${secondPlanId}`, token);
  const secondPlanBody = (await secondPlanGet.json()) as { floorPlan: { status: string } };
  assert.equal(secondPlanBody.floorPlan.status, "published");
});

test("floor plan regressions: editing or deleting an object on a non-draft plan is rejected with 409", async () => {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase28-nondraft-edit", ts + 4);
  organizerIds.push(organizerId);
  const stall = await createStall(baseUrl, token, firstExhibitionId, 14004);
  assert.equal(stall.status, 201);
  const planId = await createDraftPlan(token, firstExhibitionId, "Published Hall");

  const addObject = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${planId}/objects`, token, {
    method: "POST",
    body: JSON.stringify({ stallId: stall.body.stall.id, x: 10, y: 10, width: 100, height: 100 }),
  });
  assert.equal(addObject.status, 201);
  const addedObject = (await addObject.json()) as { object: { id: string } };

  const publish = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${planId}/publish`, token, { method: "POST", body: "{}" });
  assert.equal(publish.status, 200);

  const patch = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${planId}/objects/${addedObject.object.id}`, token, {
    method: "PATCH",
    body: JSON.stringify({ x: 20 }),
  });
  assert.equal(patch.status, 409);

  const del = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${planId}/objects/${addedObject.object.id}`, token, { method: "DELETE" });
  assert.equal(del.status, 404);
});

test("floor plan regressions: a user without access to the exhibition gets 404, not 403", async () => {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase28-rbac-owner", ts + 5);
  organizerIds.push(organizerId);
  const outsider = await bootstrapOrganizer(baseUrl, "phase28-rbac-outsider", ts + 6);
  organizerIds.push(outsider.organizerId);

  const planId = await createDraftPlan(token, firstExhibitionId, "Private Hall");

  const listAsOutsider = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts`, outsider.token);
  assert.equal(listAsOutsider.status, 404);

  const createAsOutsider = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts`, outsider.token, {
    method: "POST",
    body: JSON.stringify({ name: "Intruder Hall", canvasWidth: 500, canvasHeight: 500 }),
  });
  assert.equal(createAsOutsider.status, 404);

  const getAsOutsider = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${planId}`, outsider.token);
  assert.equal(getAsOutsider.status, 404);
});

test("public floor plan endpoint: 404 when exhibition has no published plan", async () => {
  const { organizerId, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase28-public-none", ts + 7);
  organizerIds.push(organizerId);

  const res = await fetch(`${baseUrl}/api/public/exhibitions/${firstExhibitionId}/floor-plan`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error, "No published floor plan");
});

test("public floor plan endpoint: 404 for a private exhibition even with a published plan", async () => {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase28-public-private", ts + 8);
  organizerIds.push(organizerId);
  const stall = await createStall(baseUrl, token, firstExhibitionId, 14005);
  assert.equal(stall.status, 201);
  const planId = await createDraftPlan(token, firstExhibitionId, "Hidden Hall");
  const addObject = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${planId}/objects`, token, {
    method: "POST",
    body: JSON.stringify({ stallId: stall.body.stall.id, x: 10, y: 10, width: 100, height: 100 }),
  });
  assert.equal(addObject.status, 201);
  const publish = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${planId}/publish`, token, { method: "POST", body: "{}" });
  assert.equal(publish.status, 200);

  // Flip the exhibition to private — the visibility gate must still apply
  // even though a published floor plan now exists underneath it.
  await prisma.exhibition.update({ where: { id: firstExhibitionId }, data: { visibility: "private" } });

  const res = await fetch(`${baseUrl}/api/public/exhibitions/${firstExhibitionId}/floor-plan`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error, "Exhibition not found");
});

test("public floor plan endpoint: 200 with expected shape once published, excluding buyer fields", async () => {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase28-public-ok", ts + 9);
  organizerIds.push(organizerId);
  const stall = await createStall(baseUrl, token, firstExhibitionId, 14006);
  assert.equal(stall.status, 201);
  const planId = await createDraftPlan(token, firstExhibitionId, "Public Hall", 1200, 800);
  const addObject = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${planId}/objects`, token, {
    method: "POST",
    body: JSON.stringify({ stallId: stall.body.stall.id, x: 15, y: 25, width: 150, height: 110, rotation: 90, zIndex: 3, labelVisible: false }),
  });
  assert.equal(addObject.status, 201);
  const publish = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${planId}/publish`, token, { method: "POST", body: "{}" });
  assert.equal(publish.status, 200);

  const res = await fetch(`${baseUrl}/api/public/exhibitions/${firstExhibitionId}/floor-plan`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    floorPlan: {
      id: string;
      name: string;
      canvasWidth: number;
      canvasHeight: number;
      backgroundUrl: string | null;
      publishedAt: string;
      objects: Array<{
        id: string;
        stallId: string;
        x: number;
        y: number;
        width: number;
        height: number;
        rotation: number;
        zIndex: number;
        labelVisible: boolean;
        stall: { id: string; code: string | null; stallType: string | null; price: number; status: string; buyerName?: string; buyerEmail?: string };
      }>;
    };
  };

  assert.equal(body.floorPlan.name, "Public Hall");
  assert.equal(body.floorPlan.canvasWidth, 1200);
  assert.equal(body.floorPlan.canvasHeight, 800);
  assert.ok(body.floorPlan.publishedAt);
  assert.equal(body.floorPlan.objects.length, 1);

  const [object] = body.floorPlan.objects;
  assert.equal(object.stallId, stall.body.stall.id);
  assert.equal(object.x, 15);
  assert.equal(object.y, 25);
  assert.equal(object.width, 150);
  assert.equal(object.height, 110);
  assert.equal(object.rotation, 90);
  assert.equal(object.zIndex, 3);
  assert.equal(object.labelVisible, false);
  assert.ok(object.stall);
  assert.equal(object.stall.id, stall.body.stall.id);
  assert.equal(typeof object.stall.price, "number");
  assert.equal(object.stall.status, "available");
  assert.equal(object.stall.buyerName, undefined);
  assert.equal(object.stall.buyerEmail, undefined);
});

test("floor plan regressions: editing a published (non-draft) plan itself is rejected with 409", async () => {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase28-plan-patch-published", ts + 10);
  organizerIds.push(organizerId);
  const stall = await createStall(baseUrl, token, firstExhibitionId, 14007);
  assert.equal(stall.status, 201);
  const planId = await createDraftPlan(token, firstExhibitionId, "Patch-After-Publish Hall");

  const addObject = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${planId}/objects`, token, {
    method: "POST",
    body: JSON.stringify({ stallId: stall.body.stall.id, x: 10, y: 10, width: 100, height: 100 }),
  });
  assert.equal(addObject.status, 201);

  const publish = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${planId}/publish`, token, { method: "POST", body: "{}" });
  assert.equal(publish.status, 200);

  // The plan itself (name/canvas size), not just its objects, must become
  // read-only once published.
  const patchPlan = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${planId}`, token, {
    method: "PATCH",
    body: JSON.stringify({ name: "Renamed After Publish" }),
  });
  assert.equal(patchPlan.status, 409);
});

test("floor plan regressions: an organizer member without exhibition:update (scanner role) cannot create, edit, or publish a floor plan", async () => {
  const { organizerId, organizerId: ownerOrganizerId, token: ownerToken, firstExhibitionId } = await bootstrapOrganizer(
    baseUrl,
    "phase28-rbac-scanner",
    ts + 11
  );
  organizerIds.push(organizerId);
  const stall = await createStall(baseUrl, ownerToken, firstExhibitionId, 14008);
  assert.equal(stall.status, 201);

  // A second real user, added to the SAME organizer with the "scanner" role
  // (exhibition:view only, no exhibition:update — see server/src/lib/permissions.ts).
  // Membership is created directly rather than through the invite/accept HTTP
  // flow, purely to keep this test focused on floor-plan authorization rather
  // than re-testing the invite flow itself (already covered elsewhere).
  const scannerEmail = `phase28-rbac-scanner-member-${ts + 11}@example.com`;
  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: scannerEmail, password: TEST_PASSWORD, fullName: "Scanner Member", userType: "exhibitor" }),
  }).then((r) => r.json());
  assert.ok(signup.user?.id, `scanner member signup must succeed: ${JSON.stringify(signup)}`);

  await prisma.organizerMembership.create({
    data: { organizerId: ownerOrganizerId, userId: signup.user.id, role: "scanner", status: "active" },
  });
  const scannerToken = await login(baseUrl, scannerEmail, TEST_PASSWORD);

  // A scanner CAN view (exhibition:view) ...
  const list = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts`, scannerToken);
  assert.equal(list.status, 200);

  // ... but cannot create, and therefore cannot edit or publish.
  const create = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts`, scannerToken, {
    method: "POST",
    body: JSON.stringify({ name: "Scanner Hall", canvasWidth: 500, canvasHeight: 500 }),
  });
  assert.equal(create.status, 404);

  // Even against a plan the OWNER already created, the scanner cannot map a
  // stall, update it, or publish it.
  const ownerPlanId = await createDraftPlan(ownerToken, firstExhibitionId, "Owner-Created Hall");
  const scannerAddObject = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${ownerPlanId}/objects`, scannerToken, {
    method: "POST",
    body: JSON.stringify({ stallId: stall.body.stall.id, x: 10, y: 10, width: 100, height: 100 }),
  });
  assert.equal(scannerAddObject.status, 404);

  const scannerPublish = await jsonRequest(`/api/exhibitions/${firstExhibitionId}/floor-plan-layouts/${ownerPlanId}/publish`, scannerToken, {
    method: "POST",
    body: "{}",
  });
  assert.equal(scannerPublish.status, 404);
});
