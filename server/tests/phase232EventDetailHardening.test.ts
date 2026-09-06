import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers, markExhibitionCompleted } from "./helpers/entitlementFixtures";

// Phase 23.2 — the visitor event-detail audit found that
// GET /api/public/exhibitions/:id only ever matched status:"live", while the
// organizer public profile's own "Past Events" tab (GET
// /api/public/organizers/:slug/events?type=past) links visitors to exactly
// those same status:"completed" events via ExhibitionDetail's own URL shape
// (/exhibition/:id) — so every completed event was a dead link. These tests
// prove the fix (widening the detail route to {live, completed}) without
// loosening any other visibility rule: draft/paused/private events must
// remain exactly as invisible as before, and the newly-included `organizer`
// field must never carry anything beyond the same safe fields already
// exposed by GET /api/public/discover.

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];

let org: Awaited<ReturnType<typeof bootstrapOrganizer>>;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
  org = await bootstrapOrganizer(baseUrl, "detailhardening", ts);
  organizerIds.push(org.organizerId);
});

after(async () => {
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

test("a live public event's detail page loads and carries a safe organizer summary", async () => {
  const res = await fetch(`${baseUrl}/api/public/exhibitions/${org.firstExhibitionId}`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.exhibition.id, org.firstExhibitionId);
  assert.ok(body.exhibition.organizer, "organizer summary must be present");
  assert.deepEqual(
    Object.keys(body.exhibition.organizer).sort(),
    ["id", "kycStatus", "logoUrl", "name", "slug"].sort(),
    "organizer summary must be exactly the safe field set, nothing more"
  );
  for (const field of ["gst", "pan", "bankAccountName", "bankAccountNumber", "bankIfsc", "bankVerified", "email", "phone"]) {
    assert.equal(body.exhibition.organizer[field], undefined, `organizer.${field} must never be exposed publicly`);
  }
});

test("a completed event's detail page is reachable (previously 404, since the organizer's Past Events tab links here)", async () => {
  await markExhibitionCompleted(org.firstExhibitionId);
  try {
    const res = await fetch(`${baseUrl}/api/public/exhibitions/${org.firstExhibitionId}`);
    assert.equal(res.status, 200, "a completed public event must remain viewable by direct link");
    const body = await res.json();
    assert.equal(body.exhibition.status, "completed");
  } finally {
    await prisma.exhibition.update({ where: { id: org.firstExhibitionId }, data: { status: "live" } });
  }
});

test("a draft (unpublished) event's detail page still 404s — the status widening did not loosen draft visibility", async () => {
  await prisma.exhibition.update({ where: { id: org.firstExhibitionId }, data: { status: "draft" } });
  try {
    const res = await fetch(`${baseUrl}/api/public/exhibitions/${org.firstExhibitionId}`);
    assert.equal(res.status, 404);
  } finally {
    await prisma.exhibition.update({ where: { id: org.firstExhibitionId }, data: { status: "live" } });
  }
});

test("a paused event's detail page still 404s", async () => {
  await prisma.exhibition.update({ where: { id: org.firstExhibitionId }, data: { status: "paused" } });
  try {
    const res = await fetch(`${baseUrl}/api/public/exhibitions/${org.firstExhibitionId}`);
    assert.equal(res.status, 404);
  } finally {
    await prisma.exhibition.update({ where: { id: org.firstExhibitionId }, data: { status: "live" } });
  }
});

test("a private (non-public visibility) live event's detail page still 404s", async () => {
  await prisma.exhibition.update({ where: { id: org.firstExhibitionId }, data: { visibility: "private" } });
  try {
    const res = await fetch(`${baseUrl}/api/public/exhibitions/${org.firstExhibitionId}`);
    assert.equal(res.status, 404);
  } finally {
    await prisma.exhibition.update({ where: { id: org.firstExhibitionId }, data: { visibility: "public" } });
  }
});

test("a nonexistent event id 404s without leaking whether it ever existed", async () => {
  const res = await fetch(`${baseUrl}/api/public/exhibitions/00000000-0000-0000-0000-000000000000`);
  assert.equal(res.status, 404);
});

test("a malformed (non-UUID) event id does not crash the server, just 404s", async () => {
  const res = await fetch(`${baseUrl}/api/public/exhibitions/${encodeURIComponent("not-a-valid-id; DROP TABLE")}`);
  assert.equal(res.status, 404);
});

test("XSS: an event description containing a script tag is never executed — it's returned as plain data, not HTML", async () => {
  const payload = `<script>window.__xss=1</script>Come visit us`;
  await prisma.exhibition.update({ where: { id: org.firstExhibitionId }, data: { description: payload } });
  try {
    const res = await fetch(`${baseUrl}/api/public/exhibitions/${org.firstExhibitionId}`);
    const body = await res.json();
    // The API is a JSON endpoint — a literal <script> string in a JSON
    // field is inherently inert until a client renders it; the actual
    // guarantee (verified separately in ExhibitionDetail.tsx by inspection:
    // description is rendered via plain JSX text interpolation, never
    // dangerouslySetInnerHTML) is that this string round-trips unexecuted.
    assert.equal(body.exhibition.description, payload);
  } finally {
    await prisma.exhibition.update({ where: { id: org.firstExhibitionId }, data: { description: null } });
  }
});
