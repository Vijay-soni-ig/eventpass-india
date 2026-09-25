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
  const email = `media-${label}-${ts}@example.com`;
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `media-${label}` },
    body: JSON.stringify({ email, password: "TestPassword123!", fullName: `Media ${label}`, userType: "exhibitor" }),
  });
  const body = await res.json();
  return { token: body.token as string, userId: body.user.id as string };
}

async function bootstrapEvent(label: string) {
  const { token, userId } = await signup(label);
  const exhibition = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: `Media bootstrap ${label} ${ts}`, status: "draft", visibility: "public", ticketTypes: [], stalls: [] }),
  }).then((r) => r.json());

  const eventRes = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: `Media Event ${label} ${ts}`,
      status: "PUBLISHED",
      visibility: "public",
      city: "Ahmedabad",
      venue: "Media Hall",
      startDate: "2027-06-01",
      endDate: "2027-06-02",
      modules: ["PARTICIPANTS"],
    }),
  });
  const eventBody = await eventRes.json();
  const participant = await prisma.eventParticipant.create({
    data: { eventId: eventBody.event.id, participantType: "SPEAKER", name: `Speaker ${label}`, isPublic: true },
  });
  return { token, userId, organizerId: exhibition.exhibition.organizerId as string, eventId: eventBody.event.id as string, participantId: participant.id };
}

function pngBlob() {
  return new Blob([
    Uint8Array.from([
      0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,
      0x00,0x00,0x00,0x0d,0x49,0x48,0x44,0x52,
      0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,
      0x08,0x06,0x00,0x00,0x00,0x1f,0x15,0xc4,
      0x89,0x00,0x00,0x00,0x0a,0x49,0x44,0x41,0x54,
      0x78,0x9c,0x63,0x00,0x01,0x00,0x00,0x05,0x00,0x01,
      0x0d,0x0a,0x2d,0xb4,0x00,0x00,0x00,0x00,0x49,0x45,0x4e,0x44,0xae,0x42,0x60,0x82,
    ]),
  ], { type: "image/png" });
}

async function upload(token: string, eventId: string, participantId: string, kind: string, visibility = "PUBLIC") {
  const form = new FormData();
  form.append("kind", kind);
  form.append("caption", `${kind} caption`);
  form.append("altText", `${kind} alt`);
  form.append("file", pngBlob(), "participant.png");
  const res = await fetch(
    `${baseUrl}/api/events/${eventId}/participants/${participantId}/media?visibility=${visibility}`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form },
  );
  return { status: res.status, body: await res.json() };
}

