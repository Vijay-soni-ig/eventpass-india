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

// Four organizers, each carrying only a bounded number of mutation requests
// — routes/exhibitionContent.ts's exhibitionMutationRateLimit is 30 per 15
// minutes PER USER (see middleware/rateLimit.ts), and this file's "capped at
// N items" tests alone issue 20+ requests each. Spreading tests across four
// organizers (mirroring tests/phase22gGallery.test.ts's own documented
// reasoning for the analogous organizer-gallery upload limiter) keeps every
// individual organizer's request count safely under that budget.
let orgA: Awaited<ReturnType<typeof bootstrapOrganizer>>;
let orgB: Awaited<ReturnType<typeof bootstrapOrganizer>>;
let orgC: Awaited<ReturnType<typeof bootstrapOrganizer>>;
let orgD: Awaited<ReturnType<typeof bootstrapOrganizer>>;
let exhibitionA: { id: string };
let exhibitionB: { id: string };
let exhibitionC: { id: string };
let exhibitionD: { id: string };
let visitor: { token: string; userId: string };

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
  orgA = await bootstrapOrganizer(baseUrl, "content-a", ts);
  orgB = await bootstrapOrganizer(baseUrl, "content-b", ts);
  orgC = await bootstrapOrganizer(baseUrl, "content-c", ts);
  orgD = await bootstrapOrganizer(baseUrl, "content-d", ts);
  organizerIds.push(orgA.organizerId, orgB.organizerId, orgC.organizerId, orgD.organizerId);
  await setSubscription(orgA.organizerId, "enterprise", "active");
  await setSubscription(orgB.organizerId, "enterprise", "active");
  await setSubscription(orgC.organizerId, "enterprise", "active");
  await setSubscription(orgD.organizerId, "enterprise", "active");

  const createdA = await createExhibition(baseUrl, orgA.token, `Content${ts} Exhibition A`, {
    status: "live", visibility: "public", city: "Mumbai",
    startDate: "2027-06-01", endDate: "2027-06-03",
  });
  exhibitionA = createdA.body.exhibition;
  const createdB = await createExhibition(baseUrl, orgB.token, `Content${ts} Exhibition B`, {
    status: "live", visibility: "public", city: "Delhi",
  });
  exhibitionB = createdB.body.exhibition;
  const createdC = await createExhibition(baseUrl, orgC.token, `Content${ts} Exhibition C`, {
    status: "live", visibility: "public", city: "Bengaluru",
  });
  exhibitionC = createdC.body.exhibition;
  const createdD = await createExhibition(baseUrl, orgD.token, `Content${ts} Exhibition D`, {
    status: "live", visibility: "public", city: "Hyderabad",
    startDate: "2027-06-01", endDate: "2027-06-03",
  });
  exhibitionD = createdD.body.exhibition;

  const v = await signupUser(baseUrl, `content-visitor-${ts}@test.com`, "Content Visitor", "visitor");
  visitor = { token: v.token, userId: v.userId };
  visitorUserIds.push(v.userId);
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [exhibitionA.id, exhibitionB.id, exhibitionC.id, exhibitionD.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: visitorUserIds } } });
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

function authHeaders(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

// =============================================================================
// FAQ — the simplest entity, used to thoroughly exercise the shared
// authorization/validation/reorder/soft-delete logic every other entity
// reuses identically.
// =============================================================================

test("organizer creates a FAQ for their own exhibition", async () => {
  const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionA.id}/faqs`, {
    method: "POST",
    headers: authHeaders(orgA.token),
    body: JSON.stringify({ question: "Is parking available?", answer: "Yes, on-site parking is available." }),
  });
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));
  assert.equal(body.item.question, "Is parking available?");
  assert.equal(body.item.active, true);
  assert.equal(body.item.sortOrder, 0);
});

test("a second FAQ gets the next sortOrder automatically", async () => {
  const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionA.id}/faqs`, {
    method: "POST",
    headers: authHeaders(orgA.token),
    body: JSON.stringify({ question: "How do I get a refund?", answer: "See our refund policy." }),
  });
  const body = await res.json();
  assert.equal(res.status, 201);
  assert.equal(body.item.sortOrder, 1);
});

test("empty question is rejected with a validation error", async () => {
  const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionA.id}/faqs`, {
    method: "POST",
    headers: authHeaders(orgA.token),
    body: JSON.stringify({ question: "", answer: "Something" }),
  });
  assert.equal(res.status, 400);
});

test("empty answer is rejected with a validation error", async () => {
  const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionA.id}/faqs`, {
    method: "POST",
    headers: authHeaders(orgA.token),
    body: JSON.stringify({ question: "Something?", answer: "" }),
  });
  assert.equal(res.status, 400);
});

