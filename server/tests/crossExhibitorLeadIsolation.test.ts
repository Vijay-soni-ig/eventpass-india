import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import {
  bootstrapOrganizer,
  applyAsExhibitor,
  cleanupOrganizers,
} from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

test("exhibitor cannot read, list, or update another business's lead", async () => {
  const ownerOrganizer = await bootstrapOrganizer(baseUrl, `lead-owner-organizer-${ts}`, ts);
  organizerIds.push(ownerOrganizer.organizerId);
  const otherOrganizer = await bootstrapOrganizer(baseUrl, `lead-other-organizer-${ts}`, ts);
  organizerIds.push(otherOrganizer.organizerId);

  const ownerExhibitor = await applyAsExhibitor(
    baseUrl,
    ownerOrganizer.firstExhibitionId,
    `lead-owner-${ts}`,
    ts,
  );
  const otherExhibitor = await applyAsExhibitor(
    baseUrl,
    otherOrganizer.firstExhibitionId,
    `lead-other-${ts}`,
    ts,
  );

  const ownerBusiness = await prisma.exhibitorBusiness.findUniqueOrThrow({
    where: { ownerId: ownerExhibitor.userId },
    select: { id: true },
  });
  const ownerParticipation = await prisma.exhibitionExhibitor.update({
    where: { id: ownerExhibitor.participationId },
    data: { status: "confirmed" },
    select: { id: true, exhibitorBusinessId: true },
  });
  assert.equal(ownerParticipation.exhibitorBusinessId, ownerBusiness.id);

  const lead = await prisma.lead.create({
    data: {
      exhibitionExhibitorId: ownerParticipation.id,
      visitorName: "Tenant Isolation Test Visitor",
      visitorEmail: `lead-visitor-${ts}@example.com`,
      notes: "Must remain private to the owning exhibitor",
    },
    select: { id: true, status: true, notes: true },
  });

  const ownerHeaders = { Authorization: `Bearer ${ownerExhibitor.token}` };
  const invalidListFilter = await fetch(`${baseUrl}/api/leads?status=not-a-real-status`, {
    headers: ownerHeaders,
  });
  assert.equal(invalidListFilter.status, 400, "invalid lead list filters must be rejected instead of silently ignored");

  const invalidExportFilter = await fetch(`${baseUrl}/api/leads/export?priority=urgent`, {
    headers: ownerHeaders,
  });
  assert.equal(invalidExportFilter.status, 400, "invalid export filters must not trigger an unfiltered export");

  const headers = { Authorization: `Bearer ${otherExhibitor.token}` };
  const read = await fetch(`${baseUrl}/api/leads/${lead.id}`, { headers });
  assert.equal(read.status, 404, "another exhibitor must not read a lead by ID");

  const list = await fetch(`${baseUrl}/api/leads`, { headers });
  assert.equal(list.status, 200);
  const listBody = await list.json() as { leads: Array<{ id: string }> };
  assert.ok(
    listBody.leads.every((item) => item.id !== lead.id),
    "lead list must be scoped to the caller's exhibitor business",
  );

  const update = await fetch(`${baseUrl}/api/leads/${lead.id}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ notes: "Unauthorized mutation" }),
  });
  assert.equal(update.status, 404, "another exhibitor must not update a lead by ID");

  const unchanged = await prisma.lead.findUniqueOrThrow({
    where: { id: lead.id },
    select: { status: true, notes: true },
  });
  assert.equal(unchanged.status, lead.status);
  assert.equal(unchanged.notes, lead.notes, "unauthorized update must not mutate the stored lead");
});


test("exhibitor lead analytics are scoped to the selected business and reject another tenant", async () => {
  const ownerOrganizer = await bootstrapOrganizer(baseUrl, `lead-analytics-owner-${ts}`, ts);
  organizerIds.push(ownerOrganizer.organizerId);
  const otherOrganizer = await bootstrapOrganizer(baseUrl, `lead-analytics-other-${ts}`, ts);
  organizerIds.push(otherOrganizer.organizerId);

  const ownerExhibitor = await applyAsExhibitor(
    baseUrl,
    ownerOrganizer.firstExhibitionId,
    `lead-analytics-owner-exhibitor-${ts}`,
    ts,
  );
  const otherExhibitor = await applyAsExhibitor(
    baseUrl,
    otherOrganizer.firstExhibitionId,
    `lead-analytics-other-exhibitor-${ts}`,
    ts,
  );
  const ownerParticipation = await prisma.exhibitionExhibitor.update({
    where: { id: ownerExhibitor.participationId },
    data: { status: "confirmed" },
    select: { id: true, exhibitorBusinessId: true },
  });
  const otherParticipation = await prisma.exhibitionExhibitor.update({
    where: { id: otherExhibitor.participationId },
    data: { status: "confirmed" },
    select: { id: true, exhibitorBusinessId: true },
  });

  await prisma.lead.createMany({
    data: [
      {
        exhibitionExhibitorId: ownerParticipation.id,
        visitorName: "Owner Analytics Visitor",
        visitorEmail: `owner-analytics-${ts}@example.com`,
        status: "converted",
      },
      {
        exhibitionExhibitorId: otherParticipation.id,
        visitorName: "Other Tenant Analytics Visitor",
        visitorEmail: `other-analytics-${ts}@example.com`,
        status: "new",
      },
    ],
  });

  const ownerHeaders = {
    Authorization: `Bearer ${ownerExhibitor.token}`,
    "X-Exhibitor-Business-Id": ownerParticipation.exhibitorBusinessId,
  };
  const ownAnalytics = await fetch(`${baseUrl}/api/leads/analytics`, { headers: ownerHeaders });
  assert.equal(ownAnalytics.status, 200, await ownAnalytics.text());
  const ownBody = await ownAnalytics.json() as { totalLeads: number; convertedLeads: number };
  assert.equal(ownBody.totalLeads, 1, "analytics must include only the selected exhibitor business");
  assert.equal(ownBody.convertedLeads, 1);

  const crossTenantAnalytics = await fetch(`${baseUrl}/api/leads/analytics`, {
    headers: {
      Authorization: `Bearer ${otherExhibitor.token}`,
      "X-Exhibitor-Business-Id": ownerParticipation.exhibitorBusinessId,
    },
  });
  assert.equal(crossTenantAnalytics.status, 404, "a user must not select another exhibitor's business");

  const invalidRange = await fetch(`${baseUrl}/api/leads/analytics?from=2026-11-20&to=2026-11-01`, {
    headers: ownerHeaders,
  });
  assert.equal(invalidRange.status, 400, "analytics must reject inverted date ranges");
});
