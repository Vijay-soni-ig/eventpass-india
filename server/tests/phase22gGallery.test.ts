import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";
import { signupUser } from "./helpers/phase21bFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const visitorUserIds: string[] = [];

// Two organizers, bootstrapped ONCE and reused across every test below —
// each test creates its own fresh gallery item(s) within them, so tests
// don't interfere with each other. Deliberately NOT one bootstrap per test:
// bootstrapOrganizer signs up a brand-new user, and this file's own process
// shares a single in-memory rate-limit store (see routes/auth.ts's
// authRateLimit, 20/15min per IP) across every test in the file — enough
// distinct tests each bootstrapping their own organizer would exceed it
// within one file, even though the full multi-file suite never does (each
// file is its own worker process with its own fresh limiter state).
// uploadRateLimit is 15/15min PER USER, so no single organizer below may be
// the uploader in more than ~10 of this file's requests — spread across
// four organizers rather than tightening the production limit to fit tests.
let orgA: Awaited<ReturnType<typeof bootstrapOrganizer>>;
let orgB: Awaited<ReturnType<typeof bootstrapOrganizer>>;
let orgC: Awaited<ReturnType<typeof bootstrapOrganizer>>;
let orgD: Awaited<ReturnType<typeof bootstrapOrganizer>>;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
  orgA = await bootstrapOrganizer(baseUrl, "gallery-a", ts);
  orgB = await bootstrapOrganizer(baseUrl, "gallery-b", ts);
  orgC = await bootstrapOrganizer(baseUrl, "gallery-c", ts);
  orgD = await bootstrapOrganizer(baseUrl, "gallery-d", ts);
  organizerIds.push(orgA.organizerId, orgB.organizerId, orgC.organizerId, orgD.organizerId);
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { entityType: "OrganizerGalleryMedia" } });
  await prisma.user.deleteMany({ where: { id: { in: visitorUserIds } } });
  // organizer_gallery_media rows cascade-delete with their Organizer.
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

function pngBlob() {
  return new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" });
}

async function uploadItem(token: string, caption?: string, altText?: string) {
  const form = new FormData();
  form.append("image", pngBlob(), "photo.png");
  if (caption) form.append("caption", caption);
  if (altText) form.append("altText", altText);
  const res = await fetch(`${baseUrl}/api/organizer/gallery`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, body: await res.json() };
}

test("organizer creates a gallery item via real multipart upload", async () => {
  const { status, body } = await uploadItem(orgA.token, "Opening day", "Crowd at the opening ceremony");
  assert.equal(status, 201, JSON.stringify(body));
  assert.ok(body.item.id);
  assert.equal(body.item.caption, "Opening day");
  assert.equal(body.item.altText, "Crowd at the opening ceremony");
  assert.equal(body.item.active, true);
  assert.equal(body.item.isFeatured, false);
  assert.ok(body.item.imageUrl.includes("/uploads/organizer-gallery/"));
  // Storage name is derived from userId+timestamp, never the client filename.
  assert.ok(!body.item.imageUrl.includes("photo.png"));
});

test("organizer reads their own gallery list", async () => {
  await uploadItem(orgA.token, "Read test 1");
  await uploadItem(orgA.token, "Read test 2");

  const res = await fetch(`${baseUrl}/api/organizer/gallery`, { headers: { Authorization: `Bearer ${orgA.token}` } });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.ok(body.items.length >= 2);
});

test("organizer updates gallery item caption/altText", async () => {
  const created = await uploadItem(orgA.token, "Old caption");

  const res = await fetch(`${baseUrl}/api/organizer/gallery/${created.body.item.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgA.token}` },
    body: JSON.stringify({ caption: "New caption" }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.item.caption, "New caption");
});

test("organizer archives a gallery item, and it moves from active to archived filter", async () => {
  const created = await uploadItem(orgA.token, "To be archived");

  const del = await fetch(`${baseUrl}/api/organizer/gallery/${created.body.item.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${orgA.token}` },
  });
  assert.equal(del.status, 204);

  const activeList = await fetch(`${baseUrl}/api/organizer/gallery?filter=active`, { headers: { Authorization: `Bearer ${orgA.token}` } }).then((r) => r.json());
  assert.equal(activeList.items.find((i: { id: string }) => i.id === created.body.item.id), undefined);

  const archivedList = await fetch(`${baseUrl}/api/organizer/gallery?filter=archived`, { headers: { Authorization: `Bearer ${orgA.token}` } }).then((r) => r.json());
  assert.ok(archivedList.items.some((i: { id: string }) => i.id === created.body.item.id));
});

