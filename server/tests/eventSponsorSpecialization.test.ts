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
    body: JSON.stringify({ disabledPackageId: sponsorPackage.id }),
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
  const sponsorId = await createSponsor(blocked.token, blocked.eventId, "Disabled Sponsor");
  const packageCreate = await fetch(baseUrl + "/api/events/" + blocked.eventId + "/sponsor-packages", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + blocked.token },
    body: JSON.stringify({ name: "Disabled Sponsor Package" }),
  });
  assert.equal(packageCreate.status, 201);
  const disabledPackageId = (await packageCreate.json()).package.id as string;
  const packageArchive = await fetch(baseUrl + "/api/events/" + blocked.eventId + "/sponsor-packages/" + disabledPackageId, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + blocked.token },
  });
  assert.equal(packageArchive.status, 204);

  const disabled = await prisma.eventModuleEnablement.updateMany({
    where: { eventId: blocked.eventId, moduleType: "SPONSORS" },
    data: { enabled: false },
  });
  assert.equal(disabled.count, 1);
  const response = await fetch(baseUrl + "/api/events/" + blocked.eventId + "/sponsor-packages", { headers: { Authorization: "Bearer " + blocked.token } });
  assert.equal(response.status, 409);

  const packageCreateBlocked = await fetch(baseUrl + "/api/events/" + blocked.eventId + "/sponsor-packages", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + blocked.token },
    body: JSON.stringify({ name: "Must not be created" }),
  });
  assert.equal(packageCreateBlocked.status, 409);
  const packageUpdateBlocked = await fetch(baseUrl + "/api/events/" + blocked.eventId + "/sponsor-packages/" + disabledPackageId, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + blocked.token },
    body: JSON.stringify({ name: "Must not be updated" }),
  });
  assert.equal(packageUpdateBlocked.status, 409);
  const packageDeleteBlocked = await fetch(baseUrl + "/api/events/" + blocked.eventId + "/sponsor-packages/" + disabledPackageId, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + blocked.token },
  });
  assert.equal(packageDeleteBlocked.status, 409);
  const packageRestoreBlocked = await fetch(baseUrl + "/api/events/" + blocked.eventId + "/sponsor-packages/" + disabledPackageId + "/restore", {
    method: "POST",
    headers: { Authorization: "Bearer " + blocked.token },
  });
  assert.equal(packageRestoreBlocked.status, 409);
  const persistedPackage = await prisma.eventSponsorPackage.findUniqueOrThrow({ where: { id: disabledPackageId } });
  assert.equal(persistedPackage.name, "Disabled Sponsor Package", "blocked package update must not change data");
  assert.equal(persistedPackage.status, "ARCHIVED", "blocked package delete/restore must preserve archived status");
  assert.equal(await prisma.eventSponsorPackage.count({ where: { eventId: blocked.eventId } }), 1);

  const profileRead = await fetch(baseUrl + "/api/events/" + blocked.eventId + "/sponsors/" + sponsorId + "/profile", {
    headers: { Authorization: "Bearer " + blocked.token },
  });
  assert.equal(profileRead.status, 409, "disabled SPONSORS module must block profile reads");
  const profileWrite = await fetch(baseUrl + "/api/events/" + blocked.eventId + "/sponsors/" + sponsorId + "/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + blocked.token },
    body: JSON.stringify({ displayDescription: "Must not be saved" }),
  });
  assert.equal(profileWrite.status, 409, "disabled SPONSORS module must block profile writes");
  assert.equal(
    await prisma.eventSponsorProfile.count({ where: { eventId: blocked.eventId } }),
    0,
    "blocked sponsor profile writes must not persist a profile",
  );

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

test("sponsor package and profile mutations reject cross-tenant and wrong-event IDs without changing owner data", async () => {
  const owner = await bootstrap("tenant-mutation-owner");
  const other = await bootstrap("tenant-mutation-other");

  const packageResponse = await fetch(baseUrl + "/api/events/" + owner.eventId + "/sponsor-packages", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + owner.token },
    body: JSON.stringify({ name: "Owner-only Gold", amount: 225000, currency: "INR" }),
  });
  assert.equal(packageResponse.status, 201);
  const packageId = (await packageResponse.json()).package.id as string;

  const sponsorId = await createSponsor(owner.token, owner.eventId, "Owner-only Sponsor");
  const profileResponse = await fetch(baseUrl + "/api/events/" + owner.eventId + "/sponsors/" + sponsorId + "/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + owner.token },
    body: JSON.stringify({
      packageId,
      amountOverride: 210000,
      logoUrl: "https://example.com/owner-sponsor.png",
      brandPrimaryColor: "#112233",
    }),
  });
  assert.equal(profileResponse.status, 200);

  const crossTenantRequests: Array<{ name: string; path: string; init?: RequestInit }> = [
    {
      name: "cross-tenant package update",
      path: "/api/events/" + owner.eventId + "/sponsor-packages/" + packageId,
      init: {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + other.token },
        body: JSON.stringify({ name: "Unauthorized package overwrite", amount: 1 }),
      },
    },
    {
      name: "cross-tenant package archive",
      path: "/api/events/" + owner.eventId + "/sponsor-packages/" + packageId,
      init: { method: "DELETE", headers: { Authorization: "Bearer " + other.token } },
    },
    {
      name: "cross-tenant package restore",
      path: "/api/events/" + owner.eventId + "/sponsor-packages/" + packageId + "/restore",
      init: { method: "POST", headers: { Authorization: "Bearer " + other.token } },
    },
    {
      name: "wrong-event package update",
      path: "/api/events/" + other.eventId + "/sponsor-packages/" + packageId,
      init: {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + owner.token },
        body: JSON.stringify({ name: "Wrong-event overwrite" }),
      },
    },
    {
      name: "cross-tenant sponsor profile update",
      path: "/api/events/" + owner.eventId + "/sponsors/" + sponsorId + "/profile",
      init: {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + other.token },
        body: JSON.stringify({ amountOverride: 1, logoUrl: "https://example.com/attacker.png" }),
      },
    },
    {
      name: "wrong-event sponsor profile update",
      path: "/api/events/" + other.eventId + "/sponsors/" + sponsorId + "/profile",
      init: {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + owner.token },
        body: JSON.stringify({ amountOverride: 1 }),
      },
    },
  ];

  for (const item of crossTenantRequests) {
    const response = await fetch(baseUrl + item.path, item.init);
    assert.equal(response.status, 404, item.name + " must be denied without exposing the resource");
  }

  const persistedPackage = await prisma.eventSponsorPackage.findUniqueOrThrow({ where: { id: packageId } });
  assert.equal(persistedPackage.name, "Owner-only Gold");
  assert.equal(persistedPackage.status, "ACTIVE");
  assert.equal(Number(persistedPackage.amount), 225000);

  const persistedProfile = await prisma.eventSponsorProfile.findUniqueOrThrow({ where: { participantId: sponsorId } });
  assert.equal(persistedProfile.eventId, owner.eventId);
  assert.equal(persistedProfile.packageId, packageId);
  assert.equal(Number(persistedProfile.amountOverride), 210000);
  assert.equal(persistedProfile.logoUrl, "https://example.com/owner-sponsor.png");
  assert.equal(persistedProfile.brandPrimaryColor, "#112233");
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
