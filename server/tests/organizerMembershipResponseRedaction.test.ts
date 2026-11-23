import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { hashInvitationToken } from "../src/lib/teamInvitations";
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
});

function assertNoInvitationTokenMaterial(payload: unknown) {
  const keys: string[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      keys.push(key);
      visit(child);
    }
  };
  visit(payload);
  assert.equal(
    keys.some((key) => /token|hash/i.test(key)),
    false,
    "organizer membership API responses must not expose invitation token/hash fields",
  );
}

test("organizer membership API responses omit invitation token hashes", async () => {
  const owner = await bootstrapOrganizer(baseUrl, "membership-response-redaction", ts);
  organizerIds.push(owner.organizerId);

  const invited = await prisma.organizerMembership.create({
    data: {
      organizerId: owner.organizerId,
      invitedEmail: `pending-${ts}@example.com`,
      userId: null,
      role: "scanner",
      status: "invited",
      invitationTokenHash: hashInvitationToken(`organizer-response-token-${ts}`),
      invitationExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  try {
    const ownMemberships = await fetch(`${baseUrl}/api/organizer-members`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    assert.equal(ownMemberships.status, 200);
    assertNoInvitationTokenMaterial(await ownMemberships.json());

    const list = await fetch(`${baseUrl}/api/organizer-members/${owner.organizerId}`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    assert.equal(list.status, 200);
    const listBody = await list.json();
    assertNoInvitationTokenMaterial(listBody);
    assert.equal(listBody.members.some((member: { id: string }) => member.id === invited.id), true);

    const create = await fetch(`${baseUrl}/api/organizer-members/${owner.organizerId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ invitedEmail: `new-${ts}@example.com`, role: "scanner" }),
    });
    const createBody = await create.json();
    assert.equal(create.status, 201, JSON.stringify(createBody));
    assertNoInvitationTokenMaterial(createBody);

    const update = await fetch(`${baseUrl}/api/organizer-members/member/${invited.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "admin" }),
    });
    assert.equal(update.status, 200);
    const updateBody = await update.json();
    assertNoInvitationTokenMaterial(updateBody);
    assert.equal(updateBody.member.role, "admin");
  } finally {
    await prisma.organizerMembership.deleteMany({ where: { organizerId: owner.organizerId } });
  }
});
