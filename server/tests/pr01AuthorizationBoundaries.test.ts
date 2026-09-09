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
