import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers, setSubscription, createExhibition } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const uniqueTag = `CityDiscovery${ts}`;
let orgA: Awaited<ReturnType<typeof bootstrapOrganizer>>;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
  orgA = await bootstrapOrganizer(baseUrl, "city-discovery", ts);
  organizerIds.push(orgA.organizerId);
  await setSubscription(orgA.organizerId, "enterprise", "active");
  await createExhibition(baseUrl, orgA.token, `${uniqueTag} Mumbai Event`, {
    status: "live", visibility: "public", city: "Mumbai",
  });
  await createExhibition(baseUrl, orgA.token, `${uniqueTag} Delhi Event`, {
    status: "live", visibility: "public", city: "Delhi",
  });
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: { in: organizerIds } } });
  await cleanupOrganizers(organizerIds);
  await stop();
});

test("public discovery filters events by city without coordinate inputs", async () => {
  const res = await fetch(`${baseUrl}/api/public/discover?type=events&q=${encodeURIComponent(uniqueTag)}&city=Mumbai`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.items.length, 1);
  assert.match(body.items[0].name, /Mumbai Event/);
  assert.equal(body.items[0].city, "Mumbai");
  assert.equal("latitude" in body.items[0], false);
  assert.equal("longitude" in body.items[0], false);
});

test("legacy coordinate query parameters no longer affect discovery results", async () => {
  const res = await fetch(`${baseUrl}/api/public/discover?type=events&q=${encodeURIComponent(uniqueTag)}&lat=18.9220&lng=72.8347&radiusKm=5`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.items.length, 2);
  for (const item of body.items) {
    assert.equal("latitude" in item, false);
    assert.equal("longitude" in item, false);
  }
});
