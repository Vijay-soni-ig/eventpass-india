import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers, createExhibition, setSubscription } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
let org: Awaited<ReturnType<typeof bootstrapOrganizer>>;
let exhibitionId: string;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
  org = await bootstrapOrganizer(baseUrl, "exhibition-asset-cleanup", ts);
  organizerIds.push(org.organizerId);
  await setSubscription(org.organizerId, "enterprise", "active");
  const created = await createExhibition(baseUrl, org.token, `Asset cleanup expo ${ts}`);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  exhibitionId = created.body.exhibition.id;
});

after(async () => {
  await cleanupOrganizers(organizerIds);
  await stop();
});

function pngBlob() {
  return new Blob([Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ])], { type: "image/png" });
}

test("failed exhibition cover and floor-plan persistence removes uploaded files", async () => {
  const scenarios = [
    { route: "cover", field: "cover", directory: "exhibition-covers", databaseField: "coverImageUrl" as const },
    { route: "floor-plan", field: "floorPlan", directory: "floor-plans", databaseField: "floorPlanUrl" as const },
  ];

  const exhibitionDelegate = prisma.exhibition as unknown as {
    update: typeof prisma.exhibition.update;
  };
  const originalUpdate = exhibitionDelegate.update;

  try {
    exhibitionDelegate.update = (async () => {
      throw new Error("simulated exhibition asset persistence failure");
    }) as typeof exhibitionDelegate.update;

    for (const scenario of scenarios) {
      const uploadDir = path.join(process.cwd(), "uploads", scenario.directory);
      await fs.mkdir(uploadDir, { recursive: true });
      const beforeFiles = new Set(await fs.readdir(uploadDir));

      const form = new FormData();
      form.append(scenario.field, pngBlob(), `${scenario.route}.png`);
      const response = await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}/${scenario.route}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${org.token}` },
        body: form,
      });
      assert.equal(response.status, 500, `${scenario.route} persistence failure should return 500`);

      const newFiles = (await fs.readdir(uploadDir)).filter((name) => !beforeFiles.has(name));
      assert.deepEqual(newFiles, [], `${scenario.route} failure must not leave an orphaned upload`);
      const exhibition = await prisma.exhibition.findUniqueOrThrow({ where: { id: exhibitionId } });
      assert.equal(exhibition[scenario.databaseField], null, `${scenario.route} failure must not set the asset URL`);
    }
  } finally {
    exhibitionDelegate.update = originalUpdate;
  }
});
