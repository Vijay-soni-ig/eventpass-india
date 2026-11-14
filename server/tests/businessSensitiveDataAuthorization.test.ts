import assert from "node:assert/strict";
import { test, before, after } from "node:test";
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

async function signup(label: string) {
  const res = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "bank-tax-" + label },
    body: JSON.stringify({
      email: "bank-tax-" + label + "-" + ts + "@example.com",
      password: "TestPassword123!",
      fullName: "Bank Tax " + label,
      userType: "exhibitor",
    }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.ok(body.token);

  const onboarding = await fetch(baseUrl + "/api/onboarding", {
    headers: { Authorization: "Bearer " + body.token },
  });
  assert.equal(onboarding.status, 200);

  return { token: body.token as string, userId: body.user.id as string };
}

test("exhibitor staff cannot read bank, tax, or KYC details through the business API", async () => {
  const owner = await signup("owner");
  const staff = await signup("staff");
  const business = await prisma.exhibitorBusiness.findUniqueOrThrow({
    where: { ownerId: owner.userId },
  });

  const sensitiveValues = {
    bankAccountName: "ExhibitTix Test Account",
    bankAccountNumber: "123456789012",
    bankIfsc: "HDFC0001234",
    gst: "24ABCDE1234F1Z5",
    pan: "ABCDE1234F",
    taxCategory: "registered",
    invoicePreference: "company",
    bankVerified: true,
    kycStatus: "verified" as const,
  };

  await prisma.exhibitorBusiness.update({
    where: { id: business.id },
    data: sensitiveValues,
  });

  const membership = await prisma.exhibitorMembership.create({
    data: {
      exhibitorBusinessId: business.id,
      userId: staff.userId,
      invitedEmail: "bank-tax-staff-" + ts + "@example.com",
      role: "staff",
      status: "active",
    },
  });

  try {
    const ownerResponse = await fetch(baseUrl + "/api/business", {
      headers: {
        Authorization: "Bearer " + owner.token,
        "X-Exhibitor-Business-Id": business.id,
      },
    });
    assert.equal(ownerResponse.status, 200);
    const ownerBusiness = (await ownerResponse.json()).business;
    for (const [field, value] of Object.entries(sensitiveValues)) {
      assert.equal(ownerBusiness[field], value, `owner should retain access to ${field}`);
    }

    const staffResponse = await fetch(baseUrl + "/api/business", {
      headers: {
        Authorization: "Bearer " + staff.token,
        "X-Exhibitor-Business-Id": business.id,
      },
    });
    assert.equal(staffResponse.status, 200);
    const staffBusiness = (await staffResponse.json()).business;
    for (const field of Object.keys(sensitiveValues)) {
      assert.equal(staffBusiness[field], null, `staff must not receive ${field}`);
    }

    const staffWrite = await fetch(baseUrl + "/api/business", {
      method: "PUT",
      headers: {
        Authorization: "Bearer " + staff.token,
        "Content-Type": "application/json",
        "X-Exhibitor-Business-Id": business.id,
      },
      body: JSON.stringify({ bankAccountNumber: "999999999999" }),
    });
    assert.ok(
      staffWrite.status === 403 || staffWrite.status === 404,
      "staff writes must be denied; the API may conceal inaccessible business resources with 404",
    );
    const unchangedBusiness = await prisma.exhibitorBusiness.findUniqueOrThrow({
      where: { id: business.id },
      select: { bankAccountNumber: true },
    });
    assert.equal(
      unchangedBusiness.bankAccountNumber,
      sensitiveValues.bankAccountNumber,
      "denied staff write must not alter bank details",
    );
  } finally {
    await prisma.exhibitorMembership.delete({ where: { id: membership.id } });
  }
});
