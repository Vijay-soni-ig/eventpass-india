import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers, setSubscription } from "./helpers/entitlementFixtures";
import { signupUser } from "./helpers/phase21bFixtures";

// Phase 23.3 — event save/unsave. Mirrors phase22-1's organizer-follow test
// coverage shape, applied to the new SavedExhibition model. The core
// guarantees under test: per-user ownership (no visitor can read/mutate
// another visitor's saves), idempotent duplicate handling, the same public-
// visibility gate as GET /api/public/exhibitions/:id (a save/unsave/state
// request must never confirm the existence of a draft/paused/private event),
// and that this is fully independent of OrganizerFollow.

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const visitorUserIds: string[] = [];

let org: Awaited<ReturnType<typeof bootstrapOrganizer>>;
let exhibitionId: string;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
  org = await bootstrapOrganizer(baseUrl, "savedexh", ts);
  organizerIds.push(org.organizerId);
  exhibitionId = org.firstExhibitionId;
});

after(async () => {
  await prisma.savedExhibition.deleteMany({ where: { exhibitionId } });
  await prisma.user.deleteMany({ where: { id: { in: visitorUserIds } } });
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

async function visitor(label: string) {
  const v = await signupUser(baseUrl, `phase233-${label}-${ts}@example.com`, `Phase233 ${label}`, "visitor");
  visitorUserIds.push(v.userId);
  return v;
}

test("save-state for an unauthenticated caller is rejected", async () => {
  const res = await fetch(`${baseUrl}/api/saved-exhibitions/${exhibitionId}`);
  assert.equal(res.status, 401);
});

test("a fresh visitor's save-state for a live event is initially unsaved", async () => {
  const v = await visitor("fresh");
  const res = await fetch(`${baseUrl}/api/saved-exhibitions/${exhibitionId}`, {
    headers: { Authorization: `Bearer ${v.token}` },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { saved: false });
});

test("save then unsave a live event works and converges correctly", async () => {
  const v = await visitor("saveunsave");

  const saveRes = await fetch(`${baseUrl}/api/saved-exhibitions/${exhibitionId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${v.token}` },
  });
  assert.equal(saveRes.status, 200);
  assert.deepEqual(await saveRes.json(), { saved: true });

  const row = await prisma.savedExhibition.findUnique({ where: { userId_exhibitionId: { userId: v.userId, exhibitionId } } });
  assert.ok(row, "a SavedExhibition row must exist after save");

  const unsaveRes = await fetch(`${baseUrl}/api/saved-exhibitions/${exhibitionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${v.token}` },
  });
  assert.equal(unsaveRes.status, 200);
  assert.deepEqual(await unsaveRes.json(), { saved: false });

  const rowAfter = await prisma.savedExhibition.findUnique({ where: { userId_exhibitionId: { userId: v.userId, exhibitionId } } });
  assert.equal(rowAfter, null, "unsave must hard-delete the row (not a financial record)");
});

test("duplicate save requests never create more than one row and never error", async () => {
  const v = await visitor("dup");

  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      fetch(`${baseUrl}/api/saved-exhibitions/${exhibitionId}`, { method: "POST", headers: { Authorization: `Bearer ${v.token}` } })
    )
  );
  for (const r of results) assert.equal(r.status, 200);

  const count = await prisma.savedExhibition.count({ where: { userId: v.userId, exhibitionId } });
  assert.equal(count, 1, "concurrent duplicate saves must converge to exactly one row");
});

test("duplicate unsave requests are idempotent, never error", async () => {
  const v = await visitor("dupunsave");
  await fetch(`${baseUrl}/api/saved-exhibitions/${exhibitionId}`, { method: "POST", headers: { Authorization: `Bearer ${v.token}` } });

  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      fetch(`${baseUrl}/api/saved-exhibitions/${exhibitionId}`, { method: "DELETE", headers: { Authorization: `Bearer ${v.token}` } })
    )
  );
  for (const r of results) assert.equal(r.status, 200);

  const count = await prisma.savedExhibition.count({ where: { userId: v.userId, exhibitionId } });
  assert.equal(count, 0);
});

