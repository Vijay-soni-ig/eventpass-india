import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

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
});

function request(path: string, token: string, method = "GET", body?: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("organizer can create, update, archive and restore exhibition add-ons", async () => {
  const organizer = await bootstrapOrganizer(baseUrl, "exh03a-addons", ts);
  organizerIds.push(organizer.organizerId);
  const base = `/api/exhibitions/${organizer.firstExhibitionId}/add-ons`;

  const createdResponse = await request(base, organizer.token, "POST", {
    name: "Power connection",
    description: "Dedicated electrical connection",
    price: 1250.5,
    maxQuantityPerBooking: 2,
    sortOrder: 1,
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json() as { addOn: { id: string; name: string; price: string; maxQuantityPerBooking: number; archivedAt: string | null } };
  assert.equal(created.addOn.name, "Power connection");
  assert.equal(Number(created.addOn.price), 1250.5);
  assert.equal(created.addOn.maxQuantityPerBooking, 2);
  assert.equal(created.addOn.archivedAt, null);

  const updatedResponse = await request(`${base}/${created.addOn.id}`, organizer.token, "PATCH", {
    price: 1500,
    maxQuantityPerBooking: 3,
  });
  assert.equal(updatedResponse.status, 200);
  const updated = await updatedResponse.json() as { addOn: { price: string; maxQuantityPerBooking: number } };
  assert.equal(Number(updated.addOn.price), 1500);
  assert.equal(updated.addOn.maxQuantityPerBooking, 3);

  const archiveResponse = await request(`${base}/${created.addOn.id}`, organizer.token, "DELETE");
  assert.equal(archiveResponse.status, 204);

  const activeListResponse = await request(base, organizer.token);
  const activeList = await activeListResponse.json() as { addOns: Array<{ id: string }> };
  assert.equal(activeList.addOns.some((item) => item.id === created.addOn.id), false);

  const archivedListResponse = await request(`${base}?includeArchived=true`, organizer.token);
  const archivedList = await archivedListResponse.json() as { addOns: Array<{ id: string; archivedAt: string | null; status: string }> };
  const archived = archivedList.addOns.find((item) => item.id === created.addOn.id);
  assert.ok(archived?.archivedAt);
  assert.equal(archived?.status, "inactive");

  const restoreResponse = await request(`${base}/${created.addOn.id}/restore`, organizer.token, "POST");
  assert.equal(restoreResponse.status, 200);
  const restored = await restoreResponse.json() as { addOn: { archivedAt: string | null; status: string } };
  assert.equal(restored.addOn.archivedAt, null);
  assert.equal(restored.addOn.status, "active");
});

test("add-on validation rejects invalid prices, quantities and availability windows", async () => {
  const organizer = await bootstrapOrganizer(baseUrl, "exh03a-validation", ts);
  organizerIds.push(organizer.organizerId);
  const base = `/api/exhibitions/${organizer.firstExhibitionId}/add-ons`;

  for (const body of [
    { name: "Negative price", price: -1 },
    { name: "Too many", price: 10, maxQuantityPerBooking: 51 },
    { name: "Reversed dates", price: 10, availableFrom: "2026-12-02T00:00:00.000Z", availableUntil: "2026-12-01T00:00:00.000Z" },
  ]) {
    const response = await request(base, organizer.token, "POST", body);
    assert.equal(response.status, 400);
  }
});

test("organizer cannot manage another organizer's exhibition add-ons", async () => {
  const owner = await bootstrapOrganizer(baseUrl, "exh03a-owner", ts);
  const other = await bootstrapOrganizer(baseUrl, "exh03a-other", ts);
  organizerIds.push(owner.organizerId, other.organizerId);
  const response = await request(`/api/exhibitions/${owner.firstExhibitionId}/add-ons`, other.token, "POST", {
    name: "Cross-tenant attempt",
    price: 10,
  });
  assert.equal(response.status, 404);
});