test("organizer A cannot read, update, delete, feature, or reorder organizer B's gallery item (IDOR)", async () => {
  const createdA = await uploadItem(orgA.token, "Organizer A's photo");
  const itemId = createdA.body.item.id as string;

  const getRes = await fetch(`${baseUrl}/api/organizer/gallery/${itemId}`, { headers: { Authorization: `Bearer ${orgB.token}` } });
  assert.equal(getRes.status, 404, "B must not be able to read A's item");

  const patchRes = await fetch(`${baseUrl}/api/organizer/gallery/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgB.token}` },
    body: JSON.stringify({ caption: "hacked" }),
  });
  assert.equal(patchRes.status, 404, "B must not be able to update A's item");

  const featureRes = await fetch(`${baseUrl}/api/organizer/gallery/${itemId}/feature`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgB.token}` },
    body: JSON.stringify({ featured: true }),
  });
  assert.equal(featureRes.status, 404, "B must not be able to feature A's item");

  const deleteRes = await fetch(`${baseUrl}/api/organizer/gallery/${itemId}`, { method: "DELETE", headers: { Authorization: `Bearer ${orgB.token}` } });
  assert.equal(deleteRes.status, 404, "B must not be able to archive A's item");

  const reorderRes = await fetch(`${baseUrl}/api/organizer/gallery/reorder`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgB.token}` },
    body: JSON.stringify({ items: [{ id: itemId, sortOrder: 5 }] }),
  });
  assert.equal(reorderRes.status, 403, "B must not be able to reorder A's item");

  const bulkRes = await fetch(`${baseUrl}/api/organizer/gallery/bulk`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgB.token}` },
    body: JSON.stringify({ ids: [itemId], action: "archive" }),
  });
  assert.equal(bulkRes.status, 403, "B must not be able to bulk-archive A's item");

  // A's record is completely unchanged after all of B's attempts.
  const stillA = await prisma.organizerGalleryMedia.findUniqueOrThrow({ where: { id: itemId } });
  assert.equal(stillA.caption, "Organizer A's photo");
  assert.equal(stillA.isFeatured, false);
  assert.equal(stillA.archivedAt, null);
});

test("a malformed/nonexistent gallery id 404s cleanly", async () => {
  const res = await fetch(`${baseUrl}/api/organizer/gallery/not-a-real-id`, { headers: { Authorization: `Bearer ${orgA.token}` } });
  assert.equal(res.status, 404);
});

test("a pure visitor account cannot access the organizer gallery API at all", async () => {
  const { userId, token } = await signupUser(baseUrl, `phase22g-visitor-${ts}@example.com`, "Gallery Visitor", "visitor");
  visitorUserIds.push(userId);

  const res = await fetch(`${baseUrl}/api/organizer/gallery`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 403);

  const form = new FormData();
  form.append("image", pngBlob(), "x.png");
  const uploadRes = await fetch(`${baseUrl}/api/organizer/gallery`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  assert.equal(uploadRes.status, 403);
});

test("uploading an unsupported file type (e.g. text/plain) is rejected with a clean 400", async () => {
  const form = new FormData();
  form.append("image", new Blob(["not an image"], { type: "text/plain" }), "notes.txt");
  const res = await fetch(`${baseUrl}/api/organizer/gallery`, { method: "POST", headers: { Authorization: `Bearer ${orgA.token}` }, body: form });
  const body = await res.json();
  assert.equal(res.status, 400, JSON.stringify(body));
  assert.equal(typeof body.error, "string");
  assert.ok(!/stack|internal server error/i.test(body.error));
});

test("an SVG (unsafe MIME under this architecture) is rejected the same as any other unsupported type", async () => {
  const form = new FormData();
  form.append("image", new Blob(["<svg onload=alert(1)></svg>"], { type: "image/svg+xml" }), "evil.svg");
  const res = await fetch(`${baseUrl}/api/organizer/gallery`, { method: "POST", headers: { Authorization: `Bearer ${orgA.token}` }, body: form });
  assert.equal(res.status, 400);
});

test("oversized metadata (caption over the length limit) is rejected", async () => {
  const form = new FormData();
  form.append("image", pngBlob(), "photo.png");
  form.append("caption", "x".repeat(1000));
  const res = await fetch(`${baseUrl}/api/organizer/gallery`, { method: "POST", headers: { Authorization: `Bearer ${orgA.token}` }, body: form });
  assert.equal(res.status, 400);
});

test("an XSS-style payload in caption/altText is stored and returned as inert plain text", async () => {
  const payload = "<script>alert(1)</script>";

  const created = await uploadItem(orgA.token, payload, payload);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.item.caption, payload);
  assert.equal(created.body.item.altText, payload);
  // Not "sanitized" server-side — this project never renders gallery
  // metadata via dangerouslySetInnerHTML (React escapes on render), so
  // storing the literal string is safe; this test documents that contract.
});

test("feature image works, and only one gallery item can be featured at a time", async () => {
  const a = await uploadItem(orgA.token, "Feature A");
  const b = await uploadItem(orgA.token, "Feature B");

  const featureA = await fetch(`${baseUrl}/api/organizer/gallery/${a.body.item.id}/feature`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgA.token}` },
    body: JSON.stringify({ featured: true }),
  }).then((r) => r.json());
  assert.equal(featureA.item.isFeatured, true);

  const featureB = await fetch(`${baseUrl}/api/organizer/gallery/${b.body.item.id}/feature`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgA.token}` },
    body: JSON.stringify({ featured: true }),
  }).then((r) => r.json());
  assert.equal(featureB.item.isFeatured, true);

  const refreshedA = await prisma.organizerGalleryMedia.findUniqueOrThrow({ where: { id: a.body.item.id } });
  assert.equal(refreshedA.isFeatured, false, "featuring B must have unfeatured A");

  const featuredCount = await prisma.organizerGalleryMedia.count({ where: { organizerId: orgA.organizerId, isFeatured: true } });
  assert.equal(featuredCount, 1);
});

test("concurrency: 25 parallel feature requests across multiple images leave exactly one featured", async () => {
  const items = await Promise.all([
    uploadItem(orgB.token, "Conc 1"),
    uploadItem(orgB.token, "Conc 2"),
    uploadItem(orgB.token, "Conc 3"),
    uploadItem(orgB.token, "Conc 4"),
    uploadItem(orgB.token, "Conc 5"),
  ]);
  const ids = items.map((i) => i.body.item.id as string);

  const requests = Array.from({ length: 25 }, (_, i) =>
    fetch(`${baseUrl}/api/organizer/gallery/${ids[i % ids.length]}/feature`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgB.token}` },
      body: JSON.stringify({ featured: true }),
    })
  );
  const results = await Promise.all(requests);
  assert.ok(results.every((r) => r.status === 200));

  const featuredCount = await prisma.organizerGalleryMedia.count({ where: { organizerId: orgB.organizerId, isFeatured: true } });
  assert.equal(featuredCount, 1, "exactly one featured image must survive concurrent racing feature requests");
});