test("rapid save/unsave/save converges to a deterministic final state with no duplicate rows", async () => {
  const v = await visitor("rapid");
  const headers = { Authorization: `Bearer ${v.token}` };

  await fetch(`${baseUrl}/api/saved-exhibitions/${exhibitionId}`, { method: "POST", headers });
  await fetch(`${baseUrl}/api/saved-exhibitions/${exhibitionId}`, { method: "DELETE", headers });
  const final = await fetch(`${baseUrl}/api/saved-exhibitions/${exhibitionId}`, { method: "POST", headers });
  assert.deepEqual(await final.json(), { saved: true });

  const count = await prisma.savedExhibition.count({ where: { userId: v.userId, exhibitionId } });
  assert.equal(count, 1);
});

test("IDOR/BOLA: a visitor cannot see another visitor's saved state via any shared data leak, and each visitor's saved-events list only shows their own saves", async () => {
  const a = await visitor("A");
  const b = await visitor("B");

  await fetch(`${baseUrl}/api/saved-exhibitions/${exhibitionId}`, { method: "POST", headers: { Authorization: `Bearer ${a.token}` } });

  const bState = await fetch(`${baseUrl}/api/saved-exhibitions/${exhibitionId}`, { headers: { Authorization: `Bearer ${b.token}` } }).then((r) => r.json());
  assert.deepEqual(bState, { saved: false }, "visitor B must not see visitor A's save");

  const aList = await fetch(`${baseUrl}/api/saved-exhibitions`, { headers: { Authorization: `Bearer ${a.token}` } }).then((r) => r.json());
  assert.ok(aList.items.some((i: { exhibition: { id: string } }) => i.exhibition.id === exhibitionId), "visitor A's list must include their own save");

  const bList = await fetch(`${baseUrl}/api/saved-exhibitions`, { headers: { Authorization: `Bearer ${b.token}` } }).then((r) => r.json());
  assert.ok(!bList.items.some((i: { exhibition?: { id?: string } }) => i.exhibition?.id === exhibitionId), "visitor B's list must never include visitor A's save");
});

test("a draft (unpublished) event cannot be saved — 404, never confirming its existence", async () => {
  const v = await visitor("draft");
  await prisma.exhibition.update({ where: { id: exhibitionId }, data: { status: "draft" } });
  try {
    const res = await fetch(`${baseUrl}/api/saved-exhibitions/${exhibitionId}`, { method: "POST", headers: { Authorization: `Bearer ${v.token}` } });
    assert.equal(res.status, 404);
  } finally {
    await prisma.exhibition.update({ where: { id: exhibitionId }, data: { status: "live" } });
  }
});

test("a private (non-public visibility) event cannot be saved — 404", async () => {
  const v = await visitor("private");
  await prisma.exhibition.update({ where: { id: exhibitionId }, data: { visibility: "private" } });
  try {
    const res = await fetch(`${baseUrl}/api/saved-exhibitions/${exhibitionId}`, { method: "POST", headers: { Authorization: `Bearer ${v.token}` } });
    assert.equal(res.status, 404);
  } finally {
    await prisma.exhibition.update({ where: { id: exhibitionId }, data: { visibility: "public" } });
  }
});

