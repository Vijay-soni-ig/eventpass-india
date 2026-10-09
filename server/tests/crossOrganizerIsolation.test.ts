import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

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

function assertCrossTenantDenied(status: number, operation: string) {
  assert.ok(
    status === 403 || status === 404,
    `${operation} must not disclose or mutate another organizer's resource; got HTTP ${status}`,
  );
}

test("organizer cannot read, update, or add stalls to another organizer's exhibition by ID", async () => {
  const owner = await bootstrapOrganizer(baseUrl, `tenant-owner-${ts}`, ts);
  organizerIds.push(owner.organizerId);
  const attacker = await bootstrapOrganizer(baseUrl, `tenant-attacker-${ts}`, ts);
  organizerIds.push(attacker.organizerId);

  const original = await prisma.exhibition.findUniqueOrThrow({
    where: { id: owner.firstExhibitionId },
    select: { id: true, organizerId: true, name: true },
  });
  assert.equal(original.organizerId, owner.organizerId);

  // Direct-object access must be denied even when the caller has a valid
  // organizer membership of their own.
  const read = await fetch(`${baseUrl}/api/exhibitions/${owner.firstExhibitionId}`, {
    headers: { Authorization: `Bearer ${attacker.token}` },
  });
  assertCrossTenantDenied(read.status, "Cross-organizer exhibition read");

  const update = await fetch(`${baseUrl}/api/exhibitions/${owner.firstExhibitionId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${attacker.token}`,
    },
    body: JSON.stringify({ name: "Unauthorized cross-tenant mutation" }),
  });
  assertCrossTenantDenied(update.status, "Cross-organizer exhibition update");

  const createStall = await fetch(`${baseUrl}/api/exhibitions/${owner.firstExhibitionId}/stalls`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${attacker.token}`,
    },
    body: JSON.stringify({ price: 4000 }),
  });
  assertCrossTenantDenied(createStall.status, "Cross-organizer stall creation");

  const unchanged = await prisma.exhibition.findUniqueOrThrow({
    where: { id: owner.firstExhibitionId },
    select: { organizerId: true, name: true },
  });
  assert.equal(unchanged.organizerId, owner.organizerId);
  assert.equal(unchanged.name, original.name, "unauthorized update must not change the owner's exhibition");

  const stallCount = await prisma.stall.count({ where: { exhibitionId: owner.firstExhibitionId } });
  assert.equal(stallCount, 0, "unauthorized request must not create a stall");
});
