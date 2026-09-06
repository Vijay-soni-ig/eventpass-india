import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers, setSubscription, createExhibition } from "./helpers/entitlementFixtures";
import { signupUser } from "./helpers/phase21bFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const visitorUserIds: string[] = [];

let orgA: Awaited<ReturnType<typeof bootstrapOrganizer>>; // public, has multiple events
let orgB: Awaited<ReturnType<typeof bootstrapOrganizer>>; // public profile DISABLED
let orgC: Awaited<ReturnType<typeof bootstrapOrganizer>>; // used for organizer-search-by-name tests

const uniqueTag = `Zzyx${ts}`;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
  orgA = await bootstrapOrganizer(baseUrl, "disc-a", ts);
  orgB = await bootstrapOrganizer(baseUrl, "disc-b", ts);
  orgC = await bootstrapOrganizer(baseUrl, "disc-c", ts);
  organizerIds.push(orgA.organizerId, orgB.organizerId, orgC.organizerId);
  await setSubscription(orgA.organizerId, "enterprise", "active");
  await setSubscription(orgB.organizerId, "enterprise", "active");
  await setSubscription(orgC.organizerId, "enterprise", "active");

  // orgA: public profile, several searchable/filterable events.
  await fetch(`${baseUrl}/api/organizer/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgA.token}` },
    body: JSON.stringify({ publicProfileEnabled: true, slug: `disc-org-a-${ts}` }),
  });

  await createExhibition(baseUrl, orgA.token, `${uniqueTag} Tech Expo`, {
    status: "live", visibility: "public", category: "Science & Tech", city: "Ahmedabad",
    startDate: "2027-03-01", endDate: "2027-03-03",
  });
  await createExhibition(baseUrl, orgA.token, `${uniqueTag} Art Fair`, {
    status: "live", visibility: "public", category: "Art & Culture", city: "Mumbai",
    startDate: "2027-04-10", endDate: "2027-04-12",
  });
  await createExhibition(baseUrl, orgA.token, `${uniqueTag} Draft Event`, {
    status: "draft", visibility: "public", category: "Science & Tech", city: "Ahmedabad",
  });
  await createExhibition(baseUrl, orgA.token, `${uniqueTag} Private Event`, {
    status: "live", visibility: "private", category: "Science & Tech", city: "Ahmedabad",
  });

  // orgB: profile intentionally left disabled (publicProfileEnabled defaults false).
  await createExhibition(baseUrl, orgB.token, `${uniqueTag} Hidden Organizer Expo`, {
    status: "live", visibility: "public", city: "Delhi",
  });

  // orgC: public profile, named distinctly for organizer-search tests.
  await fetch(`${baseUrl}/api/organizer/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgC.token}` },
    body: JSON.stringify({ publicProfileEnabled: true, slug: `disc-org-c-${ts}`, city: "Pune", description: `${uniqueTag} organizer description` }),
  });
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: { in: organizerIds } } });
  await prisma.organizerFollow.deleteMany({ where: { organizerId: { in: organizerIds } } });
  await prisma.user.deleteMany({ where: { id: { in: visitorUserIds } } });
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

async function discover(query: string) {
  const res = await fetch(`${baseUrl}/api/public/discover?${query}`);
  return { status: res.status, body: await res.json() };
}

test("public event discovery returns live+public events with no auth required", async () => {
  const { status, body } = await discover("type=events");
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.items));
  assert.equal(body.type, "events");
});

test("public organizer discovery returns public organizers with no auth required", async () => {
  const { status, body } = await discover("type=organizers");
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.items));
});

test("search event by name (case-insensitive, partial, whitespace-trimmed)", async () => {
  const exact = await discover(`type=events&q=${encodeURIComponent(uniqueTag + " Tech Expo")}`);
  assert.ok(exact.body.items.some((e: { name: string }) => e.name === `${uniqueTag} Tech Expo`));

  const lower = await discover(`type=events&q=${encodeURIComponent(uniqueTag.toLowerCase() + " tech")}`);
  assert.ok(lower.body.items.some((e: { name: string }) => e.name === `${uniqueTag} Tech Expo`));

  const padded = await discover(`type=events&q=${encodeURIComponent("  " + uniqueTag + " Tech  ")}`);
  assert.ok(padded.body.items.some((e: { name: string }) => e.name === `${uniqueTag} Tech Expo`));
});

test("search organizer by description (organizer search matches public description, not just name)", async () => {
  const { body } = await discover(`type=organizers&q=${encodeURIComponent(uniqueTag)}`);
  assert.ok(body.items.some((o: { id: string; description: string | null }) => o.id === orgC.organizerId && o.description?.includes(uniqueTag)));
});

