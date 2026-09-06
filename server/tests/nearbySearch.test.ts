import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers, setSubscription, createExhibition } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const uniqueTag = `Nearby${ts}`;

// Real, public, well-known coordinates for actual Indian landmarks/cities —
// not fabricated event data, just fixed reference points to test distance
// math against. Gateway of India (Mumbai) and Pune are roughly 150km apart
// in reality; the server caps nearby search at a 200km radius (matching a
// realistic "nearby" concept), so both stay usable in these tests.
const GATEWAY_OF_INDIA = { lat: 18.9220, lng: 72.8347 };
const NEARBY_POINT = { lat: 18.9250, lng: 72.8300 }; // ~500m from Gateway of India
const PUNE = { lat: 18.5204, lng: 73.8567 }; // ~150km from Gateway of India

let orgA: Awaited<ReturnType<typeof bootstrapOrganizer>>;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
  orgA = await bootstrapOrganizer(baseUrl, "nearby-a", ts);
  organizerIds.push(orgA.organizerId);
  await setSubscription(orgA.organizerId, "enterprise", "active");

  await createExhibition(baseUrl, orgA.token, `${uniqueTag} Close Event`, {
    status: "live", visibility: "public", city: "Mumbai",
    latitude: NEARBY_POINT.lat, longitude: NEARBY_POINT.lng,
  });
  await createExhibition(baseUrl, orgA.token, `${uniqueTag} Far Event`, {
    status: "live", visibility: "public", city: "Delhi",
    latitude: PUNE.lat, longitude: PUNE.lng,
  });
  await createExhibition(baseUrl, orgA.token, `${uniqueTag} No Coordinates Event`, {
    status: "live", visibility: "public", city: "Mumbai",
  });
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: { in: organizerIds } } });
  await cleanupOrganizers(organizerIds);
  await stop();
});

test("a nearby search with a small radius returns only the close event, excludes the far one and the one with no coordinates", async () => {
  const res = await fetch(
    `${baseUrl}/api/public/discover?type=events&q=${encodeURIComponent(uniqueTag)}&lat=${GATEWAY_OF_INDIA.lat}&lng=${GATEWAY_OF_INDIA.lng}&radiusKm=5`
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  const names = body.items.map((e: { name: string }) => e.name);
  assert.ok(names.includes(`${uniqueTag} Close Event`));
  assert.ok(!names.includes(`${uniqueTag} Far Event`));
  assert.ok(!names.includes(`${uniqueTag} No Coordinates Event`));
});

test("widening the radius includes the far event too", async () => {
  const res = await fetch(
    `${baseUrl}/api/public/discover?type=events&q=${encodeURIComponent(uniqueTag)}&lat=${GATEWAY_OF_INDIA.lat}&lng=${GATEWAY_OF_INDIA.lng}&radiusKm=200`
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  const names = body.items.map((e: { name: string }) => e.name);
  assert.ok(names.includes(`${uniqueTag} Close Event`));
  assert.ok(names.includes(`${uniqueTag} Far Event`));
});

test("results are ranked by real distance — the closer event comes first", async () => {
  const res = await fetch(
    `${baseUrl}/api/public/discover?type=events&q=${encodeURIComponent(uniqueTag)}&lat=${GATEWAY_OF_INDIA.lat}&lng=${GATEWAY_OF_INDIA.lng}&radiusKm=200`
  );
  const body = await res.json();
  const closeIdx = body.items.findIndex((e: { name: string }) => e.name === `${uniqueTag} Close Event`);
  const farIdx = body.items.findIndex((e: { name: string }) => e.name === `${uniqueTag} Far Event`);
  assert.ok(closeIdx >= 0 && farIdx >= 0);
  assert.ok(closeIdx < farIdx, "closer event should rank before the farther one");
  // Real Haversine distance, roughly matching reality (a few km, not exactly 0).
  const closeItem = body.items[closeIdx];
  assert.ok(closeItem.distanceKm > 0 && closeItem.distanceKm < 5);
});

test("a partial nearby request (missing radiusKm) is treated as no nearby filter — normal search behavior", async () => {
  const res = await fetch(
    `${baseUrl}/api/public/discover?type=events&q=${encodeURIComponent(uniqueTag)}&lat=${GATEWAY_OF_INDIA.lat}&lng=${GATEWAY_OF_INDIA.lng}`
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  const names = body.items.map((e: { name: string }) => e.name);
  // All three (including the one with no coordinates) should be present —
  // nearby filtering never activated.
  assert.ok(names.includes(`${uniqueTag} Close Event`));
  assert.ok(names.includes(`${uniqueTag} Far Event`));
  assert.ok(names.includes(`${uniqueTag} No Coordinates Event`));
});

test("out-of-range latitude is rejected with 400, not silently clamped", async () => {
  const res = await fetch(`${baseUrl}/api/public/discover?type=events&lat=999&lng=0&radiusKm=10`);
  assert.equal(res.status, 400);
});

test("out-of-range longitude is rejected with 400", async () => {
  const res = await fetch(`${baseUrl}/api/public/discover?type=events&lat=0&lng=999&radiusKm=10`);
  assert.equal(res.status, 400);
});

test("a radius beyond the server-side cap is rejected with 400, not silently allowed", async () => {
  const res = await fetch(`${baseUrl}/api/public/discover?type=events&lat=0&lng=0&radiusKm=100000`);
  assert.equal(res.status, 400);
});

test("a negative radius is rejected with 400", async () => {
  const res = await fetch(`${baseUrl}/api/public/discover?type=events&lat=0&lng=0&radiusKm=-5`);
  assert.equal(res.status, 400);
});

test("creating an exhibition with an out-of-range latitude is rejected", async () => {
  const res = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgA.token}` },
    body: JSON.stringify({
      name: `${uniqueTag} Bad Coordinates`,
      venue: "Test Venue", city: "Test City",
      latitude: 999, longitude: 0,
    }),
  });
  assert.equal(res.status, 400);
});