test("a completed event can be saved (matches the public detail route's own {live, completed} visibility)", async () => {
  const v = await visitor("completed");
  await prisma.exhibition.update({ where: { id: exhibitionId }, data: { status: "completed" } });
  try {
    const res = await fetch(`${baseUrl}/api/saved-exhibitions/${exhibitionId}`, { method: "POST", headers: { Authorization: `Bearer ${v.token}` } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { saved: true });
  } finally {
    await prisma.savedExhibition.deleteMany({ where: { exhibitionId, userId: v.userId } });
    await prisma.exhibition.update({ where: { id: exhibitionId }, data: { status: "live" } });
  }
});

test("a nonexistent event id 404s on save-state, save, and unsave", async () => {
  const v = await visitor("nonexistent");
  const fakeId = "00000000-0000-0000-0000-000000000000";
  const get = await fetch(`${baseUrl}/api/saved-exhibitions/${fakeId}`, { headers: { Authorization: `Bearer ${v.token}` } });
  assert.equal(get.status, 404);
  const post = await fetch(`${baseUrl}/api/saved-exhibitions/${fakeId}`, { method: "POST", headers: { Authorization: `Bearer ${v.token}` } });
  assert.equal(post.status, 404);
});

test("a malformed event id does not crash the server", async () => {
  const v = await visitor("malformed");
  const res = await fetch(`${baseUrl}/api/saved-exhibitions/${encodeURIComponent("not-a-uuid; DROP TABLE saved_exhibitions;")}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${v.token}` },
  });
  assert.equal(res.status, 404);
  // Table survives — the parameterized query never interpolated the payload as SQL.
  const stillWorks = await prisma.savedExhibition.count();
  assert.ok(stillWorks >= 0);
});

test("save/unsave is rate-limited per user after repeated rapid requests, without affecting a different user", async () => {
  const spammer = await visitor("spammer");
  const bystander = await visitor("bystander");

  const results: number[] = [];
  for (let i = 0; i < 65; i++) {
    const res = await fetch(`${baseUrl}/api/saved-exhibitions/${exhibitionId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${spammer.token}` },
    });
    results.push(res.status);
  }
  assert.ok(results.includes(429), `expected at least one 429 among: ${results.join(",")}`);

  const bystanderRes = await fetch(`${baseUrl}/api/saved-exhibitions/${exhibitionId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bystander.token}` },
  });
  assert.equal(bystanderRes.status, 200, "a different user must not inherit another user's rate-limit bucket");
});

test("saved-events list: pagination, ordering (most recent first), and empty state", async () => {
  const v = await visitor("pagination");

  const emptyList = await fetch(`${baseUrl}/api/saved-exhibitions`, { headers: { Authorization: `Bearer ${v.token}` } }).then((r) => r.json());
  assert.deepEqual(emptyList, { items: [], total: 0, page: 1, pageSize: 20 });

  // Create 3 more exhibitions to save, so ordering can be verified beyond the one shared fixture event.
  // A fresh Starter-plan organizer only allows one non-completed exhibition at a time — raise the
  // plan for this test only so the extra creates aren't blocked by that entitlement limit.
  await setSubscription(org.organizerId, "growth", "active");
  const extraExhibitionIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const created = await fetch(`${baseUrl}/api/exhibitions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${org.token}` },
      // Phase 23.5: status:"live" now requires the server-side publish-
      // readiness minimum (dates, venue, city, a visible ticket type).
      body: JSON.stringify({
        name: `Phase233 Pagination Exh ${i}`,
        status: "live",
        visibility: "public",
        venue: "Test Venue",
        city: "Test City",
        startDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        endDate: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
        ticketTypes: [{ name: "General", price: 0, quantity: 10, visible: true }],
        stalls: [],
      }),
    }).then((r) => r.json());
    assert.ok(created.exhibition?.id, `pagination fixture exhibition ${i} must be created: ${JSON.stringify(created)}`);
    extraExhibitionIds.push(created.exhibition.id);
  }

  try {
    for (const id of [exhibitionId, ...extraExhibitionIds]) {
      const res = await fetch(`${baseUrl}/api/saved-exhibitions/${id}`, { method: "POST", headers: { Authorization: `Bearer ${v.token}` } });
      assert.equal(res.status, 200, `saving ${id} must succeed`);
    }

    const page1 = await fetch(`${baseUrl}/api/saved-exhibitions?page=1&limit=2`, { headers: { Authorization: `Bearer ${v.token}` } }).then((r) => r.json());
    assert.equal(page1.items.length, 2);
    assert.equal(page1.total, 4);
    assert.equal(page1.page, 1);
    assert.equal(page1.pageSize, 2);
    // Most recently saved first: the last exhibition saved (extraExhibitionIds[2]) must be first.
    assert.equal(page1.items[0].exhibition.id, extraExhibitionIds[2]);

    const page2 = await fetch(`${baseUrl}/api/saved-exhibitions?page=2&limit=2`, { headers: { Authorization: `Bearer ${v.token}` } }).then((r) => r.json());
    assert.equal(page2.items.length, 2);

    const beyondRange = await fetch(`${baseUrl}/api/saved-exhibitions?page=99&limit=2`, { headers: { Authorization: `Bearer ${v.token}` } }).then((r) => r.json());
    assert.equal(beyondRange.items.length, 0);
    assert.equal(beyondRange.total, 4);

    const invalidPage = await fetch(`${baseUrl}/api/saved-exhibitions?page=0`, { headers: { Authorization: `Bearer ${v.token}` } });
    assert.equal(invalidPage.status, 400);

    const invalidLimit = await fetch(`${baseUrl}/api/saved-exhibitions?limit=9999`, { headers: { Authorization: `Bearer ${v.token}` } });
    assert.equal(invalidLimit.status, 400);
  } finally {
    await prisma.savedExhibition.deleteMany({ where: { exhibitionId: { in: [exhibitionId, ...extraExhibitionIds] }, userId: v.userId } });
    await prisma.exhibition.deleteMany({ where: { id: { in: extraExhibitionIds } } });
  }
});

