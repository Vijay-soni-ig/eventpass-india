import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => { ({ baseUrl, stop } = await startTestServer()); });
after(async () => { await stop(); });

async function signup(label: string) {
  const response = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "partner-spec-" + label },
    body: JSON.stringify({ email: "partner-spec-" + label + "-" + ts + "@example.com", password: "TestPassword123!", fullName: "Partner " + label, userType: "exhibitor" }),
  });
  return { token: (await response.json()).token as string };
}

async function bootstrap(label: string) {
  const { token } = await signup(label);
  const response = await fetch(baseUrl + "/api/exhibitions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ name: "Partner event " + label + " " + ts, status: "draft", visibility: "public", ticketTypes: [], stalls: [] }),
  });
  return { token, eventId: (await response.json()).exhibition.eventId as string };
}

async function enable(token: string, eventId: string) {
  const response = await fetch(baseUrl + "/api/events/" + eventId + "/modules/PARTNERS", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(response.status, 200);
}

async function createPartner(token: string, eventId: string, name: string) {
  const response = await fetch(baseUrl + "/api/events/" + eventId + "/partners", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ name, organization: "Partner Org", email: "private@example.com", phone: "9999999999", website: "https://partner.example.com" }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).partner.id as string;
}

test("partner profile specialization and tenant isolation", async () => {
  const a = await bootstrap("a");
  const b = await bootstrap("b");
  await enable(a.token, a.eventId);
  await enable(b.token, b.eventId);

  const partner = await createPartner(a.token, a.eventId, "Partner A");
  const foreign = await fetch(baseUrl + "/api/events/" + b.eventId + "/partners", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + b.token },
    body: JSON.stringify({ name: "Foreign Partner" }),
  });
  assert.equal(foreign.status, 201);
  const foreignId = (await foreign.json()).partner.id as string;

  const profile = await fetch(baseUrl + "/api/events/" + a.eventId + "/partners/" + partner + "/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + a.token },
    body: JSON.stringify({ partnerCategory: "Technology", relationshipSummary: "Strategic partner", contributionSummary: "Community access", engagementModel: "Year-round", showContact: false, showWebsite: true }),
  });
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).profile.partnerCategory, "Technology");

  const cross = await fetch(baseUrl + "/api/events/" + b.eventId + "/partners/" + partner + "/profile", { headers: { Authorization: "Bearer " + b.token } });
  assert.equal(cross.status, 404);
  assert.ok(foreignId);
});

test("public partner directory respects profile visibility", async () => {
  const { token, eventId } = await bootstrap("public");
  await enable(token, eventId);
  const partner = await createPartner(token, eventId, "Public Partner");
  const profile = await fetch(baseUrl + "/api/events/" + eventId + "/partners/" + partner + "/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ partnerCategory: "Community", displayLabel: "Community Partner", showContact: false, showWebsite: false }),
  });
  assert.equal(profile.status, 200);
  await prisma.event.update({ where: { id: eventId }, data: { status: "PUBLISHED", visibility: "public" } });

  const response = await fetch(baseUrl + "/api/public/events/" + eventId + "/partners/specialized");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.partners.length, 1);
  assert.equal(body.partners[0].partnerProfile.partnerCategory, "Community");
  assert.equal(body.partners[0].partnerProfile.displayLabel, "Community Partner");
  assert.equal(body.partners[0].email, null);
  assert.equal(body.partners[0].website, null);
});
