import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const userIds: string[] = [];
let businessId: string | undefined;

async function createUser(label: string) {
  const email = `exhibitor-bank-tax-${label}-${ts}@example.com`;
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "TestPassword123!",
      fullName: `Exhibitor Bank Tax ${label}`,
      userType: "exhibitor",
    }),
  });
  const body = await response.json() as { token?: string; user?: { id: string } };
  assert.equal(response.status, 201, JSON.stringify(body));
  assert.ok(body.token);
  assert.ok(body.user?.id);
  userIds.push(body.user.id);
  return { token: body.token, userId: body.user.id, email };
}

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  const allBusinessIds = [...(businessId ? [businessId] : []), ...validationBusinessIds];
  if (allBusinessIds.length) {
    await prisma.exhibitorMembership.deleteMany({ where: { exhibitorBusinessId: { in: allBusinessIds } } });
    await prisma.exhibitorBusiness.deleteMany({ where: { id: { in: allBusinessIds } } });
  }
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await stop();
  await prisma.$disconnect();
});

test("exhibitor bank and tax data is visible only to business managers", async () => {
  const owner = await createUser("owner");
  const staff = await createUser("staff");
  const business = await prisma.exhibitorBusiness.create({
    data: {
      ownerId: owner.userId,
      companyName: `Bank Tax Test ${ts}`,
      gst: "24ABCDE1234F1Z5",
      pan: "ABCDE1234F",
      bankAccountName: "Acme Exhibitions Pvt Ltd",
      bankAccountNumber: "123456789012",
      bankIfsc: "HDFC0001234",
    },
    select: { id: true },
  });
  businessId = business.id;

  await prisma.exhibitorMembership.createMany({
    data: [
      { exhibitorBusinessId: business.id, userId: owner.userId, invitedEmail: owner.email, role: "owner", status: "active" },
      { exhibitorBusinessId: business.id, userId: staff.userId, invitedEmail: staff.email, role: "staff", status: "active" },
    ],
  });

  const ownerRead = await fetch(`${baseUrl}/api/business`, {
    headers: { Authorization: `Bearer ${owner.token}`, "X-Exhibitor-Business-Id": business.id },
  });
  const ownerBody = await ownerRead.json() as { business?: Record<string, unknown> };
  assert.equal(ownerRead.status, 200, JSON.stringify(ownerBody));
  assert.equal(ownerBody.business?.bankAccountNumber, "123456789012");
  assert.equal(ownerBody.business?.bankIfsc, "HDFC0001234");
  assert.equal(ownerBody.business?.gst, "24ABCDE1234F1Z5");
  assert.equal(ownerBody.business?.pan, "ABCDE1234F");

  const staffRead = await fetch(`${baseUrl}/api/business`, {
    headers: { Authorization: `Bearer ${staff.token}`, "X-Exhibitor-Business-Id": business.id },
  });
  const staffBody = await staffRead.json() as { business?: Record<string, unknown> };
  assert.equal(staffRead.status, 200, JSON.stringify(staffBody));
  for (const field of ["bankAccountName", "bankAccountNumber", "bankIfsc", "gst", "pan"]) {
    assert.equal(staffBody.business?.[field], null, `staff must receive redacted ${field}`);
  }

  const staffWrite = await fetch(`${baseUrl}/api/business`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${staff.token}`,
      "X-Exhibitor-Business-Id": business.id,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ bankAccountNumber: "999999999999", gst: "27ABCDE1234F1Z5" }),
  });
  assert.equal(staffWrite.status, 403, await staffWrite.text());

  const persisted = await prisma.exhibitorBusiness.findUniqueOrThrow({ where: { id: business.id } });
  assert.equal(persisted.bankAccountNumber, "123456789012", "staff write must not change bank data");
  assert.equal(persisted.gst, "24ABCDE1234F1Z5", "staff write must not change tax data");
});

test("exhibitor bank and tax identifiers reject malformed Indian formats", async () => {
  const owner = await createUser("validation");
  const business = await prisma.exhibitorBusiness.create({
    data: { ownerId: owner.userId, companyName: `Validation Test ${ts}` },
    select: { id: true },
  });
  // Keep this fixture isolated; cleanup uses the complete set of tracked business IDs.
  validationBusinessIds.push(business.id);
  await prisma.exhibitorMembership.create({
    data: {
      exhibitorBusinessId: business.id,
      userId: owner.userId,
      invitedEmail: owner.email,
      role: "owner",
      status: "active",
    },
  });

  const invalidPayloads = [
    { gst: "NOT-A-GSTIN" },
    { pan: "12345ABCDE" },
    { bankIfsc: "BADIFSC" },
    { bankAccountNumber: "12-INVALID" },
    { bankAccountNumber: "1234567890123456789" },
  ];

  for (const payload of invalidPayloads) {
    const response = await fetch(`${baseUrl}/api/business`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${owner.token}`,
        "X-Exhibitor-Business-Id": business.id,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    assert.equal(response.status, 400, `expected validation failure for ${JSON.stringify(payload)}`);
  }
});

const validationBusinessIds: string[] = [];
