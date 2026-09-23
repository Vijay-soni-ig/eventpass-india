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
    headers: {
      "Content-Type": "application/json",
      "X-Test-Rate-Limit-Key": "lead-context-isolation-" + label,
    },
    body: JSON.stringify({
      email: "lead-context-isolation-" + label + "-" + ts + "@example.com",
      password: "TestPassword123!",
      fullName: "Lead Context " + label,
      userType: "exhibitor",
    }),
  });
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));

  const onboarding = await fetch(baseUrl + "/api/onboarding", {
    headers: { Authorization: "Bearer " + body.token },
  });
  assert.equal(onboarding.status, 200);

  return { token: body.token as string, userId: body.user.id as string };
}

test("lead capture contexts only expose the caller's confirmed exhibitor participation", async () => {
  const owner = await signup("owner");
  const other = await signup("other");

  const exhibitionResponse = await fetch(baseUrl + "/api/exhibitions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + owner.token },
    body: JSON.stringify({
      name: "Lead context isolation " + ts,
      status: "draft",
      visibility: "public",
      ticketTypes: [],
      stalls: [],
    }),
  });
  const exhibitionBody = await exhibitionResponse.json();
  assert.equal(exhibitionResponse.status, 201, JSON.stringify(exhibitionBody));
  const exhibitionId = exhibitionBody.exhibition.id as string;

  const ownerBusiness = await prisma.exhibitorBusiness.findUnique({ where: { ownerId: owner.userId } });
  const otherBusiness = await prisma.exhibitorBusiness.findUnique({ where: { ownerId: other.userId } });
  assert.ok(ownerBusiness);
  assert.ok(otherBusiness);

  const ownerParticipation = await prisma.exhibitionExhibitor.create({
    data: { exhibitionId, exhibitorBusinessId: ownerBusiness.id, status: "confirmed" },
  });
  const otherParticipation = await prisma.exhibitionExhibitor.create({
    data: { exhibitionId, exhibitorBusinessId: otherBusiness.id, status: "confirmed" },
  });

  const otherResponse = await fetch(baseUrl + "/api/event-leads/capture-contexts", {
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(otherResponse.status, 200);
  const contexts = (await otherResponse.json()).contexts;
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].participationId, otherParticipation.id);
  assert.equal(contexts[0].exhibitorBusinessId, otherBusiness.id);
  assert.notEqual(contexts[0].participationId, ownerParticipation.id);

  await prisma.exhibitionExhibitor.deleteMany({ where: { id: { in: [ownerParticipation.id, otherParticipation.id] } } });
});