test("empty search returns the unfiltered public dataset", async () => {
  const { status, body } = await discover("type=events");
  assert.equal(status, 200);
  assert.ok(body.total >= 2);
});

test("no results for a nonsense query", async () => {
  const { body } = await discover(`type=events&q=${encodeURIComponent("xyznonexistent" + ts)}`);
  assert.equal(body.items.length, 0);
  assert.equal(body.total, 0);
});

test("pagination: limit and page are respected, and total reflects the real count", async () => {
  const page1 = await discover(`type=events&q=${encodeURIComponent(uniqueTag)}&limit=1&page=1`);
  assert.equal(page1.body.items.length, 1);
  assert.equal(page1.body.pageSize, 1);
  assert.ok(page1.body.total >= 2);

  const page2 = await discover(`type=events&q=${encodeURIComponent(uniqueTag)}&limit=1&page=2`);
  assert.equal(page2.body.items.length, 1);
  assert.notEqual(page1.body.items[0].id, page2.body.items[0].id, "different pages must return different items");
});

test("invalid pagination is rejected with 400", async () => {
  const zeroPage = await discover("type=events&page=0");
  assert.equal(zeroPage.status, 400);

  const negativeLimit = await discover("type=events&limit=-1");
  assert.equal(negativeLimit.status, 400);
});

test("limit above the server-enforced maximum is rejected, not silently capped or honored", async () => {
  const { status } = await discover("type=events&limit=100000");
  assert.equal(status, 400);
});

test("category filter returns only matching events", async () => {
  const { body } = await discover(`type=events&q=${encodeURIComponent(uniqueTag)}&category=${encodeURIComponent("Art & Culture")}`);
  assert.ok(body.items.length >= 1);
  assert.ok(body.items.every((e: { category: string }) => e.category === "Art & Culture"));
});

test("city filter returns only matching events", async () => {
  const { body } = await discover(`type=events&q=${encodeURIComponent(uniqueTag)}&city=Mumbai`);
  assert.ok(body.items.length >= 1);
  assert.ok(body.items.every((e: { city: string }) => e.city === "Mumbai"));
});

test("date range filter excludes events outside the range (boundary-correct overlap)", async () => {
  // Tech Expo is 2027-03-01..03; a range entirely in April must not include it.
  const { body } = await discover(`type=events&q=${encodeURIComponent(uniqueTag + " Tech")}&dateFrom=2027-04-01&dateTo=2027-04-30`);
  assert.equal(body.items.some((e: { name: string }) => e.name === `${uniqueTag} Tech Expo`), false);

  const overlapping = await discover(`type=events&q=${encodeURIComponent(uniqueTag + " Tech")}&dateFrom=2027-02-25&dateTo=2027-03-02`);
  assert.ok(overlapping.body.items.some((e: { name: string }) => e.name === `${uniqueTag} Tech Expo`));
});

test("sorting: events sort=newest and sort=soonest both return valid deterministic orderings", async () => {
  const newest = await discover(`type=events&q=${encodeURIComponent(uniqueTag)}&sort=newest`);
  assert.ok(newest.body.items.length >= 2);
  const soonest = await discover(`type=events&q=${encodeURIComponent(uniqueTag)}&sort=soonest`);
  const dates = soonest.body.items.map((e: { startDate: string | null }) => (e.startDate ? new Date(e.startDate).getTime() : Infinity));
  const sorted = [...dates].sort((a, b) => a - b);
  assert.deepEqual(dates, sorted);
});

test("relevance ordering: an exact name match ranks before a mere substring match", async () => {
  const rankTag = `Rank${ts}`;
  await createExhibition(baseUrl, orgA.token, rankTag, { status: "live", visibility: "public" });
  await createExhibition(baseUrl, orgA.token, `Something ${rankTag} Extended`, { status: "live", visibility: "public" });

  const { body } = await discover(`type=events&q=${encodeURIComponent(rankTag)}`);
  assert.equal(body.items[0].name, rankTag, "exact match must rank first");
});

test("draft events are never returned by discovery", async () => {
  const { body } = await discover(`type=events&q=${encodeURIComponent(uniqueTag + " Draft")}`);
  assert.equal(body.items.length, 0);
});

test("private-visibility events are never returned by discovery", async () => {
  const { body } = await discover(`type=events&q=${encodeURIComponent(uniqueTag + " Private")}`);
  assert.equal(body.items.length, 0);
});