test("reorder works, and reordering with a foreign id is rejected without changing anything", async () => {
  const a1 = await uploadItem(orgC.token, "Reorder a1");
  const a2 = await uploadItem(orgC.token, "Reorder a2");
  const bItem = await uploadItem(orgD.token, "Reorder b1");

  const validReorder = await fetch(`${baseUrl}/api/organizer/gallery/reorder`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgC.token}` },
    body: JSON.stringify({
      items: [
        { id: a1.body.item.id, sortOrder: 101 },
        { id: a2.body.item.id, sortOrder: 100 },
      ],
    }),
  });
  assert.equal(validReorder.status, 200, JSON.stringify(await validReorder.json()));
  const a1After = await prisma.organizerGalleryMedia.findUniqueOrThrow({ where: { id: a1.body.item.id } });
  assert.equal(a1After.sortOrder, 101);

  const bBefore = await prisma.organizerGalleryMedia.findUniqueOrThrow({ where: { id: bItem.body.item.id } });
  const invalidReorder = await fetch(`${baseUrl}/api/organizer/gallery/reorder`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgC.token}` },
    body: JSON.stringify({ items: [{ id: bItem.body.item.id, sortOrder: 999 }] }),
  });
  assert.equal(invalidReorder.status, 403);
  const bUnchanged = await prisma.organizerGalleryMedia.findUniqueOrThrow({ where: { id: bItem.body.item.id } });
  assert.equal(bUnchanged.sortOrder, bBefore.sortOrder);
});

