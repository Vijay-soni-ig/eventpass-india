import assert from "node:assert/strict";
import { before, after, test } from "node:test";
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
  const response = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "participant-hardening-" + label },
    body: JSON.stringify({
      email: "participant-hardening-" + label + "-" + ts + "@example.com",
      password: "TestPassword123!",
      fullName: "Participant " + label,
      userType: "exhibitor",
    }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).token as string;
}

async function bootstrap(label: string) {
  const token = await signup(label);
  const response = await fetch(baseUrl + "/api/exhibitions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({
      name: "Participant hardening " + label + " " + ts,
      status: "draft",
      visibility: "public",
      ticketTypes: [],
      stalls: [],
    }),
  });
  assert.equal(response.status, 201);
  return { token, eventId: (await response.json()).exhibition.eventId as string };
}

async function enable(token: string, eventId: string, module: string) {
  const response = await fetch(baseUrl + "/api/events/" + eventId + "/modules/" + module, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(response.status, 200);
}

async function createVendor(token: string, eventId: string, name: string) {
  const response = await fetch(baseUrl + "/api/events/" + eventId + "/vendors", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ name, isPublic: true }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).vendor.id as string;
}

async function createPartner(token: string, eventId: string, name: string) {
  const response = await fetch(baseUrl + "/api/events/" + eventId + "/partners", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ name, isPublic: true }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).partner.id as string;
}

async function createStaff(token: string, eventId: string, name: string) {
  const response = await fetch(baseUrl + "/api/events/" + eventId + "/staff", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ name, title: "Operations", isPublic: false }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).staff.id as string;
}

test("vendor service listing supports bounded pagination and status/search filters", async () => {
  const { token, eventId } = await bootstrap("vendor-list");
  await enable(token, eventId, "VENDORS");

  for (const name of ["Catering", "Cleaning", "Security"]) {
    const response = await fetch(baseUrl + "/api/events/" + eventId + "/vendor-services", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ name, category: "Operations" }),
    });
    assert.equal(response.status, 201);
  }

  const response = await fetch(
    baseUrl + "/api/events/" + eventId + "/vendor-services?page=2&limit=1&search=clean",
    { headers: { Authorization: "Bearer " + token } },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.total, 1);
  assert.equal(body.page, 2);
  assert.equal(body.pageSize, 1);
  assert.equal(body.services.length, 0);

  const pageOne = await fetch(
    baseUrl + "/api/events/" + eventId + "/vendor-services?page=1&limit=1&search=clean",
    { headers: { Authorization: "Bearer " + token } },
  );
  const pageOneBody = await pageOne.json();
  assert.equal(pageOneBody.total, 1);
  assert.equal(pageOneBody.services.length, 1);
  assert.equal(pageOneBody.services[0].name, "Cleaning");
});

test("public partner directory uses profile display order and hides contact by default", async () => {
  const { token, eventId } = await bootstrap("partner-order");
  await enable(token, eventId, "PARTNERS");

  const first = await createPartner(token, eventId, "First Partner");
  const second = await createPartner(token, eventId, "Second Partner");

  for (const [id, displayOrder] of [[first, 20], [second, 10]] as const) {
    const response = await fetch(baseUrl + "/api/events/" + eventId + "/partners/" + id + "/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ displayOrder, showContact: false, showWebsite: false }),
    });
    assert.equal(response.status, 200);
  }

  await prisma.event.update({
    where: { id: eventId },
    data: { status: "PUBLISHED", visibility: "public" },
  });

  const response = await fetch(baseUrl + "/api/public/events/" + eventId + "/partners/specialized");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.partners.map((partner: { name: string }) => partner.name), ["Second Partner", "First Partner"]);
  assert.equal(body.partners[0].email, null);
  assert.equal(body.partners[0].phone, null);
  assert.equal(body.partners[0].website, null);
});

test("staff specialization rejects malformed and inverted shift times", async () => {
  const { token, eventId } = await bootstrap("staff-shift");
  await enable(token, eventId, "PARTICIPANTS");
  const staffId = await createStaff(token, eventId, "Shift Staff");

  const malformed = await fetch(baseUrl + "/api/events/" + eventId + "/staff/" + staffId + "/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ shiftStart: "9am", shiftEnd: "18:00" }),
  });
  assert.equal(malformed.status, 400);

  const inverted = await fetch(baseUrl + "/api/events/" + eventId + "/staff/" + staffId + "/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ shiftStart: "18:00", shiftEnd: "09:00" }),
  });
  assert.equal(inverted.status, 400);
});
