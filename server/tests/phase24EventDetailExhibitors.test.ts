import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers, applyAsExhibitor, approveParticipation } from "./helpers/entitlementFixtures";

// Phase 24 — Event Details Page 2.0's new public exhibitor directory
// (GET /api/public/exhibitions/:id/exhibitors). This must behave exactly
// like the existing event-detail route's own visibility gate (same 404 for
// draft/paused/private/nonexistent events, no enumeration signal) while
// additionally filtering by participation status: only `confirmed`
// exhibitors — a genuinely settled, real participant — may ever appear
// publicly. Never gst/pan/address/bankAccount*/suspended* from the business.

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];

let org: Awaited<ReturnType<typeof bootstrapOrganizer>>;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
  org = await bootstrapOrganizer(baseUrl, "eventdetailexh", ts);
  organizerIds.push(org.organizerId);
});

after(async () => {
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

test("an event with no confirmed exhibitors returns an empty, well-shaped list", async () => {
  const res = await fetch(`${baseUrl}/api/public/exhibitions/${org.firstExhibitionId}/exhibitors`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.exhibitors, []);
  assert.equal(body.total, 0);
});

test("only a confirmed participation is returned, with exactly the safe field set", async () => {
  const applied = await applyAsExhibitor(baseUrl, org.firstExhibitionId, "confirmed-flow", ts);
  await approveParticipation(baseUrl, org.token, org.firstExhibitionId, applied.participationId);
  await prisma.exhibitorBusiness.updateMany({
    where: { ownerId: applied.userId },
    data: { companyName: "Nimbus Robotics", businessType: "Robotics & Automation", logoUrl: "https://example.com/logo.png" },
  });
  await prisma.exhibitionExhibitor.update({
    where: { id: applied.participationId },
    data: { status: "confirmed", boothNumber: "A-02", confirmedAt: new Date() },
  });

  try {
    const res = await fetch(`${baseUrl}/api/public/exhibitions/${org.firstExhibitionId}/exhibitors`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.total, 1);
    assert.equal(body.exhibitors.length, 1);
    const row = body.exhibitors[0];
    assert.equal(row.boothNumber, "A-02");
    assert.deepEqual(Object.keys(row).sort(), ["boothNumber", "business", "id"].sort());
    assert.deepEqual(
      Object.keys(row.business).sort(),
      ["id", "companyName", "businessType", "logoUrl", "kycStatus"].sort(),
      "business summary must be exactly the safe field set, nothing more"
    );
    assert.equal(row.business.companyName, "Nimbus Robotics");
    for (const field of ["gst", "pan", "address", "bankAccountName", "bankAccountNumber", "bankIfsc", "suspended", "ownerId"]) {
      assert.equal(row.business[field], undefined, `business.${field} must never be exposed publicly`);
    }
  } finally {
    await prisma.exhibitionExhibitor.update({ where: { id: applied.participationId }, data: { status: "cancelled" } });
  }
});

test("an 'applied' (not yet approved) participation is never returned", async () => {
  const applied = await applyAsExhibitor(baseUrl, org.firstExhibitionId, "unconfirmed-flow", ts);
  const res = await fetch(`${baseUrl}/api/public/exhibitions/${org.firstExhibitionId}/exhibitors`);
  const body = await res.json();
  assert.ok(
    !body.exhibitors.some((e: { id: string }) => e.id === applied.participationId),
    "an applied-only participation must not appear in the public directory"
  );
});

test("a rejected participation is never returned", async () => {
  const applied = await applyAsExhibitor(baseUrl, org.firstExhibitionId, "rejected-flow", ts);
  await prisma.exhibitionExhibitor.update({ where: { id: applied.participationId }, data: { status: "rejected" } });
  const res = await fetch(`${baseUrl}/api/public/exhibitions/${org.firstExhibitionId}/exhibitors`);
  const body = await res.json();
  assert.ok(!body.exhibitors.some((e: { id: string }) => e.id === applied.participationId));
});

test("a suspended exhibitor business's confirmed participation is still safely field-scoped (suspended is never exposed)", async () => {
  const applied = await applyAsExhibitor(baseUrl, org.firstExhibitionId, "suspended-flow", ts);
  await approveParticipation(baseUrl, org.token, org.firstExhibitionId, applied.participationId);
  await prisma.exhibitorBusiness.updateMany({ where: { ownerId: applied.userId }, data: { suspended: true } });
  await prisma.exhibitionExhibitor.update({ where: { id: applied.participationId }, data: { status: "confirmed" } });

  try {
    const res = await fetch(`${baseUrl}/api/public/exhibitions/${org.firstExhibitionId}/exhibitors`);
    const body = await res.json();
    const row = body.exhibitors.find((e: { id: string }) => e.id === applied.participationId);
    assert.ok(row, "a confirmed participation is returned even if its business is later suspended");
    assert.equal(row.business.suspended, undefined);
  } finally {
    await prisma.exhibitionExhibitor.update({ where: { id: applied.participationId }, data: { status: "cancelled" } });
  }
});

test("a draft (unpublished) event's exhibitor directory 404s, same as its detail route", async () => {
  await prisma.exhibition.update({ where: { id: org.firstExhibitionId }, data: { status: "draft" } });
  try {
    const res = await fetch(`${baseUrl}/api/public/exhibitions/${org.firstExhibitionId}/exhibitors`);
    assert.equal(res.status, 404);
  } finally {
    await prisma.exhibition.update({ where: { id: org.firstExhibitionId }, data: { status: "live" } });
  }
});

test("a private (non-public visibility) event's exhibitor directory 404s", async () => {
  await prisma.exhibition.update({ where: { id: org.firstExhibitionId }, data: { visibility: "private" } });
  try {
    const res = await fetch(`${baseUrl}/api/public/exhibitions/${org.firstExhibitionId}/exhibitors`);
    assert.equal(res.status, 404);
  } finally {
    await prisma.exhibition.update({ where: { id: org.firstExhibitionId }, data: { visibility: "public" } });
  }
});

test("a nonexistent event id 404s without leaking whether it ever existed", async () => {
  const res = await fetch(`${baseUrl}/api/public/exhibitions/00000000-0000-0000-0000-000000000000/exhibitors`);
  assert.equal(res.status, 404);
});

test("pagination: page size is respected and total reflects only confirmed participations", async () => {
  const created: string[] = [];
  for (let i = 0; i < 3; i++) {
    const applied = await applyAsExhibitor(baseUrl, org.firstExhibitionId, `page-${i}`, ts);
    await approveParticipation(baseUrl, org.token, org.firstExhibitionId, applied.participationId);
    await prisma.exhibitionExhibitor.update({ where: { id: applied.participationId }, data: { status: "confirmed" } });
    created.push(applied.participationId);
  }

  try {
    const res = await fetch(`${baseUrl}/api/public/exhibitions/${org.firstExhibitionId}/exhibitors?page=1`);
    const body = await res.json();
    assert.ok(body.total >= 3);
    assert.equal(body.pageSize, 24);
    assert.ok(body.exhibitors.length <= body.pageSize);
  } finally {
    await prisma.exhibitionExhibitor.updateMany({ where: { id: { in: created } }, data: { status: "cancelled" } });
  }
});
