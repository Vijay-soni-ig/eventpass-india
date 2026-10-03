import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const organizerIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

test("dashboard edits are rate limited per user, and reads are not", async () => {
  const limited = await bootstrapOrganizer(baseUrl, "dash-rl-a", Date.now());
  const other = await bootstrapOrganizer(baseUrl, "dash-rl-b", Date.now() + 1);
  organizerIds.push(limited.organizerId, other.organizerId);

  // An empty body fails validation before touching the database, so each call is cheap but still counts.
  const edit = (token: string) =>
    fetch(`${baseUrl}/api/dashboards/00000000-0000-4000-8000-000000000000`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });

  for (let i = 0; i < 120; i += 1) {
    const response = await edit(limited.token);
    assert.equal(response.status, 400, `request ${i + 1} should reach validation`);
  }
  const blocked = await edit(limited.token);
  assert.equal(blocked.status, 429);
  assert.match((await blocked.json()).error, /Too many dashboard changes/);

  // The limit is per user: another organizer is unaffected, and listing dashboards still works.
  assert.equal((await edit(other.token)).status, 400);
  const list = await fetch(`${baseUrl}/api/dashboards`, { headers: { Authorization: `Bearer ${limited.token}` } });
  assert.equal(list.status, 200);
});
