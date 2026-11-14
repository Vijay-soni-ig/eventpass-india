import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { hashInvitationToken } from "../src/lib/teamInvitations";
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

async function signup() {
  const res = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "membership-response-" + ts },
    body: JSON.stringify({
      email: "membership-response-" + ts + "@example.com",
      password: "TestPassword123!",
      fullName: "Membership Response Owner",
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

function assertNoInvitationHash(payload: unknown) {
  assert.equal(
    JSON.stringify(payload).includes("invitationTokenHash"),
    false,
    "membership API responses must not expose invitationTokenHash",
  );
}

test("exhibitor membership APIs return an allowlisted response without invitation hashes", async () => {
  const owner = await signup();
  const business = await prisma.exhibitorBusiness.findUniqueOrThrow({ where: { ownerId: owner.userId } });
  const invited = await prisma.exhibitorMembership.create({
    data: {
      exhibitorBusinessId: business.id,
      invitedEmail: "pending-" + ts + "@example.com",
      role: "staff",
      status: "invited",
      invitationTokenHash: hashInvitationToken("membership-response-token-" + ts),
      invitationExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  try {
    const ownMemberships = await fetch(baseUrl + "/api/exhibitor-members", {
      headers: { Authorization: "Bearer " + owner.token },
    });
    assert.equal(ownMemberships.status, 200);
    const ownMembershipBody = await ownMemberships.json();
    assertNoInvitationHash(ownMembershipBody);

    const list = await fetch(baseUrl + "/api/exhibitor-members/" + business.id, {
      headers: { Authorization: "Bearer " + owner.token },
    });
    assert.equal(list.status, 200);
    const listBody = await list.json();
    assertNoInvitationHash(listBody);
    assert.equal(listBody.members.some((member: { id: string }) => member.id === invited.id), true);

    const create = await fetch(baseUrl + "/api/exhibitor-members/" + business.id, {
      method: "POST",
      headers: { Authorization: "Bearer " + owner.token, "Content-Type": "application/json" },
      body: JSON.stringify({ invitedEmail: "new-" + ts + "@example.com", role: "staff" }),
    });
    assert.equal(create.status, 201);
    const createBody = await create.json();
    assertNoInvitationHash(createBody);

    const update = await fetch(baseUrl + "/api/exhibitor-members/member/" + invited.id, {
      method: "PATCH",
      headers: { Authorization: "Bearer " + owner.token, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "admin" }),
    });
    assert.equal(update.status, 200);
    const updateBody = await update.json();
    assertNoInvitationHash(updateBody);
    assert.equal(updateBody.member.role, "admin");
  } finally {
    await prisma.exhibitorMembership.deleteMany({ where: { exhibitorBusinessId: business.id } });
  }
});
