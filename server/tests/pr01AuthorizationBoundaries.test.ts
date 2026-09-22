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

test("pure exhibitor cannot enter organizer tenant routes or bootstrap an organizer via exhibition creation", async () => {
  const { organizerId, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "pr01-exhibitor-boundary", ts);
  organizerIds.push(organizerId);

  const { token: exhibitorToken } = await applyAsExhibitor(
    baseUrl,
    firstExhibitionId,
    "pr01-pure-exhibitor",
    ts,
  );

  const before = await prisma.organizerMembership.count({
    where: { user: { email: { contains: "pr01-pure-exhibitor" } } },
  });

  const response = await fetch(`${baseUrl}/api/exhibitions`, {
    headers: { Authorization: `Bearer ${exhibitorToken}` },
  });
  const body = await response.json();

  assert.equal(response.status, 403, JSON.stringify(body));
  assert.equal(body.error, "Organizer access required");

  const afterCount = await prisma.organizerMembership.count({
    where: { user: { email: { contains: "pr01-pure-exhibitor" } } },
  });
  assert.equal(afterCount, before, "an exhibitor must not gain an organizer membership as a side effect of a blocked route");
});

test("pure organizer cannot enter exhibitor-business tenant routes", async () => {
  const { organizerId, token } = await bootstrapOrganizer(baseUrl, "pr01-organizer-boundary", ts);
  organizerIds.push(organizerId);

  const response = await fetch(`${baseUrl}/api/exhibitor/participations/payments`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json();

  assert.equal(response.status, 403, JSON.stringify(body));
  assert.equal(body.error, "Exhibitor access required");
});

test("organizer tenant boundaries reject cross-organizer exhibition reads and writes", async () => {
  const orgA = await bootstrapOrganizer(baseUrl, "pr01-cross-org-a", ts + 1);
  const orgB = await bootstrapOrganizer(baseUrl, "pr01-cross-org-b", ts + 2);
  organizerIds.push(orgA.organizerId, orgB.organizerId);

  const read = await fetch(`${baseUrl}/api/exhibitions/${orgB.firstExhibitionId}`, {
    headers: { Authorization: `Bearer ${orgA.token}` },
  });
  assert.equal(read.status, 404, JSON.stringify(await read.json()));

  const write = await fetch(`${baseUrl}/api/exhibitions/${orgB.firstExhibitionId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${orgA.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "cross-tenant-write-attempt" }),
  });
  assert.equal(write.status, 404, JSON.stringify(await write.json()));

  const untouched = await prisma.exhibition.findUnique({
    where: { id: orgB.firstExhibitionId },
    select: { name: true, organizerId: true },
  });
  assert.equal(untouched?.organizerId, orgB.organizerId);
  assert.notEqual(untouched?.name, "cross-tenant-write-attempt");
});

test("exhibitor tenant boundaries reject another business's participation mutations", async () => {
  const org = await bootstrapOrganizer(baseUrl, "pr01-cross-exhibitor", ts + 3);
  organizerIds.push(org.organizerId);

  const exhibitorA = await applyAsExhibitor(baseUrl, org.firstExhibitionId, "pr01-cross-ex-a", ts + 4);
  const exhibitorB = await applyAsExhibitor(baseUrl, org.firstExhibitionId, "pr01-cross-ex-b", ts + 5);

  const cancel = await fetch(
    `${baseUrl}/api/exhibitor/participations/${exhibitorB.participationId}/cancel`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${exhibitorA.token}` },
    },
  );
  assert.equal(cancel.status, 404, JSON.stringify(await cancel.json()));

  const untouched = await prisma.exhibitionExhibitor.findUnique({
    where: { id: exhibitorB.participationId },
    select: { status: true, exhibitorBusinessId: true },
  });
  assert.equal(untouched?.status, "applied");
  assert.notEqual(untouched?.exhibitorBusinessId, exhibitorA.participationId);
});