test("an overlong question is rejected", async () => {
  const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionA.id}/faqs`, {
    method: "POST",
    headers: authHeaders(orgA.token),
    body: JSON.stringify({ question: "x".repeat(500), answer: "A" }),
  });
  assert.equal(res.status, 400);
});

test("Organizer B cannot create a FAQ on Organizer A's exhibition (cross-organizer, IDOR)", async () => {
  const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionA.id}/faqs`, {
    method: "POST",
    headers: authHeaders(orgB.token),
    body: JSON.stringify({ question: "Can I sneak this in?", answer: "No." }),
  });
  assert.equal(res.status, 404, "cross-organizer write must 404, not reveal the exhibition exists via 403");
});

test("Organizer B cannot view Organizer A's FAQ list", async () => {
  const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionA.id}/faqs`, { headers: authHeaders(orgB.token) });
  assert.equal(res.status, 404);
});

test("a plain visitor cannot create a FAQ at all", async () => {
  const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionA.id}/faqs`, {
    method: "POST",
    headers: authHeaders(visitor.token),
    body: JSON.stringify({ question: "Q", answer: "A" }),
  });
  assert.ok(res.status === 403 || res.status === 401, `expected 401/403, got ${res.status}`);
});

test("an unauthenticated request cannot create a FAQ", async () => {
  const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionA.id}/faqs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "Q", answer: "A" }),
  });
  assert.equal(res.status, 401);
});

test("an XSS-shaped question/answer is stored as inert plain text, never executed as HTML", async () => {
  const payload = "<script>alert(1)</script>";
  const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionA.id}/faqs`, {
    method: "POST",
    headers: authHeaders(orgA.token),
    body: JSON.stringify({ question: payload, answer: payload }),
  });
  const body = await res.json();
  assert.equal(res.status, 201);
  // Stored verbatim as a string — safe because the frontend renders it as
  // React text content (auto-escaped), never via dangerouslySetInnerHTML.
  assert.equal(body.item.question, payload);
  await fetch(`${baseUrl}/api/exhibitions/${exhibitionA.id}/faqs/${body.item.id}`, { method: "DELETE", headers: authHeaders(orgA.token) });
});

test("organizer reorders their own FAQs", async () => {
  const listRes = await fetch(`${baseUrl}/api/exhibitions/${exhibitionA.id}/faqs`, { headers: authHeaders(orgA.token) });
  const { items } = await listRes.json();
  const active = items.filter((i: { active: boolean }) => i.active);
  assert.ok(active.length >= 2);
  const reordered = [...active].reverse().map((item: { id: string }, idx: number) => ({ id: item.id, sortOrder: idx }));

  const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionA.id}/faqs/reorder`, {
    method: "PATCH",
    headers: authHeaders(orgA.token),
    body: JSON.stringify({ items: reordered }),
  });
  assert.equal(res.status, 204);

  const after = await fetch(`${baseUrl}/api/exhibitions/${exhibitionA.id}/faqs`, { headers: authHeaders(orgA.token) });
  const { items: afterItems } = await after.json();
  assert.equal(afterItems.find((i: { id: string }) => i.id === reordered[0].id).sortOrder, 0);
});

test("Organizer B cannot reorder Organizer A's FAQs by supplying A's real FAQ ids", async () => {
  const listRes = await fetch(`${baseUrl}/api/exhibitions/${exhibitionA.id}/faqs`, { headers: authHeaders(orgA.token) });
  const { items } = await listRes.json();
  const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionA.id}/faqs/reorder`, {
    method: "PATCH",
    headers: authHeaders(orgB.token),
    body: JSON.stringify({ items: [{ id: items[0].id, sortOrder: 5 }] }),
  });
  assert.equal(res.status, 404, "Organizer B doesn't manage exhibitionA at all, so this 404s before ownership-of-FAQ is even checked");
});

test("soft-deleting a FAQ sets active:false rather than removing the row", async () => {
  const createRes = await fetch(`${baseUrl}/api/exhibitions/${exhibitionA.id}/faqs`, {
    method: "POST",
    headers: authHeaders(orgA.token),
    body: JSON.stringify({ question: "Temp question", answer: "Temp answer" }),
  });
  const { item } = await createRes.json();

  const delRes = await fetch(`${baseUrl}/api/exhibitions/${exhibitionA.id}/faqs/${item.id}`, { method: "DELETE", headers: authHeaders(orgA.token) });
  assert.equal(delRes.status, 204);

  const row = await prisma.exhibitionFAQ.findUnique({ where: { id: item.id } });
  assert.ok(row, "row must still exist in the database — never hard-deleted");
  assert.equal(row!.active, false);
});

test("Organizer B cannot delete Organizer A's FAQ", async () => {
  const listRes = await fetch(`${baseUrl}/api/exhibitions/${exhibitionA.id}/faqs`, { headers: authHeaders(orgA.token) });
  const { items } = await listRes.json();
  const target = items.find((i: { active: boolean }) => i.active);
  const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionA.id}/faqs/${target.id}`, { method: "DELETE", headers: authHeaders(orgB.token) });
  assert.equal(res.status, 404);
  const row = await prisma.exhibitionFAQ.findUnique({ where: { id: target.id } });
  assert.equal(row!.active, true, "must remain untouched");
});