test("bulk archive applies to owned ids only, and rejects if any id is foreign", async () => {
  const a1 = await uploadItem(orgC.token, "Bulk a1");
  const a2 = await uploadItem(orgC.token, "Bulk a2");
  const bItem = await uploadItem(orgD.token, "Bulk b1");

  const ok = await fetch(`${baseUrl}/api/organizer/gallery/bulk`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgC.token}` },
    body: JSON.stringify({ ids: [a1.body.item.id, a2.body.item.id], action: "archive" }),
  });
  assert.equal(ok.status, 200, JSON.stringify(await ok.json()));
  const a1After = await prisma.organizerGalleryMedia.findUniqueOrThrow({ where: { id: a1.body.item.id } });
  assert.ok(a1After.archivedAt);

  const mixed = await fetch(`${baseUrl}/api/organizer/gallery/bulk`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgC.token}` },
    body: JSON.stringify({ ids: [bItem.body.item.id], action: "archive" }),
  });
  assert.equal(mixed.status, 403);
  const bUnchanged = await prisma.organizerGalleryMedia.findUniqueOrThrow({ where: { id: bItem.body.item.id } });
  assert.equal(bUnchanged.archivedAt, null);
});

test("inactive and archived images never appear on the public profile gallery, and public shape hides internal fields", async () => {
  const slug = `gallery-vis-${ts}`;
  await fetch(`${baseUrl}/api/organizer/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgC.token}` },
    body: JSON.stringify({ publicProfileEnabled: true, slug }),
  });

  const active = await uploadItem(orgC.token, "Publicly visible");
  const inactive = await uploadItem(orgC.token, "Hidden inactive");
  const archived = await uploadItem(orgC.token, "Hidden archived");
  await fetch(`${baseUrl}/api/organizer/gallery/${inactive.body.item.id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgC.token}` },
    body: JSON.stringify({ active: false }),
  });
  await fetch(`${baseUrl}/api/organizer/gallery/${archived.body.item.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${orgC.token}` } });

  const pub = await fetch(`${baseUrl}/api/public/organizers/${slug}/gallery`).then((r) => r.json());
  const ids = pub.items.map((i: { id: string }) => i.id);
  assert.ok(ids.includes(active.body.item.id));
  assert.ok(!ids.includes(inactive.body.item.id));
  assert.ok(!ids.includes(archived.body.item.id));

  const publicItem = pub.items.find((i: { id: string }) => i.id === active.body.item.id);
  assert.equal(publicItem.organizerId, undefined);
  assert.equal(publicItem.active, undefined);
  assert.equal(publicItem.archivedAt, undefined);
});

test("public gallery respects publicProfileEnabled=false (404s, not empty-list)", async () => {
  const slug = `gallery-disabled-${ts}`;
  await fetch(`${baseUrl}/api/organizer/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgD.token}` },
    body: JSON.stringify({ publicProfileEnabled: false, slug }),
  });
  await uploadItem(orgD.token, "should stay hidden");

  const res = await fetch(`${baseUrl}/api/public/organizers/${slug}/gallery`);
  assert.equal(res.status, 404);
});

test("audit log records gallery item add/update/feature/archive", async () => {
  const created = await uploadItem(orgC.token, "audited");
  const itemId = created.body.item.id as string;

  await fetch(`${baseUrl}/api/organizer/gallery/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgC.token}` },
    body: JSON.stringify({ caption: "audited v2" }),
  });
  await fetch(`${baseUrl}/api/organizer/gallery/${itemId}/feature`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgC.token}` },
    body: JSON.stringify({ featured: true }),
  });
  await fetch(`${baseUrl}/api/organizer/gallery/${itemId}`, { method: "DELETE", headers: { Authorization: `Bearer ${orgC.token}` } });

  const logs = await prisma.auditLog.findMany({ where: { entityType: "OrganizerGalleryMedia", entityId: itemId }, orderBy: { createdAt: "asc" } });
  const actions = logs.map((l) => l.action);
  assert.deepEqual(actions, [
    "organizer.gallery_item_added",
    "organizer.gallery_item_updated",
    "organizer.gallery_item_featured",
    "organizer.gallery_item_archived",
  ]);
});
