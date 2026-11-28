import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

// A1 (#926): the exhibitor business profile is selected with the
// X-Exhibitor-Business-Id header. exhibitorActiveBusinessSelection.test.ts
// covers the pure resolver; this proves the HTTP routes reject a business the
// caller does not manage, before any write or file persistence.

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await stop();
});

async function signup(label: string) {
  const res = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "business-iso-" + label },
    body: JSON.stringify({
      email: "business-iso-" + label + "-" + ts + "@example.com",
      password: "TestPassword123!",
      fullName: "Business Iso " + label,
      userType: "exhibitor",
    }),
  });
  assert.equal(res.status, 201);
  const body = await res.json() as { token: string; user: { id: string } };
  const onboarding = await fetch(baseUrl + "/api/onboarding", { headers: { Authorization: "Bearer " + body.token } });
  assert.equal(onboarding.status, 200);
  const business = await prisma.exhibitorBusiness.findUniqueOrThrow({ where: { ownerId: body.user.id } });
  return { token: body.token, userId: body.user.id, businessId: business.id };
}

const asJson = (token: string, businessId?: string) => ({
  "Content-Type": "application/json",
  Authorization: "Bearer " + token,
  ...(businessId ? { "X-Exhibitor-Business-Id": businessId } : {}),
});

test("an exhibitor cannot update another business by naming it in X-Exhibitor-Business-Id", async () => {
  const attacker = await signup("attacker");
  const victim = await signup("victim");
  await prisma.exhibitorBusiness.update({ where: { id: victim.businessId }, data: { companyName: "Victim Co", address: "1 Victim Road" } });
  const victimBefore = await prisma.exhibitorBusiness.findUniqueOrThrow({ where: { id: victim.businessId } });
  const attackerBefore = await prisma.exhibitorBusiness.findUniqueOrThrow({ where: { id: attacker.businessId } });

  const response = await fetch(baseUrl + "/api/business", {
    method: "PUT",
    headers: asJson(attacker.token, victim.businessId),
    body: JSON.stringify({ companyName: "Hijacked Co", address: "Hijacked address" }),
  });
  assert.ok([403, 404].includes(response.status), "expected denial, got " + response.status);

  assert.deepEqual(await prisma.exhibitorBusiness.findUniqueOrThrow({ where: { id: victim.businessId } }), victimBefore, "victim business must be unchanged");
  assert.deepEqual(await prisma.exhibitorBusiness.findUniqueOrThrow({ where: { id: attacker.businessId } }), attackerBefore, "a denied request must not fall back to editing the caller's own business");
});

test("an exhibitor cannot read another business by naming it in X-Exhibitor-Business-Id", async () => {
  const attacker = await signup("reader");
  const victim = await signup("read-victim");
  await prisma.exhibitorBusiness.update({ where: { id: victim.businessId }, data: { companyName: "Secret Victim Co" } });

  const response = await fetch(baseUrl + "/api/business", { headers: asJson(attacker.token, victim.businessId) });
  const text = await response.text();
  assert.ok(!text.includes(victim.businessId) && !text.includes("Secret Victim Co"), "response must not expose the other business");
});

test("a logo upload for a business the caller does not manage is rejected before any file is written", async () => {
  const attacker = await signup("logo-attacker");
  const victim = await signup("logo-victim");
  const victimBefore = await prisma.exhibitorBusiness.findUniqueOrThrow({ where: { id: victim.businessId } });

  const uploadDir = path.join(process.cwd(), "uploads", "business-logos");
  await fs.mkdir(uploadDir, { recursive: true });
  const filesBefore = new Set(await fs.readdir(uploadDir));

  const form = new FormData();
  form.append("logo", new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" }), "logo.png");
  const response = await fetch(baseUrl + "/api/business/logo", {
    method: "POST",
    headers: { Authorization: "Bearer " + attacker.token, "X-Exhibitor-Business-Id": victim.businessId },
    body: form,
  });
  assert.ok([403, 404].includes(response.status), "expected denial, got " + response.status);

  const filesAfter = new Set(await fs.readdir(uploadDir));
  assert.deepEqual([...filesAfter].filter((name) => !filesBefore.has(name)), [], "no file bytes may be written for a denied upload");
  assert.equal((await prisma.exhibitorBusiness.findUniqueOrThrow({ where: { id: victim.businessId } })).logoUrl, victimBefore.logoUrl);
});

test("a staff member cannot update the business they only have view access to", async () => {
  const owner = await signup("put-owner");
  const staff = await signup("put-staff");
  const membership = await prisma.exhibitorMembership.create({
    data: { exhibitorBusinessId: owner.businessId, userId: staff.userId, invitedEmail: "business-iso-put-staff-" + ts + "@example.com", role: "staff", status: "active" },
  });
  try {
    const before = await prisma.exhibitorBusiness.findUniqueOrThrow({ where: { id: owner.businessId } });
    const response = await fetch(baseUrl + "/api/business", {
      method: "PUT",
      headers: asJson(staff.token, owner.businessId),
      body: JSON.stringify({ companyName: "Staff Overwrite" }),
    });
    assert.ok([403, 404].includes(response.status), "expected denial, got " + response.status);
    assert.deepEqual(await prisma.exhibitorBusiness.findUniqueOrThrow({ where: { id: owner.businessId } }), before);
  } finally {
    await prisma.exhibitorMembership.delete({ where: { id: membership.id } });
  }
});

test("an owner can still update their own business (guards against over-blocking)", async () => {
  const owner = await signup("own-update");
  const response = await fetch(baseUrl + "/api/business", {
    method: "PUT",
    headers: asJson(owner.token, owner.businessId),
    body: JSON.stringify({ companyName: "Updated Owner Co" }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await prisma.exhibitorBusiness.findUniqueOrThrow({ where: { id: owner.businessId } })).companyName, "Updated Owner Co");
});
