import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
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
  org = await bootstrapOrganizer(baseUrl, "exhibition-media-cleanup", ts);
  organizerIds.push(org.organizerId);
  await setSubscription(org.organizerId, "enterprise", "active");
  const created = await createExhibition(baseUrl, org.token, `Media cleanup expo ${ts}`);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  exhibitionId = created.body.exhibition.id;
});

after(async () => {
  await cleanupOrganizers(organizerIds);
  await stop();
});

function pngBlob() {
  return new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" });
}

test("invalid exhibition media metadata is rejected without leaving an uploaded file", async () => {
  const uploadDir = path.join(process.cwd(), "uploads", "exhibition-media");
  await fs.mkdir(uploadDir, { recursive: true });
  const filesBefore = new Set(await fs.readdir(uploadDir));

  const form = new FormData();
  form.append("image", pngBlob(), "photo.png");
  form.append("caption", "x".repeat(1000));
  const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${org.token}` },
    body: form,
  });

  assert.equal(res.status, 400);
  const filesAfter = new Set(await fs.readdir(uploadDir));
  assert.deepEqual(
    [...filesAfter].filter((name) => !filesBefore.has(name)),
    [],
    "metadata-rejected exhibition uploads must not leave orphaned files",
  );
});
