import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
let campaignId: string | null = null;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  try {
    if (campaignId) {
      await prisma.$executeRaw`DELETE FROM whatsapp_campaign_recipients WHERE campaign_id = ${campaignId}::uuid`;
      await prisma.$executeRaw`DELETE FROM whatsapp_campaigns WHERE id = ${campaignId}::uuid`;
    }
    await cleanupOrganizers(organizerIds);
  } finally {
    await stop();
    await prisma.$disconnect();
  }
});

async function auth(url: string, token: string, init: RequestInit = {}) {
  return fetch(baseUrl + url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}

test("WhatsApp campaigns cannot be listed, sent, or cancelled across organizer tenants", async () => {
  const owner = await bootstrapOrganizer(baseUrl, "wa-campaign-owner", ts + 1);
  const other = await bootstrapOrganizer(baseUrl, "wa-campaign-other", ts + 2);
  organizerIds.push(owner.organizerId, other.organizerId);

  const exhibition = await prisma.exhibition.findUniqueOrThrow({
    where: { id: owner.firstExhibitionId },
    select: { eventId: true },
  });
  assert.ok(exhibition.eventId, "organizer fixture must have a linked Event");

  const create = await auth("/api/organizer/whatsapp-campaigns", owner.token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventId: exhibition.eventId,
      name: `Tenant boundary campaign ${ts}`,
      message: "Tenant isolation regression fixture",
      audience: "CONFIRMED_REGISTRATIONS",
    }),
  });
  const createBody = await create.json();
  assert.equal(create.status, 201, JSON.stringify(createBody));
  campaignId = createBody.campaign.id as string;

  const ownerList = await auth("/api/organizer/whatsapp-campaigns", owner.token);
  const ownerListBody = await ownerList.json();
  assert.equal(ownerList.status, 200, JSON.stringify(ownerListBody));
  assert.ok(
    ownerListBody.campaigns.some((campaign: { id: string }) => campaign.id === campaignId),
    "campaign owner must be able to list their own campaign",
  );

  const otherList = await auth("/api/organizer/whatsapp-campaigns", other.token);
  const otherListBody = await otherList.json();
  assert.equal(otherList.status, 200, JSON.stringify(otherListBody));
  assert.equal(
    otherListBody.campaigns.some((campaign: { id: string }) => campaign.id === campaignId),
    false,
    "another organizer must not see the campaign in list results",
  );

  const crossTenantSend = await auth(`/api/organizer/whatsapp-campaigns/${campaignId}/send`, other.token, {
    method: "POST",
  });
  assert.equal(crossTenantSend.status, 404, await crossTenantSend.text());

  const crossTenantCancel = await auth(`/api/organizer/whatsapp-campaigns/${campaignId}/cancel`, other.token, {
    method: "POST",
  });
  assert.equal(crossTenantCancel.status, 404, await crossTenantCancel.text());

  const persisted = await prisma.$queryRaw<Array<{ status: string }>>`
    SELECT status::text AS status
    FROM whatsapp_campaigns
    WHERE id = ${campaignId}
  `;
  assert.equal(persisted[0]?.status, "DRAFT", "cross-tenant actions must not change campaign state");

  const recipientCount = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count
    FROM whatsapp_campaign_recipients
    WHERE campaign_id = ${campaignId}
  `;
  assert.equal(recipientCount[0]?.count, 0, "cross-tenant send must not enqueue recipients");
});