test("6.3A media lifecycle: validated upload creates ordered profile/gallery media and profile image updates photoUrl", async () => {
  const ctx = await bootstrapEvent("lifecycle");
  const profile = await upload(ctx.token, ctx.eventId, ctx.participantId, "PROFILE_IMAGE");
  assert.equal(profile.status, 201);
  assert.equal(profile.body.media.kind, "PROFILE_IMAGE");
  assert.equal(profile.body.media.mimeType, "image/png");
  assert.ok(profile.body.media.fileSizeBytes > 0);

  const gallery = await upload(ctx.token, ctx.eventId, ctx.participantId, "GALLERY");
  assert.equal(gallery.status, 201);
  assert.equal(gallery.body.media.sortOrder, profile.body.media.sortOrder + 1);

  const participant = await prisma.eventParticipant.findUniqueOrThrow({ where: { id: ctx.participantId } });
  assert.equal(participant.photoUrl, profile.body.media.fileUrl);

  const list = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/media`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  }).then((r) => r.json());
  assert.equal(list.items.length, 2);
});

test("6.3A media security: private media is never returned by public endpoint and is readable only through authenticated event-scoped access", async () => {
  const ctx = await bootstrapEvent("privacy");
  const privateUpload = await upload(ctx.token, ctx.eventId, ctx.participantId, "GALLERY", "PRIVATE");
  assert.equal(privateUpload.status, 201);
  assert.equal(privateUpload.body.media.visibility, "PRIVATE");
  assert.match(privateUpload.body.media.fileUrl, /^local:\/\/participant-media-private\//);

  const publicRes = await fetch(`${baseUrl}/api/public/events/${ctx.eventId}/participants/${ctx.participantId}/media`);
  assert.equal(publicRes.status, 200);
  const publicBody = await publicRes.json();
  assert.equal(publicBody.items.length, 0);

  const privateFile = await fetch(
    `${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/media/${privateUpload.body.media.id}/file`,
    { headers: { Authorization: `Bearer ${ctx.token}` } },
  );
  assert.equal(privateFile.status, 200);
  assert.equal(privateFile.headers.get("content-type"), "image/png");

  const directPrivateUrl = privateUpload.body.media.fileUrl.replace(/^local:\/\//, "/uploads/");
  const directRes = await fetch(`${baseUrl}${directPrivateUrl}`);
  assert.equal(directRes.status, 404, "private local storage must not be directly served by the static uploads mount");
});

test("6.3A media isolation: another organizer cannot list or mutate participant media", async () => {
  const owner = await bootstrapEvent("owner");
  const other = await bootstrapEvent("other");
  const uploaded = await upload(owner.token, owner.eventId, owner.participantId, "GALLERY");
  assert.equal(uploaded.status, 201);

  const listAsOther = await fetch(
    `${baseUrl}/api/events/${owner.eventId}/participants/${owner.participantId}/media`,
    { headers: { Authorization: `Bearer ${other.token}` } },
  );
  assert.equal(listAsOther.status, 404);

  const deleteAsOther = await fetch(
    `${baseUrl}/api/events/${owner.eventId}/participants/${owner.participantId}/media/${uploaded.body.media.id}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${other.token}` } },
  );
  assert.equal(deleteAsOther.status, 404);

  const crossUpload = await upload(other.token, owner.eventId, owner.participantId, "GALLERY");
  assert.equal(crossUpload.status, 404, "cross-organizer upload must be rejected before the file is persisted");
});

test("6.3A media validation: unsupported file types and invalid visibility are rejected", async () => {
  const ctx = await bootstrapEvent("validation");
  const form = new FormData();
  form.append("kind", "GALLERY");
  form.append("file", new Blob(["not an image"], { type: "text/plain" }), "bad.txt");

  const badFile = await fetch(
    `${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/media?visibility=PUBLIC`,
    { method: "POST", headers: { Authorization: `Bearer ${ctx.token}` }, body: form },
  );
  assert.equal(badFile.status, 400);

  const badVisibility = await upload(ctx.token, ctx.eventId, ctx.participantId, "GALLERY", "SIDEWAYS");
  assert.equal(badVisibility.status, 400);

  const privateProfile = await upload(ctx.token, ctx.eventId, ctx.participantId, "PROFILE_IMAGE", "PRIVATE");
  assert.equal(privateProfile.status, 400);
});

test("6.3A public media: only published/public active participants expose public media", async () => {
  const ctx = await bootstrapEvent("public");
  const uploaded = await upload(ctx.token, ctx.eventId, ctx.participantId, "GALLERY");
  assert.equal(uploaded.status, 201);

  const publicRes = await fetch(`${baseUrl}/api/public/events/${ctx.eventId}/participants/${ctx.participantId}/media`);
  assert.equal(publicRes.status, 200);
  const body = await publicRes.json();
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].visibility, undefined, "public projection must not expose internal visibility");
  assert.equal(body.items[0].fileUrl, uploaded.body.media.fileUrl);

  await prisma.eventParticipant.update({ where: { id: ctx.participantId }, data: { isPublic: false } });
  const hiddenRes = await fetch(`${baseUrl}/api/public/events/${ctx.eventId}/participants/${ctx.participantId}/media`);
  assert.equal(hiddenRes.status, 404);
});

test("6.3B public profile: published public participant exposes safe profile fields and public media only", async () => {
  const ctx = await bootstrapEvent("profile");
  await prisma.eventParticipant.update({
    where: { id: ctx.participantId },
    data: { title: "Keynote Speaker", organization: "ExhibitTix Labs", bio: "A public speaker bio.", website: "https://example.com" },
  });
  const uploaded = await upload(ctx.token, ctx.eventId, ctx.participantId, "GALLERY");

  const response = await fetch(`${baseUrl}/api/public/events/${ctx.eventId}/participants/${ctx.participantId}/profile`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.participant.name.startsWith("Speaker "), true);
  assert.equal(body.participant.title, "Keynote Speaker");
  assert.equal(body.participant.organization, "ExhibitTix Labs");
  assert.equal(body.participant.bio, "A public speaker bio.");
  assert.equal(body.participant.website, "https://example.com");
  assert.equal(body.participant.email, undefined);
  assert.equal(body.participant.phone, undefined);
  assert.equal(body.media.length, 1);
  assert.equal(body.media[0].id, uploaded.body.media.id);

  await prisma.eventParticipant.update({ where: { id: ctx.participantId }, data: { isPublic: false } });
  const hidden = await fetch(`${baseUrl}/api/public/events/${ctx.eventId}/participants/${ctx.participantId}/profile`);
  assert.equal(hidden.status, 404);
});

test("6.3C public speaker schedule: only published sessions for the public speaker are exposed in chronological order", async () => {
  const ctx = await bootstrapEvent("schedule");
  await prisma.eventModuleEnablement.upsert({
    where: { eventId_moduleType: { eventId: ctx.eventId, moduleType: "SESSIONS" } },
    update: { enabled: true },
    create: { eventId: ctx.eventId, moduleType: "SESSIONS", enabled: true },
  });
  const first = await prisma.eventSession.create({
    data: {
      eventId: ctx.eventId, title: "Opening keynote", description: "Opening session",
      date: new Date("2027-06-01T00:00:00.000Z"), startTime: "09:00", endTime: "10:00",
      timezone: "Asia/Kolkata", room: "Hall A", status: "PUBLISHED",
      speakers: { create: { participantId: ctx.participantId, role: "PRIMARY", sortOrder: 0 } },
    },
  });
  await prisma.eventSession.create({
    data: {
      eventId: ctx.eventId, title: "Draft session", date: new Date("2027-06-01T00:00:00.000Z"),
      startTime: "11:00", endTime: "12:00", timezone: "Asia/Kolkata", status: "DRAFT",
      speakers: { create: { participantId: ctx.participantId, role: "PRIMARY", sortOrder: 0 } },
    },
  });
  const response = await fetch(baseUrl + "/api/public/events/" + ctx.eventId + "/participants/" + ctx.participantId + "/sessions");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.sessions.length, 1);
  assert.equal(body.sessions[0].id, first.id);
  assert.equal(body.sessions[0].title, "Opening keynote");
  assert.equal(body.sessions[0].room, "Hall A");
  assert.equal(body.sessions[0].speakers[0].participant.id, ctx.participantId);
  assert.equal(body.sessions[0].speakers[0].participant.email, undefined);
  assert.equal(body.sessions[0].speakers[0].participant.phone, undefined);
});

test("6.3C public speaker schedule: private and non-speaker participants cannot access a schedule", async () => {
  const ctx = await bootstrapEvent("schedule-gate");
  await prisma.eventModuleEnablement.upsert({
    where: { eventId_moduleType: { eventId: ctx.eventId, moduleType: "SESSIONS" } },
    update: { enabled: true },
    create: { eventId: ctx.eventId, moduleType: "SESSIONS", enabled: true },
  });
  const privateSpeaker = await prisma.eventParticipant.create({
    data: { eventId: ctx.eventId, participantType: "SPEAKER", name: "Private Speaker", isPublic: false },
  });
  await prisma.eventSession.create({
    data: {
      eventId: ctx.eventId, title: "Private keynote", date: new Date("2027-06-01T00:00:00.000Z"),
      startTime: "13:00", endTime: "14:00", status: "PUBLISHED",
      speakers: { create: { participantId: privateSpeaker.id, role: "PRIMARY" } },
    },
  });
  const privateResponse = await fetch(baseUrl + "/api/public/events/" + ctx.eventId + "/participants/" + privateSpeaker.id + "/sessions");
  assert.equal(privateResponse.status, 404);
  const nonSpeaker = await prisma.eventParticipant.create({
    data: { eventId: ctx.eventId, participantType: "SPONSOR", name: "Sponsor", isPublic: true },
  });
  const nonSpeakerResponse = await fetch(baseUrl + "/api/public/events/" + ctx.eventId + "/participants/" + nonSpeaker.id + "/sessions");
  assert.equal(nonSpeakerResponse.status, 404);
});


test("6.3D public sponsor commercial profile: active package presentation is public-safe and pricing stays private", async () => {
  const ctx = await bootstrapEvent("sponsor-commercial");
  const sponsor = await prisma.eventParticipant.update({
    where: { id: ctx.participantId },
    data: { participantType: "SPONSOR", name: "Acme Sponsor", organization: "Acme Corp" },
  });

  await prisma.eventModuleEnablement.upsert({
    where: { eventId_moduleType: { eventId: ctx.eventId, moduleType: "SPONSORS" } },
    update: { enabled: true },
    create: { eventId: ctx.eventId, moduleType: "SPONSORS", enabled: true },
  });

  const sponsorPackage = await prisma.eventSponsorPackage.create({
    data: {
      eventId: ctx.eventId,
      name: "Gold Partner",
      description: "Premium event partnership",
      amount: 250000,
      currency: "INR",
      benefits: ["Logo placement", "Stage mention"],
      deliverables: ["Booth branding"],
      status: "ACTIVE",
    },
  });

  await prisma.eventSponsorProfile.create({
    data: {
      eventId: ctx.eventId,
      participantId: sponsor.id,
      packageId: sponsorPackage.id,
      amountOverride: 275000,
      currency: "INR",
      benefitsOverride: ["VIP logo placement"],
      deliverablesOverride: ["Opening ceremony mention"],
      displayWebsite: "https://example.com/sponsor",
      brandPrimaryColor: "#123456",
    },
  });

  const response = await fetch(baseUrl + "/api/public/events/" + ctx.eventId + "/participants/" + ctx.participantId + "/profile");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.participant.sponsorProfile.package.name, "Gold Partner");
  assert.deepEqual(body.participant.sponsorProfile.benefitsOverride, ["VIP logo placement"]);
  assert.deepEqual(body.participant.sponsorProfile.deliverablesOverride, ["Opening ceremony mention"]);
  assert.equal(body.participant.sponsorProfile.displayWebsite, "https://example.com/sponsor");
  assert.equal(body.participant.sponsorProfile.amountOverride, undefined);
  assert.equal(body.participant.sponsorProfile.package.amount, undefined);
  assert.equal(body.participant.sponsorProfile.package.currency, undefined);

  await prisma.eventSponsorPackage.update({ where: { id: sponsorPackage.id }, data: { status: "ARCHIVED" } });
  const archivedPackageResponse = await fetch(baseUrl + "/api/public/events/" + ctx.eventId + "/participants/" + ctx.participantId + "/profile");
  assert.equal(archivedPackageResponse.status, 200);
  const archivedBody = await archivedPackageResponse.json();
  assert.equal(archivedBody.participant.sponsorProfile.package, null);
});


test("6.3E public vendor operations profile: only active services and safe operational fields are exposed", async () => {
  const ctx = await bootstrapEvent("vendor-operations");
  const vendor = await prisma.eventParticipant.update({
    where: { id: ctx.participantId },
    data: { participantType: "VENDOR", name: "Acme Services", organization: "Acme Corp" },
  });
  await prisma.eventModuleEnablement.upsert({
    where: { eventId_moduleType: { eventId: ctx.eventId, moduleType: "VENDORS" } },
    update: { enabled: true },
    create: { eventId: ctx.eventId, moduleType: "VENDORS", enabled: true },
  });
  const active = await prisma.eventVendorService.create({
    data: { eventId: ctx.eventId, name: "Event Logistics", category: "Operations", description: "On-site event logistics", status: "ACTIVE" },
  });
  await prisma.eventVendorService.create({
    data: { eventId: ctx.eventId, name: "Private Service", status: "INACTIVE" },
  });
  await prisma.eventVendorProfile.create({
    data: {
      eventId: ctx.eventId,
      participantId: vendor.id,
      contactName: "Private Contact",
      contactEmail: "private@example.com",
      contactPhone: "+91 9999999999",
      serviceArea: "Ahmedabad",
      operatingHours: "09:00-18:00",
      displayWebsite: "https://example.com/vendor",
      services: { create: { serviceId: active.id, sortOrder: 0 } },
    },
  });

  const response = await fetch(baseUrl + "/api/public/events/" + ctx.eventId + "/participants/" + ctx.participantId + "/profile");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.participant.vendorProfile.serviceArea, "Ahmedabad");
  assert.equal(body.participant.vendorProfile.operatingHours, "09:00-18:00");
  assert.equal(body.participant.vendorProfile.displayWebsite, "https://example.com/vendor");
  assert.equal(body.participant.vendorProfile.services.length, 1);
  assert.equal(body.participant.vendorProfile.services[0].name, "Event Logistics");
  assert.equal(body.participant.vendorProfile.contactEmail, undefined);
  assert.equal(body.participant.vendorProfile.contactPhone, undefined);
});
