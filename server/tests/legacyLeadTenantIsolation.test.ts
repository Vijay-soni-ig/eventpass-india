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
      "X-Test-Rate-Limit-Key": "legacy-lead-isolation-" + label,
    },
    body: JSON.stringify({
      email: "legacy-lead-isolation-" + label + "-" + ts + "@example.com",
      password: "TestPassword123!",
      fullName: "Legacy Lead " + label,
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

test("legacy leads remain tenant-scoped across list, detail, export, update, and capture", async () => {
  const owner = await signup("owner");
  const other = await signup("other");

  const exhibitionResponse = await fetch(baseUrl + "/api/exhibitions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + owner.token },
    body: JSON.stringify({
      name: "Legacy lead isolation " + ts,
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

  const ownerLead = await prisma.lead.create({
    data: {
      exhibitionExhibitorId: ownerParticipation.id,
      visitorName: "Owner Visitor",
      visitorEmail: "owner-visitor@example.com",
      capturedByUserId: owner.userId,
    },
  });
  const otherLead = await prisma.lead.create({
    data: {
      exhibitionExhibitorId: otherParticipation.id,
      visitorName: "Other Visitor",
      visitorEmail: "other-visitor@example.com",
      capturedByUserId: other.userId,
    },
  });

  const otherList = await fetch(baseUrl + "/api/leads", {
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(otherList.status, 200);
  const listedIds = (await otherList.json()).leads.map((lead: { id: string }) => lead.id);
  assert.deepEqual(listedIds, [otherLead.id]);

  const crossDetail = await fetch(baseUrl + "/api/leads/" + ownerLead.id, {
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(crossDetail.status, 404);

  const crossExport = await fetch(baseUrl + "/api/leads/export", {
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(crossExport.status, 200);
  const csv = await crossExport.text();
  assert.equal(csv.includes("Owner Visitor"), false);
  assert.equal(csv.includes("Other Visitor"), true);

  const crossUpdate = await fetch(baseUrl + "/api/leads/" + ownerLead.id, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + other.token },
    body: JSON.stringify({ status: "converted" }),
  });
  assert.equal(crossUpdate.status, 404);

  const crossCapture = await fetch(baseUrl + "/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + other.token },
    body: JSON.stringify({
      exhibitionExhibitorId: ownerParticipation.id,
      visitorName: "Injected Visitor",
      visitorEmail: "injected@example.com",
      source: "manual",
    }),
  });
  assert.equal(crossCapture.status, 404);

  const stillOwnerLead = await prisma.lead.findUnique({ where: { id: ownerLead.id } });
  assert.ok(stillOwnerLead);
  assert.equal(stillOwnerLead.status, "new");

  await prisma.lead.deleteMany({ where: { id: { in: [ownerLead.id, otherLead.id] } } });
  await prisma.exhibitionExhibitor.deleteMany({ where: { id: { in: [ownerParticipation.id, otherParticipation.id] } } });
});