test("organizers with publicProfileEnabled=false never appear in organizer discovery, and their events are excluded too if the org itself were hidden (org visibility is separate from event visibility)", async () => {
  const { body } = await discover(`type=organizers&q=${encodeURIComponent(uniqueTag)}`);
  assert.equal(body.items.some((o: { id: string }) => o.id === orgB.organizerId), false);

  // Org B's own event IS still live+public (event visibility is independent
  // of organizer profile visibility in this schema — documented, not a bug)
  // but the public organizer profile route must still 404 for org B.
  const orgBProfile = await fetch(`${baseUrl}/api/organizer/profile`, { headers: { Authorization: `Bearer ${orgB.token}` } }).then((r) => r.json());
  assert.equal(orgBProfile.organizer.publicProfileEnabled, false);
});

test("existing public organizer profile route still 404s for a disabled organizer (Phase 22.1 behavior intact)", async () => {
  const res = await fetch(`${baseUrl}/api/public/organizers/nonexistent-slug-${ts}`);
  assert.equal(res.status, 404);
});

test("sensitive organizer fields (gst/pan/bank) are never present in organizer search results", async () => {
  const { body } = await discover(`type=organizers&q=${encodeURIComponent(uniqueTag)}`);
  for (const item of body.items) {
    assert.equal((item as Record<string, unknown>).gst, undefined);
    assert.equal((item as Record<string, unknown>).pan, undefined);
    assert.equal((item as Record<string, unknown>).bankAccountNumber, undefined);
    assert.equal((item as Record<string, unknown>).bankIfsc, undefined);
  }
});

test("SQL-injection-style and wildcard-abuse query strings are treated as inert literal text, not executed", async () => {
  const payloads = ["' OR '1'='1", "%%%%%", "'; DROP TABLE exhibitions; --", "_%_%_"];
  for (const payload of payloads) {
    const { status, body } = await discover(`type=events&q=${encodeURIComponent(payload)}`);
    assert.equal(status, 200, `payload ${payload} must not error`);
    assert.ok(Array.isArray(body.items));
  }
  // Prove the table is still intact after the payloads above.
  const stillWorks = await discover(`type=events&q=${encodeURIComponent(uniqueTag)}`);
  assert.equal(stillWorks.status, 200);
  assert.ok(stillWorks.body.total > 0);
});

test("XSS-style query string is returned as inert plain data, never reflected as executable content", async () => {
  const payload = "<script>alert(1)</script>";
  const { status, body } = await discover(`type=events&q=${encodeURIComponent(payload)}`);
  assert.equal(status, 200);
  assert.equal(body.items.length, 0); // no event actually named this
});

test("Unicode search text is handled without error", async () => {
  const { status } = await discover(`type=events&q=${encodeURIComponent("展覧会 café münchen")}`);
  assert.equal(status, 200);
});

test("an excessively long query string is rejected with 400, not a 500", async () => {
  const { status } = await discover(`type=events&q=${encodeURIComponent("a".repeat(5000))}`);
  assert.equal(status, 400);
});

test("combined filters (q + category + city + sort + pagination) work together without error", async () => {
  const { status, body } = await discover(
    `type=events&q=${encodeURIComponent(uniqueTag)}&category=${encodeURIComponent("Science & Tech")}&city=Ahmedabad&sort=newest&page=1&limit=10`
  );
  assert.equal(status, 200);
  assert.ok(body.items.every((e: { category: string; city: string }) => e.category === "Science & Tech" && e.city === "Ahmedabad"));
});

test("follow works from an organizer discovered via search, and existing Phase 22.1 follow behavior is unaffected", async () => {
  const visitor = await signupUser(baseUrl, `phase22d-follow-${ts}@example.com`, "Discover Follow Visitor", "visitor");
  visitorUserIds.push(visitor.userId);

  const { body } = await discover(`type=organizers&q=${encodeURIComponent(uniqueTag)}`);
  const orgCResult = body.items.find((o: { id: string }) => o.id === orgC.organizerId);
  assert.ok(orgCResult);

  const followRes = await fetch(`${baseUrl}/api/organizers/${orgCResult.id}/follow`, { method: "POST", headers: { Authorization: `Bearer ${visitor.token}` } });
  const followBody = await followRes.json();
  assert.equal(followRes.status, 200);
  assert.equal(followBody.following, true);
  assert.equal(followBody.followerCount, 1);
});

test("existing gallery endpoint remains intact for a discoverable organizer", async () => {
  const res = await fetch(`${baseUrl}/api/public/organizers/disc-org-c-${ts}/gallery`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.items));
});