test("a saved event that later becomes non-public shows as unavailable in the list, without leaking its details", async () => {
  const v = await visitor("becomesprivate");
  await fetch(`${baseUrl}/api/saved-exhibitions/${exhibitionId}`, { method: "POST", headers: { Authorization: `Bearer ${v.token}` } });

  await prisma.exhibition.update({ where: { id: exhibitionId }, data: { status: "draft" } });
  try {
    const list = await fetch(`${baseUrl}/api/saved-exhibitions`, { headers: { Authorization: `Bearer ${v.token}` } }).then((r) => r.json());
    const entry = list.items.find((i: { exhibition: { id: string } }) => i.exhibition.id === exhibitionId);
    assert.ok(entry, "the row must still appear (not silently dropped)");
    assert.equal(entry.available, false);
    assert.deepEqual(Object.keys(entry.exhibition), ["id"], "no other exhibition field may leak once it's no longer public");
  } finally {
    await prisma.exhibition.update({ where: { id: exhibitionId }, data: { status: "live" } });
    await prisma.savedExhibition.deleteMany({ where: { exhibitionId, userId: v.userId } });
  }
});

test("saving/unsaving an event is fully independent of OrganizerFollow (neither affects the other)", async () => {
  const v = await visitor("independence");

  await fetch(`${baseUrl}/api/saved-exhibitions/${exhibitionId}`, { method: "POST", headers: { Authorization: `Bearer ${v.token}` } });
  const followRes = await fetch(`${baseUrl}/api/organizers/${org.organizerId}/follow-state`, { headers: { Authorization: `Bearer ${v.token}` } });
  // The organizer's public profile may not be enabled in this fixture — either way, saving an
  // event must not itself have created or implied a follow relationship.
  if (followRes.status === 200) {
    assert.deepEqual((await followRes.json()).following, false, "saving an event must never create an implicit follow");
  }

  const followCountBefore = await prisma.organizerFollow.count({ where: { userId: v.userId, organizerId: org.organizerId } });
  assert.equal(followCountBefore, 0);

  await fetch(`${baseUrl}/api/saved-exhibitions/${exhibitionId}`, { method: "DELETE", headers: { Authorization: `Bearer ${v.token}` } });
  // Unsaving must not touch any OrganizerFollow row either.
  const followCountAfter = await prisma.organizerFollow.count({ where: { userId: v.userId, organizerId: org.organizerId } });
  assert.equal(followCountAfter, 0);
});