test("a soft-deleted (inactive) FAQ never appears in the public exhibition response", async () => {
  const publicRes = await fetch(`${baseUrl}/api/public/exhibitions/${exhibitionA.id}`);
  const { exhibition } = await publicRes.json();
  const questions = exhibition.faqs.map((f: { question: string }) => f.question);
  assert.ok(!questions.includes("Temp question"), "the soft-deleted FAQ from the earlier test must not be publicly visible");
  assert.ok(questions.includes("Is parking available?"), "an active FAQ must be publicly visible");
});

test("FAQ list is capped at a reasonable per-exhibition maximum", async () => {
  // Uses a dedicated organizer/exhibition (orgC) so this ~20-request loop
  // doesn't consume orgA's shared exhibitionMutationRateLimit budget.
  let lastStatus = 201;
  for (let i = 0; i < 20 && lastStatus === 201; i++) {
    const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionC.id}/faqs`, {
      method: "POST",
      headers: authHeaders(orgC.token),
      body: JSON.stringify({ question: `Bulk question ${i}`, answer: "Answer" }),
    });
    lastStatus = res.status;
  }
  const overflowRes = await fetch(`${baseUrl}/api/exhibitions/${exhibitionC.id}/faqs`, {
    method: "POST",
    headers: authHeaders(orgC.token),
    body: JSON.stringify({ question: "One too many", answer: "Answer" }),
  });
  assert.equal(overflowRes.status, 400);
});

// =============================================================================
// HIGHLIGHTS — verifies the controlled icon allow-list specifically.
// =============================================================================

test("organizer creates a highlight with a controlled icon key", async () => {
  const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionB.id}/highlights`, {
    method: "POST",
    headers: authHeaders(orgB.token),
    body: JSON.stringify({ title: "Live Product Demos", description: "See products in action.", iconKey: "zap" }),
  });
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));
  assert.equal(body.item.iconKey, "zap");
});

test("an arbitrary, non-allow-listed iconKey is rejected", async () => {
  const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionB.id}/highlights`, {
    method: "POST",
    headers: authHeaders(orgB.token),
    body: JSON.stringify({ title: "Something", iconKey: "<img onerror=alert(1)>" }),
  });
  assert.equal(res.status, 400);
});

test("highlights are capped at a reasonable per-exhibition maximum", async () => {
  // Dedicated organizer (orgD) — see the FAQ cap test's own comment.
  let lastStatus = 201;
  for (let i = 0; i < 8 && lastStatus === 201; i++) {
    const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionD.id}/highlights`, {
      method: "POST",
      headers: authHeaders(orgD.token),
      body: JSON.stringify({ title: `Highlight ${i}` }),
    });
    lastStatus = res.status;
  }
  const overflowRes = await fetch(`${baseUrl}/api/exhibitions/${exhibitionD.id}/highlights`, {
    method: "POST",
    headers: authHeaders(orgD.token),
    body: JSON.stringify({ title: "One too many" }),
  });
  assert.equal(overflowRes.status, 400);
});

// =============================================================================
// AUDIENCE — lightweight smoke test (shares the exact same authorization/
// validation/reorder machinery already thoroughly tested above via FAQ).
// =============================================================================

test("organizer creates, updates, and deactivates an audience entry", async () => {
  const createRes = await fetch(`${baseUrl}/api/exhibitions/${exhibitionB.id}/audience`, {
    method: "POST",
    headers: authHeaders(orgB.token),
    body: JSON.stringify({ name: "Healthcare Professionals", description: "Doctors, nurses, and administrators." }),
  });
  const { item } = await createRes.json();
  assert.equal(createRes.status, 201);

  const updateRes = await fetch(`${baseUrl}/api/exhibitions/${exhibitionB.id}/audience/${item.id}`, {
    method: "PATCH",
    headers: authHeaders(orgB.token),
    body: JSON.stringify({ name: "Healthcare & Pharma Professionals" }),
  });
  const { item: updated } = await updateRes.json();
  assert.equal(updateRes.status, 200);
  assert.equal(updated.name, "Healthcare & Pharma Professionals");

  const deactivateRes = await fetch(`${baseUrl}/api/exhibitions/${exhibitionB.id}/audience/${item.id}`, { method: "DELETE", headers: authHeaders(orgB.token) });
  assert.equal(deactivateRes.status, 204);
  const row = await prisma.exhibitionAudience.findUnique({ where: { id: item.id } });
  assert.equal(row!.active, false);
});

