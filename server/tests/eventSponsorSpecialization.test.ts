import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => { ({ baseUrl, stop } = await startTestServer()); });
after(async () => { await stop(); });

async function bootstrap(label: string) {
  const signup = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "6-2-sponsor-" + label },
    body: JSON.stringify({
      email: "6-2-sponsor-" + label + "-" + ts + "@example.com",
      password: "TestPassword123!",
      fullName: "Phase 6.2 Sponsor " + label,
      userType: "exhibitor",
    }),
  });
  const signupBody = await signup.json();
  const token = signupBody.token as string;
  const exhibition = await fetch(baseUrl + "/api/exhibitions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ name: "6.2 Sponsor " + label + " " + ts, status: "draft", visibility: "public", ticketTypes: [], stalls: [] }),
  });
  const body = await exhibition.json();
  const eventId = body.exhibition.eventId as string;
  const enable = await fetch(baseUrl + "/api/events/" + eventId + "/modules/SPONSORS", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(enable.status, 200);
  return { token, eventId };
}

async function createSponsor(token: string, eventId: string, name: string) {
  const response = await fetch(baseUrl + "/api/events/" + eventId + "/sponsors", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ name, organization: name, isPublic: true }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).sponsor.id as string;
}

test("sponsor packages support CRUD, archive/restore and sponsor profile assignment", async () => {
  const a = await bootstrap("crud");
  const packageResponse = await fetch(baseUrl + "/api/events/" + a.eventId + "/sponsor-packages", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + a.token },
    body: JSON.stringify({
      name: "Gold",
      description: "Primary event partnership",
      amount: 250000,
      currency: "INR",
      benefits: ["Logo placement", "Stage mention"],
      deliverables: ["Backwall logo", "Social post"],
    }),
  });
  assert.equal(packageResponse.status, 201);
  const sponsorPackage = (await packageResponse.json()).package;
  assert.equal(sponsorPackage.name, "Gold");

  const sponsorId = await createSponsor(a.token, a.eventId, "Acme Corp");
  const profile = await fetch(baseUrl + "/api/events/" + a.eventId + "/sponsors/" + sponsorId + "/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + a.token },
    body: JSON.stringify({
      packageId: sponsorPackage.id,
      amountOverride: 225000,
      logoUrl: "https://example.com/acme.png",
      brandPrimaryColor: "#112233",
      brandSecondaryColor: "#445566",
      displayWebsite: "https://example.com",
      benefitsOverride: ["VIP lounge branding"],
    }),
  });
  assert.equal(profile.status, 200);
  const profileBody = await profile.json();
  assert.equal(profileBody.profile.package.name, "Gold");
  assert.equal(profileBody.profile.brandPrimaryColor, "#112233");

  const list = await fetch(baseUrl + "/api/events/" + a.eventId + "/sponsor-packages?search=Gold", { headers: { Authorization: "Bearer " + a.token } });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).total, 1);

  const update = await fetch(baseUrl + "/api/events/" + a.eventId + "/sponsor-packages/" + sponsorPackage.id, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + a.token },
    body: JSON.stringify({ benefits: ["Logo placement", "Stage mention", "VIP lounge"] }),
  });
  assert.equal(update.status, 200);

  const archive = await fetch(baseUrl + "/api/events/" + a.eventId + "/sponsor-packages/" + sponsorPackage.id, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + a.token },
  });
  assert.equal(archive.status, 204);

  const blockedAssignment = await fetch(baseUrl + "/api/events/" + a.eventId + "/sponsors/" + sponsorId + "/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + a.token },
    body: JSON.stringify({ packageId: sponsorPackage.id }),
  });
  assert.equal(blockedAssignment.status, 409);

  const restore = await fetch(baseUrl + "/api/events/" + a.eventId + "/sponsor-packages/" + sponsorPackage.id + "/restore", {
    method: "POST",
    headers: { Authorization: "Bearer " + a.token },
  });
  assert.equal(restore.status, 200);
});

test("sponsor specialization enforces module and tenant boundaries", async () => {
  const blocked = await bootstrap("blocked");
  await prisma.eventModuleEnablement.updateMany({ where: { eventId: blocked.eventId, moduleType: "SPONSORS" }, data: { enabled: false } });
  const response = await fetch(baseUrl + "/api/events/" + blocked.eventId + "/sponsor-packages", { headers: { Authorization: "Bearer " + blocked.token } });
  assert.equal(response.status, 409);

  const a = await bootstrap("tenant-a");
  const b = await bootstrap("tenant-b");
  const packageResponse = await fetch(baseUrl + "/api/events/" + a.eventId + "/sponsor-packages", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + a.token },
    body: JSON.stringify({ name: "Private Gold" }),
  });
  assert.equal(packageResponse.status, 201);
  const packageId = (await packageResponse.json()).package.id as string;
  const crossTenant = await fetch(baseUrl + "/api/events/" + a.eventId + "/sponsor-packages/" + packageId, { headers: { Authorization: "Bearer " + b.token } });
  assert.equal(crossTenant.status, 404);
});

test("public sponsor API exposes only public sponsor specialization", async () => {
  const a = await bootstrap("public");
  const sponsorId = await createSponsor(a.token, a.eventId, "Public Sponsor");
  const packageResponse = await fetch(baseUrl + "/api/events/" + a.eventId + "/sponsor-packages", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + a.token },
    body: JSON.stringify({ name: "Platinum", benefits: ["Main stage"], deliverables: ["Logo wall"] }),
  });
  const packageId = (await packageResponse.json()).package.id as string;
  await fetch(baseUrl + "/api/events/" + a.eventId + "/sponsors/" + sponsorId + "/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + a.token },
    body: JSON.stringify({ packageId, logoUrl: "https://example.com/logo.png", brandPrimaryColor: "#abcdef", amountOverride: 999999 }),
  });

  await prisma.event.update({ where: { id: a.eventId }, data: { status: "PUBLISHED", visibility: "public" } });
  const response = await fetch(baseUrl + "/api/public/events/" + a.eventId + "/sponsors");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.sponsors.length, 1);
  assert.equal(body.sponsors[0].name, "Public Sponsor");
  assert.equal(body.sponsors[0].sponsorProfile.package.name, "Platinum");
  assert.equal(body.sponsors[0].sponsorProfile.logoUrl, "https://example.com/logo.png");
  assert.equal(body.sponsors[0].sponsorProfile.amountOverride, undefined);

  await prisma.eventSponsorPackage.update({ where: { id: packageId }, data: { status: "ARCHIVED" } });
  const archivedPackageResponse = await fetch(baseUrl + "/api/public/events/" + a.eventId + "/sponsors");
  assert.equal(archivedPackageResponse.status, 200);
  const archivedBody = await archivedPackageResponse.json();
  assert.equal(archivedBody.sponsors[0].sponsorProfile.package, null);
});
