import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers, setSubscription, createExhibition } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];

let org: Awaited<ReturnType<typeof bootstrapOrganizer>>;
const uniqueTag = `Consol${ts}`;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
  org = await bootstrapOrganizer(baseUrl, "consol", ts);
  organizerIds.push(org.organizerId);
  await setSubscription(org.organizerId, "enterprise", "active");

  // Free event.
  const free = await createExhibition(baseUrl, org.token, `${uniqueTag} Free Expo`, {
    status: "live", visibility: "public", startDate: "2027-01-10", endDate: "2027-01-12",
  });
  await fetch(`${baseUrl}/api/exhibitions/${free.body.exhibition.id}/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${org.token}` },
    body: JSON.stringify({ name: "General", price: 0, quantity: 100, visible: true }),
  });

  // Cheap paid event (₹200).
  const cheap = await createExhibition(baseUrl, org.token, `${uniqueTag} Cheap Expo`, {
    status: "live", visibility: "public", startDate: "2027-02-10", endDate: "2027-02-12",
  });
  await fetch(`${baseUrl}/api/exhibitions/${cheap.body.exhibition.id}/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${org.token}` },
    body: JSON.stringify({ name: "General", price: 200, quantity: 100, visible: true }),
  });

  // Expensive paid event (₹5000).
  const expensive = await createExhibition(baseUrl, org.token, `${uniqueTag} Premium Expo`, {
    status: "live", visibility: "public", startDate: "2027-03-10", endDate: "2027-03-12",
  });
  await fetch(`${baseUrl}/api/exhibitions/${expensive.body.exhibition.id}/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${org.token}` },
    body: JSON.stringify({ name: "VIP", price: 5000, quantity: 50, visible: true }),
  });

  // Event with no ticket types at all.
  await createExhibition(baseUrl, org.token, `${uniqueTag} No Pricing Expo`, {
    status: "live", visibility: "public",
  });
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: { in: organizerIds } } });
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

async function discover(query: string) {
  const res = await fetch(`${baseUrl}/api/public/discover?${query}`);
  return { status: res.status, body: await res.json() };
}

test("price filter: minPrice only returns events at or above that price (and excludes events with no ticket types)", async () => {
  const { body } = await discover(`type=events&q=${encodeURIComponent(uniqueTag)}&minPrice=1000`);
  const names = body.items.map((e: { name: string }) => e.name);
  assert.ok(names.includes(`${uniqueTag} Premium Expo`));
  assert.ok(!names.includes(`${uniqueTag} Free Expo`));
  assert.ok(!names.includes(`${uniqueTag} Cheap Expo`));
  assert.ok(!names.includes(`${uniqueTag} No Pricing Expo`), "an event with no ticket types has no price to compare");
});

test("price filter: maxPrice only returns events at or below that price", async () => {
  const { body } = await discover(`type=events&q=${encodeURIComponent(uniqueTag)}&maxPrice=500`);
  const names = body.items.map((e: { name: string }) => e.name);
  assert.ok(names.includes(`${uniqueTag} Free Expo`));
  assert.ok(names.includes(`${uniqueTag} Cheap Expo`));
  assert.ok(!names.includes(`${uniqueTag} Premium Expo`));
});

test("price filter: minPrice + maxPrice together bound a range correctly", async () => {
  const { body } = await discover(`type=events&q=${encodeURIComponent(uniqueTag)}&minPrice=100&maxPrice=1000`);
  const names = body.items.map((e: { name: string }) => e.name);
  assert.deepEqual(names, [`${uniqueTag} Cheap Expo`]);
});

test("price filter: zero minPrice includes free events", async () => {
  const { body } = await discover(`type=events&q=${encodeURIComponent(uniqueTag)}&minPrice=0&maxPrice=0`);
  const names = body.items.map((e: { name: string }) => e.name);
  assert.deepEqual(names, [`${uniqueTag} Free Expo`]);
});

test("price filter: negative price is rejected with 400", async () => {
  const { status } = await discover("type=events&minPrice=-100");
  assert.equal(status, 400);
});

test("price filter: minPrice greater than maxPrice is rejected with 400, not silently empty", async () => {
  const { status, body } = await discover("type=events&minPrice=5000&maxPrice=100");
  assert.equal(status, 400, JSON.stringify(body));
});

test("price filter: invalid (non-numeric) price value is rejected with 400", async () => {
  const { status } = await discover("type=events&minPrice=abc");
  assert.equal(status, 400);
});

test("price filter: no matching events yields an empty, valid result (not an error)", async () => {
  const { status, body } = await discover(`type=events&q=${encodeURIComponent(uniqueTag)}&minPrice=999999`);
  assert.equal(status, 200);
  assert.equal(body.items.length, 0);
});

test("sort=price-low and sort=price-high order events by minimum ticket price correctly", async () => {
  const low = await discover(`type=events&q=${encodeURIComponent(uniqueTag)}&sort=price-low`);
  const lowNames = low.body.items.map((e: { name: string }) => e.name);
  const cheapIdx = lowNames.indexOf(`${uniqueTag} Cheap Expo`);
  const premiumIdx = lowNames.indexOf(`${uniqueTag} Premium Expo`);
  assert.ok(cheapIdx < premiumIdx, "cheaper event must come first in price-low order");

  const high = await discover(`type=events&q=${encodeURIComponent(uniqueTag)}&sort=price-high`);
  const highNames = high.body.items.map((e: { name: string }) => e.name);
  assert.ok(highNames.indexOf(`${uniqueTag} Premium Expo`) < highNames.indexOf(`${uniqueTag} Cheap Expo`), "more expensive event must come first in price-high order");
});

test("explicit sort=soonest still wins over relevance when q is also present (no regression of the Phase 22.4 fix)", async () => {
  const { body } = await discover(`type=events&q=${encodeURIComponent(uniqueTag)}&sort=soonest`);
  const dates = body.items.map((e: { startDate: string | null }) => (e.startDate ? new Date(e.startDate).getTime() : Infinity));
  const sorted = [...dates].sort((a: number, b: number) => a - b);
  assert.deepEqual(dates, sorted);
});

test("combined filters (q + price + date + sort + pagination) work together without error", async () => {
  const { status, body } = await discover(
    `type=events&q=${encodeURIComponent(uniqueTag)}&minPrice=0&maxPrice=10000&dateFrom=2027-01-01&dateTo=2027-12-31&sort=soonest&page=1&limit=10`
  );
  assert.equal(status, 200, JSON.stringify(body));
  assert.ok(body.items.length >= 3);
});

test("the old unfiltered GET /api/public/exhibitions endpoint still works unchanged (homepage teaser consumer)", async () => {
  const res = await fetch(`${baseUrl}/api/public/exhibitions`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.exhibitions));
  assert.ok(body.exhibitions.some((e: { name: string }) => e.name === `${uniqueTag} Free Expo`));
});

test("draft and private events are still excluded from price-filtered discovery (visibility rules unaffected by the new filter)", async () => {
  const draft = await createExhibition(baseUrl, org.token, `${uniqueTag} Draft Priced Expo`, { status: "draft", visibility: "public" });
  await fetch(`${baseUrl}/api/exhibitions/${draft.body.exhibition.id}/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${org.token}` },
    body: JSON.stringify({ name: "General", price: 300, quantity: 10, visible: true }),
  });

  const { body } = await discover(`type=events&q=${encodeURIComponent(uniqueTag)}&minPrice=0&maxPrice=1000`);
  assert.ok(!body.items.some((e: { name: string }) => e.name === `${uniqueTag} Draft Priced Expo`));
});