// =============================================================================
// SCHEDULE — validates the date-range sanity check specifically.
// =============================================================================

test("organizer creates a schedule entry within the exhibition's real dates", async () => {
  const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionD.id}/schedule`, {
    method: "POST",
    headers: authHeaders(orgD.token),
    body: JSON.stringify({ date: "2027-06-02", startTime: "10:00 AM", endTime: "6:00 PM", title: "Main Exhibition Day" }),
  });
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));
  assert.equal(body.item.title, "Main Exhibition Day");
});

test("a schedule date wildly outside the exhibition's real date range is rejected", async () => {
  const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionD.id}/schedule`, {
    method: "POST",
    headers: authHeaders(orgD.token),
    body: JSON.stringify({ date: "2030-01-01", title: "Unrelated date" }),
  });
  assert.equal(res.status, 400);
});

test("an invalid date string is rejected", async () => {
  const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionD.id}/schedule`, {
    method: "POST",
    headers: authHeaders(orgD.token),
    body: JSON.stringify({ date: "not-a-date", title: "Bad date" }),
  });
  assert.equal(res.status, 400);
});

// =============================================================================
// MEDIA — real multipart upload + MIME validation + public visibility.
// =============================================================================

function pngBlob() {
  return new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" });
}

test("organizer uploads a real gallery image via multipart", async () => {
  const form = new FormData();
  form.append("image", pngBlob(), "photo.png");
  form.append("altText", "Attendees at the exhibition hall");
  const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionA.id}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${orgA.token}` },
    body: form,
  });
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));
  assert.ok(body.item.imageUrl.includes("/uploads/exhibition-media/"));
  assert.equal(body.item.altText, "Attendees at the exhibition hall");
});

test("uploading a non-image file (disguised .txt) as media is rejected", async () => {
  const form = new FormData();
  form.append("image", new Blob(["not a real image"], { type: "text/plain" }), "notes.txt");
  const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionA.id}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${orgA.token}` },
    body: form,
  });
  assert.equal(res.status, 400);
});

test("Organizer B cannot upload media to Organizer A's exhibition", async () => {
  const form = new FormData();
  form.append("image", pngBlob(), "photo.png");
  const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionA.id}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${orgB.token}` },
    body: form,
  });
  assert.equal(res.status, 404);
});

test("an active gallery image is publicly visible on the exhibition detail response", async () => {
  const res = await fetch(`${baseUrl}/api/public/exhibitions/${exhibitionA.id}`);
  const { exhibition } = await res.json();
  assert.ok(exhibition.media.some((m: { altText: string }) => m.altText === "Attendees at the exhibition hall"));
});

test("deactivating a gallery image removes it from the public response but keeps the row", async () => {
  const listRes = await fetch(`${baseUrl}/api/exhibitions/${exhibitionA.id}/media`, { headers: authHeaders(orgA.token) });
  const { items } = await listRes.json();
  const target = items[0];

  const patchRes = await fetch(`${baseUrl}/api/exhibitions/${exhibitionA.id}/media/${target.id}`, {
    method: "PATCH",
    headers: authHeaders(orgA.token),
    body: JSON.stringify({ active: false }),
  });
  assert.equal(patchRes.status, 200);

  const publicRes = await fetch(`${baseUrl}/api/public/exhibitions/${exhibitionA.id}`);
  const { exhibition } = await publicRes.json();
  assert.ok(!exhibition.media.some((m: { id: string }) => m.id === target.id));

  const row = await prisma.exhibitionMedia.findUnique({ where: { id: target.id } });
  assert.ok(row, "row must still exist");
});

test("audit log records the FAQ creation actor and entity", async () => {
  const logs = await prisma.auditLog.findMany({
    where: { action: "exhibition.faq_added", actorUserId: orgA.userId },
    orderBy: { createdAt: "desc" },
  });
  const relevant = logs.filter((l) => (l.metadata as { exhibitionId?: string } | null)?.exhibitionId === exhibitionA.id);
  assert.ok(relevant.length > 0, `at least one FAQ-creation audit entry for exhibition A must exist; found ${logs.length} total for this actor`);
  assert.equal(relevant[0].actorUserId, orgA.userId);
  assert.equal(relevant[0].entityType, "ExhibitionFAQ");
});
