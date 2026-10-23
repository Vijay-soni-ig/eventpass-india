import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await stop();
});

async function signupOrganizer(label: string) {
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `organizer-upload-${label}` },
    body: JSON.stringify({
      email: `organizer-upload-${label}-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: `Organizer Upload ${label}`,
      userType: "organizer",
    }),
  });
  const body = await res.json();
  assert.equal(res.status, 201);
  return body.token as string;
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

async function uploadProfileImage(token: string, kind: "logo" | "cover") {
  const form = new FormData();
  form.append(kind, pngBlob(), `${kind}.png`);
  return fetch(`${baseUrl}/api/organizer/profile/${kind}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
}

for (const kind of ["logo", "cover"] as const) {
  test(`organizer profile ${kind}: failed database persistence removes uploaded file`, async () => {
    const token = await signupOrganizer(kind);
    const subfolder = kind === "logo" ? "organizer-logos" : "organizer-covers";
    const uploadDir = path.join(process.cwd(), "uploads", subfolder);
    await fs.mkdir(uploadDir, { recursive: true });
    const beforeFiles = new Set(await fs.readdir(uploadDir));

    const organizerDelegate = prisma.organizer as unknown as {
      update: typeof prisma.organizer.update;
    };
    const originalUpdate = organizerDelegate.update;
    organizerDelegate.update = (async () => {
      throw new Error("simulated organizer persistence failure");
    }) as typeof organizerDelegate.update;

    try {
      const response = await uploadProfileImage(token, kind);
      assert.equal(response.status, 500);
    } finally {
      organizerDelegate.update = originalUpdate;
    }

    const newFiles = (await fs.readdir(uploadDir)).filter((name) => !beforeFiles.has(name));
    assert.deepEqual(newFiles, [], `failed ${kind} persistence must not leave an orphaned upload`);
  });
}
