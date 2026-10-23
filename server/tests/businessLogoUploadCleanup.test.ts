import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const userIds: string[] = [];
const businessIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await prisma.exhibitorMembership.deleteMany({ where: { exhibitorBusinessId: { in: businessIds } } });
  await prisma.exhibitorBusiness.deleteMany({ where: { id: { in: businessIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await stop();
  await prisma.$disconnect();
});

async function bootstrapExhibitor(label: string) {
  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `business-logo-${label}` },
    body: JSON.stringify({
      email: `business-logo-${label}-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: `Business Logo ${label}`,
      userType: "exhibitor",
    }),
  });
  const signupBody = await signup.json();
  assert.equal(signup.status, 201, JSON.stringify(signupBody));
  userIds.push(signupBody.user.id as string);
  const token = signupBody.token as string;

  const bootstrap = await fetch(`${baseUrl}/api/business`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({}),
  });
  assert.equal(bootstrap.status, 200, JSON.stringify(await bootstrap.json()));
  const business = await prisma.exhibitorBusiness.findFirstOrThrow({ where: { ownerId: signupBody.user.id as string } });
  businessIds.push(business.id);
  return { token, businessId: business.id };
}

function pngBlob() {
  return new Blob([Uint8Array.from([
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

test("exhibitor business logo: failed database persistence removes uploaded file", async () => {
  const { token, businessId } = await bootstrapExhibitor("persistence-failure");
  const uploadDir = path.join(process.cwd(), "uploads", "business-logos");
  await fs.mkdir(uploadDir, { recursive: true });
  const beforeFiles = new Set(await fs.readdir(uploadDir));

  const businessDelegate = prisma.exhibitorBusiness as unknown as {
    update: typeof prisma.exhibitorBusiness.update;
  };
  const originalUpdate = businessDelegate.update;
  businessDelegate.update = (async () => {
    throw new Error("simulated business logo persistence failure");
  }) as typeof businessDelegate.update;

  try {
    const form = new FormData();
    form.append("logo", pngBlob(), "business-logo.png");
    const response = await fetch(`${baseUrl}/api/business/logo`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    assert.equal(response.status, 500);
  } finally {
    businessDelegate.update = originalUpdate;
  }

  const newFiles = (await fs.readdir(uploadDir)).filter((name) => !beforeFiles.has(name));
  assert.deepEqual(newFiles, [], "failed business logo persistence must not leave an orphaned upload");
  const business = await prisma.exhibitorBusiness.findUniqueOrThrow({ where: { id: businessId } });
  assert.equal(business.logoUrl, null, "failed persistence must not set a logo URL");
});
