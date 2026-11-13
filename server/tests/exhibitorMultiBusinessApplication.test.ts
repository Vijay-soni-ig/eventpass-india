import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers, createExhibition, applyAsExhibitor, setSubscription } from "./helpers/entitlementFixtures";

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

test("exhibitor applications require an explicit authorized business when the user has multiple businesses", async () => {
  const organizer = await bootstrapOrganizer(baseUrl, "multi-business-application", ts);
  organizerIds.push(organizer.organizerId);

  // This scenario needs a second exhibition as its target. The bootstrap helper
  // provisions a Starter subscription with a one-exhibition allowance, so move
  // this isolated test organizer to Growth before creating the target.
  await setSubscription(organizer.organizerId, "growth", "active");

  const secondExhibition = await createExhibition(baseUrl, organizer.token, "Multi-business application target " + ts);
  assert.equal(secondExhibition.status, 201, JSON.stringify(secondExhibition.body));
  const targetExhibitionId = secondExhibition.body.exhibition.id as string;

  const primary = await applyAsExhibitor(baseUrl, organizer.firstExhibitionId, "multi-business-primary", ts);
  const secondary = await applyAsExhibitor(baseUrl, organizer.firstExhibitionId, "multi-business-secondary", ts);
  const secondaryBusiness = await prisma.exhibitorBusiness.findUniqueOrThrow({ where: { ownerId: secondary.userId } });

  await prisma.exhibitorMembership.create({
    data: {
      exhibitorBusinessId: secondaryBusiness.id,
      userId: primary.userId,
      role: "owner",
      status: "active",
    },
  });

  const headers = {
    "Content-Type": "application/json",
    Authorization: "Bearer " + primary.token,
  };

  const ambiguous = await fetch(baseUrl + "/api/exhibitor/participations", {
    method: "POST",
    headers,
    body: JSON.stringify({ exhibitionId: targetExhibitionId }),
  });
  assert.equal(ambiguous.status, 400, "multiple businesses must never silently default to the first business");
  assert.match((await ambiguous.json()).error, /select an active exhibitor business/i);

  const unauthorized = await fetch(baseUrl + "/api/exhibitor/participations", {
    method: "POST",
    headers: { ...headers, "X-Exhibitor-Business-Id": "not-a-member-business" },
    body: JSON.stringify({ exhibitionId: targetExhibitionId }),
  });
  assert.equal(unauthorized.status, 404, "a business outside the user's memberships must be rejected");

  const selected = await fetch(baseUrl + "/api/exhibitor/participations", {
    method: "POST",
    headers: { ...headers, "X-Exhibitor-Business-Id": secondaryBusiness.id },
    body: JSON.stringify({ exhibitionId: targetExhibitionId }),
  });
  const selectedBody = await selected.json();
  assert.equal(selected.status, 201, JSON.stringify(selectedBody));
  assert.equal(selectedBody.participation.exhibitorBusinessId, secondaryBusiness.id);

  const primaryBusiness = await prisma.exhibitorBusiness.findUniqueOrThrow({ where: { ownerId: primary.userId } });
  assert.equal(
    await prisma.exhibitionExhibitor.count({
      where: { exhibitionId: targetExhibitionId, exhibitorBusinessId: primaryBusiness.id },
    }),
    0,
    "the application must not be created under another business owned by the same user"
  );
});
