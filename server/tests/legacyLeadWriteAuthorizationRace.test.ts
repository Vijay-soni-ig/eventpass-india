import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, applyAsExhibitor, cleanupOrganizers } from "./helpers/entitlementFixtures";

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

test("legacy exhibitor lead capture and update revalidate membership inside the write transaction", async () => {
  const organizer = await bootstrapOrganizer(baseUrl, `lead-write-race-${ts}`, ts);
  organizerIds.push(organizer.organizerId);

  const exhibitor = await applyAsExhibitor(
    baseUrl,
    organizer.firstExhibitionId,
    `lead-write-race-exhibitor-${ts}`,
    ts,
  );
  const participation = await prisma.exhibitionExhibitor.update({
    where: { id: exhibitor.participationId },
    data: { status: "confirmed" },
    select: { id: true, exhibitionId: true, exhibitorBusinessId: true },
  });
  const membership = await prisma.exhibitorMembership.findFirstOrThrow({
    where: { userId: exhibitor.userId, exhibitorBusinessId: participation.exhibitorBusinessId },
    select: { id: true, role: true, status: true },
  });
  assert.equal(membership.role, "owner");
  assert.equal(membership.status, "active");

  const lead = await prisma.lead.create({
    data: {
      exhibitionExhibitorId: participation.id,
      visitorName: "Authorization Race Visitor",
      visitorEmail: `lead-write-race-${ts}@example.com`,
      capturedByUserId: exhibitor.userId,
    },
    select: { id: true, status: true, notes: true },
  });

  const prismaClient = prisma as unknown as { $transaction: typeof prisma.$transaction };
  const originalTransaction = prismaClient.$transaction;
  prismaClient.$transaction = (async (...args: unknown[]) => {
    await prisma.exhibitorMembership.update({
      where: { id: membership.id },
      data: { role: "staff" },
    });
    return (originalTransaction as (...inner: unknown[]) => Promise<unknown>).apply(prisma, args);
  }) as typeof prismaClient.$transaction;

  try {
    const deniedUpdate = await fetch(`${baseUrl}/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${exhibitor.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Unauthorized update after role demotion" }),
    });
    assert.equal(deniedUpdate.status, 404, await deniedUpdate.text());
    const unchanged = await prisma.lead.findUniqueOrThrow({
      where: { id: lead.id },
      select: { status: true, notes: true },
    });
    assert.equal(unchanged.status, lead.status);
    assert.equal(unchanged.notes, lead.notes);
  } finally {
    prismaClient.$transaction = originalTransaction;
    await prisma.exhibitorMembership.update({
      where: { id: membership.id },
      data: { role: "owner" },
    });
  }

  const beforeCaptureCount = await prisma.lead.count({ where: { exhibitionExhibitorId: participation.id } });
  prismaClient.$transaction = (async (...args: unknown[]) => {
    await prisma.exhibitorMembership.delete({
      where: { id: membership.id },
    });
    return (originalTransaction as (...inner: unknown[]) => Promise<unknown>).apply(prisma, args);
  }) as typeof prismaClient.$transaction;

  try {
    const deniedCapture = await fetch(`${baseUrl}/api/leads`, {
      method: "POST",
      headers: { Authorization: `Bearer ${exhibitor.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        exhibitionExhibitorId: participation.id,
        visitorName: "Unauthorized Capture Visitor",
        visitorEmail: `unauthorized-capture-${ts}@example.com`,
        source: "manual",
      }),
    });
    assert.equal(deniedCapture.status, 404, await deniedCapture.text());
    assert.equal(
      await prisma.lead.count({ where: { exhibitionExhibitorId: participation.id } }),
      beforeCaptureCount,
      "membership revocation must prevent lead creation",
    );
  } finally {
    prismaClient.$transaction = originalTransaction;
  }
});
