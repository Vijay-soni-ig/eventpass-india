import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers, setSubscription, createExhibition } from "./helpers/entitlementFixtures";
import { signupUser } from "./helpers/phase21bFixtures";

// A1 (#926): exhibitionContent.test.ts proves cross-organizer isolation for
// FAQs only. The schedule, highlights and audience sections share the same
// helpers but had no section-specific coverage. This proves, per section, that
// another organizer, a cross-exhibition id, a plain visitor and an anonymous
// caller can neither read nor change the owner's items.

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const visitorUserIds: string[] = [];
let orgA: Awaited<ReturnType<typeof bootstrapOrganizer>>;
let orgB: Awaited<ReturnType<typeof bootstrapOrganizer>>;
let exhibitionA: { id: string };
let exhibitionB: { id: string };
let visitor: { token: string };

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
  orgA = await bootstrapOrganizer(baseUrl, "section-a", ts);
  orgB = await bootstrapOrganizer(baseUrl, "section-b", ts);
  organizerIds.push(orgA.organizerId, orgB.organizerId);
  await setSubscription(orgA.organizerId, "enterprise", "active");
  await setSubscription(orgB.organizerId, "enterprise", "active");
  exhibitionA = (await createExhibition(baseUrl, orgA.token, `Section${ts} A`, { status: "live", visibility: "public", city: "Mumbai", startDate: "2027-06-01", endDate: "2027-06-03" })).body.exhibition;
  exhibitionB = (await createExhibition(baseUrl, orgB.token, `Section${ts} B`, { status: "live", visibility: "public", city: "Delhi", startDate: "2027-06-01", endDate: "2027-06-03" })).body.exhibition;
  const v = await signupUser(baseUrl, `section-visitor-${ts}@test.com`, "Section Visitor", "visitor");
  visitor = { token: v.token };
  visitorUserIds.push(v.userId);
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [exhibitionA.id, exhibitionB.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: visitorUserIds } } });
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

const headers = (token: string) => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

type Section = {
  path: string;
  createBody: Record<string, unknown>;
  patchBody: Record<string, unknown>;
  readRow: (id: string) => Promise<Record<string, unknown> | null>;
};

const sections: Section[] = [
  {
    path: "schedule",
    createBody: { date: "2027-06-02", title: "Owner session", startTime: "10:00", endTime: "11:00" },
    patchBody: { title: "Hijacked session" },
    readRow: (id) => prisma.exhibitionSchedule.findUnique({ where: { id } }),
  },
  {
    path: "highlights",
    createBody: { title: "Owner highlight" },
    patchBody: { title: "Hijacked highlight" },
    readRow: (id) => prisma.exhibitionHighlight.findUnique({ where: { id } }),
  },
  {
    path: "audience",
    createBody: { name: "Owner audience" },
    patchBody: { name: "Hijacked audience" },
    readRow: (id) => prisma.exhibitionAudience.findUnique({ where: { id } }),
  },
];

for (const section of sections) {
  test(`${section.path}: another organizer cannot read, create, change, remove or reorder the owner's items`, async () => {
    const base = `${baseUrl}/api/exhibitions/${exhibitionA.id}/${section.path}`;
    const created = await fetch(base, { method: "POST", headers: headers(orgA.token), body: JSON.stringify(section.createBody) });
    assert.equal(created.status, 201, await created.clone().text());
    const itemId = (await created.json() as { item: { id: string } }).item.id;
    const before = await section.readRow(itemId);
    assert.ok(before);

    // Organizer B against A's exhibition: every verb 404s without revealing it exists.
    assert.equal((await fetch(base, { headers: headers(orgB.token) })).status, 404, "list");
    assert.equal((await fetch(base, { method: "POST", headers: headers(orgB.token), body: JSON.stringify(section.createBody) })).status, 404, "create");
    assert.equal((await fetch(`${base}/${itemId}`, { method: "PATCH", headers: headers(orgB.token), body: JSON.stringify(section.patchBody) })).status, 404, "patch");
    assert.equal((await fetch(`${base}/${itemId}`, { method: "DELETE", headers: headers(orgB.token) })).status, 404, "delete");
    assert.equal((await fetch(`${base}/reorder`, { method: "PATCH", headers: headers(orgB.token), body: JSON.stringify({ items: [{ id: itemId, sortOrder: 9 }] }) })).status, 404, "reorder");

    // Organizer B against B's OWN exhibition, smuggling A's item id: the item is
    // not in that exhibition, so it must neither be found nor reordered.
    const ownBase = `${baseUrl}/api/exhibitions/${exhibitionB.id}/${section.path}`;
    assert.equal((await fetch(`${ownBase}/${itemId}`, { method: "PATCH", headers: headers(orgB.token), body: JSON.stringify(section.patchBody) })).status, 404, "cross-exhibition patch");
    assert.equal((await fetch(`${ownBase}/reorder`, { method: "PATCH", headers: headers(orgB.token), body: JSON.stringify({ items: [{ id: itemId, sortOrder: 9 }] }) })).status, 403, "cross-exhibition reorder");

    // A plain visitor and an anonymous caller cannot write at all.
    assert.equal((await fetch(base, { method: "POST", headers: headers(visitor.token), body: JSON.stringify(section.createBody) })).status, 403, "visitor create");
    assert.equal((await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(section.createBody) })).status, 401, "anonymous create");

    // None of it changed the owner's row.
    const after = await section.readRow(itemId);
    assert.deepEqual(after, before, "denied attempts must leave the owner's item exactly as it was");
  });
}
