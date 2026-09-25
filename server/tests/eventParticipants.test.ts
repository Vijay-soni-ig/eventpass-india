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
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "participants-" + label },
    body: JSON.stringify({
      email: "participants-" + label + "-" + ts + "@example.com",
      password: "TestPassword123!",
      fullName: "Participant " + label,
      userType: "exhibitor",
    }),
  });
  const body = await res.json();
  return { token: body.token as string };
}

async function bootstrap(label: string) {
  const { token } = await signup(label);
  const res = await fetch(baseUrl + "/api/exhibitions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({
      name: "Participant bootstrap " + label + " " + ts,
      status: "draft",
      visibility: "public",
      ticketTypes: [],
      stalls: [],
    }),
  });
  const body = await res.json();
  return { token, eventId: body.exhibition.eventId as string };
}

async function enableParticipants(token: string, eventId: string) {
  const res = await fetch(baseUrl + "/api/events/" + eventId + "/modules/PARTICIPANTS", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(res.status, 200);
}

test("participant CRUD: create, list, update, archive, restore", async () => {
  const { token, eventId } = await bootstrap("crud");
  await enableParticipants(token, eventId);

  const create = await fetch(baseUrl + "/api/events/" + eventId + "/participants", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({
      participantType: "SPEAKER",
      name: "Asha Patel",
      title: "Product Designer",
      organization: "Example Labs",
      bio: "Talks about product design.",
      isPublic: true,
      sortOrder: 1,
    }),
  });
  assert.equal(create.status, 201);
  const created = await create.json();
  const participantId = created.participant.id as string;

  const list = await fetch(baseUrl + "/api/events/" + eventId + "/participants?type=SPEAKER", {
    headers: { Authorization: "Bearer " + token },
  });
  const listBody = await list.json();
  assert.equal(list.status, 200);
  assert.equal(listBody.total, 1);
  assert.equal(listBody.participants[0].name, "Asha Patel");

  const update = await fetch(baseUrl + "/api/events/" + eventId + "/participants/" + participantId, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ title: "Lead Product Designer" }),
  });
  assert.equal(update.status, 200);
  assert.equal((await update.json()).participant.title, "Lead Product Designer");

  const archive = await fetch(baseUrl + "/api/events/" + eventId + "/participants/" + participantId, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + token },
  });
  assert.equal(archive.status, 204);

  const hiddenList = await fetch(baseUrl + "/api/events/" + eventId + "/participants", {
    headers: { Authorization: "Bearer " + token },
  });
  assert.equal((await hiddenList.json()).total, 0);

  const restore = await fetch(baseUrl + "/api/events/" + eventId + "/participants/" + participantId + "/restore", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
  });
  assert.equal(restore.status, 200);
});

test("participant validation and module gating", async () => {
  const { token, eventId } = await bootstrap("validation");

  const blocked = await fetch(baseUrl + "/api/events/" + eventId + "/participants", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ participantType: "CUSTOM", name: "Custom Person" }),
  });
  assert.equal(blocked.status, 409);

  await enableParticipants(token, eventId);

  const invalid = await fetch(baseUrl + "/api/events/" + eventId + "/participants", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ participantType: "CUSTOM", name: "Custom Person" }),
  });
  assert.equal(invalid.status, 400);

  const valid = await fetch(baseUrl + "/api/events/" + eventId + "/participants", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ participantType: "CUSTOM", customType: "Judge", name: "Custom Person" }),
  });
  assert.equal(valid.status, 201);
});

test("generic participant API keeps STAFF records private", async () => {
  const { token, eventId } = await bootstrap("staff-privacy");
  await enableParticipants(token, eventId);

  const blocked = await fetch(baseUrl + "/api/events/" + eventId + "/participants", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ participantType: "STAFF", name: "Event Staff", isPublic: true }),
  });
  assert.equal(blocked.status, 400);

  const staff = await fetch(baseUrl + "/api/events/" + eventId + "/participants", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ participantType: "STAFF", name: "Private Staff", isPublic: false }),
  });
  assert.equal(staff.status, 201);

  const staffBody = await staff.json();
  assert.equal(staffBody.participant.participantType, "STAFF");
  assert.equal(staffBody.participant.isPublic, false);

  await prisma.event.update({
    where: { id: eventId },
    data: { status: "PUBLISHED", visibility: "public" },
  });

  const publicResponse = await fetch(baseUrl + "/api/public/events/" + eventId + "/participants");
  assert.equal(publicResponse.status, 200);
  assert.equal((await publicResponse.json()).participants.length, 0);
});

test("participant PATCH cannot create an archive state without archive metadata", async () => {
  const { token, eventId } = await bootstrap("archive-integrity");
  await enableParticipants(token, eventId);

  const create = await fetch(baseUrl + "/api/events/" + eventId + "/participants", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ participantType: "SPEAKER", name: "Archive Integrity Speaker" }),
  });
  assert.equal(create.status, 201);
  const participantId = (await create.json()).participant.id as string;

  const invalidArchive = await fetch(baseUrl + "/api/events/" + eventId + "/participants/" + participantId, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ status: "ARCHIVED" }),
  });
  assert.equal(invalidArchive.status, 400);

  const list = await fetch(baseUrl + "/api/events/" + eventId + "/participants?status=ACTIVE", {
    headers: { Authorization: "Bearer " + token },
  });
  const body = await list.json();
  assert.equal(body.total, 1);
  assert.equal(body.participants[0].status, "ACTIVE");

  const archive = await fetch(baseUrl + "/api/events/" + eventId + "/participants/" + participantId, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + token },
  });
  assert.equal(archive.status, 204);

  const restore = await fetch(baseUrl + "/api/events/" + eventId + "/participants/" + participantId + "/restore", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
  });
  assert.equal(restore.status, 200);
});

test("participant authorization: cross-organizer access returns 404", async () => {
  const a = await bootstrap("cross-a");
  const b = await bootstrap("cross-b");
  const res = await fetch(baseUrl + "/api/events/" + a.eventId + "/participants", {
    headers: { Authorization: "Bearer " + b.token },
  });
  assert.equal(res.status, 404);
});

test("public participants require a published event and only expose public active records", async () => {
  const { token, eventId } = await bootstrap("public");
  await enableParticipants(token, eventId);

  const create = await fetch(baseUrl + "/api/events/" + eventId + "/participants", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ participantType: "SPONSOR", name: "Private Sponsor", isPublic: false }),
  });
  assert.equal(create.status, 201);

  const draftResponse = await fetch(baseUrl + "/api/public/events/" + eventId + "/participants");
  assert.equal(draftResponse.status, 404);

  await prisma.event.update({
    where: { id: eventId },
    data: { status: "PUBLISHED", visibility: "public" },
  });

  const publicResponse = await fetch(baseUrl + "/api/public/events/" + eventId + "/participants");
  assert.equal(publicResponse.status, 200);
  assert.equal((await publicResponse.json()).participants.length, 0);
});


test("participant list supports pagination sorting and inactive status", async () => {
  const { token, eventId } = await bootstrap("paging");
  await enableParticipants(token, eventId);

  for (const [name, organization] of [["Zed Person", "Beta"], ["Asha Person", "Gamma"], ["Mira Person", "Alpha"]]) {
    const res = await fetch(baseUrl + "/api/events/" + eventId + "/participants", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ participantType: "CUSTOM", customType: "Guest", name, organization }),
    });
    assert.equal(res.status, 201);
  }

  const sorted = await fetch(baseUrl + "/api/events/" + eventId + "/participants?sortBy=name&sortDir=asc&page=1&limit=2", {
    headers: { Authorization: "Bearer " + token },
  });
  assert.equal(sorted.status, 200);
  const sortedBody = await sorted.json();
  assert.equal(sortedBody.total, 3);
  assert.equal(sortedBody.page, 1);
  assert.equal(sortedBody.pageSize, 2);
  assert.deepEqual(sortedBody.participants.map((item: { name: string }) => item.name), ["Asha Person", "Mira Person"]);

  const secondPage = await fetch(baseUrl + "/api/events/" + eventId + "/participants?sortBy=name&sortDir=asc&page=2&limit=2", {
    headers: { Authorization: "Bearer " + token },
  });
  assert.equal((await secondPage.json()).participants[0].name, "Zed Person");

  const id = sortedBody.participants[0].id;
  const inactive = await fetch(baseUrl + "/api/events/" + eventId + "/participants/" + id, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ status: "INACTIVE" }),
  });
  assert.equal(inactive.status, 200);

  const inactiveList = await fetch(baseUrl + "/api/events/" + eventId + "/participants?status=INACTIVE", {
    headers: { Authorization: "Bearer " + token },
  });
  assert.equal((await inactiveList.json()).total, 1);
});

test("participant reads are gated by the module after authorization", async () => {
  const a = await bootstrap("read-gate-a");
  const b = await bootstrap("read-gate-b");
  await enableParticipants(a.token, a.eventId);

  const unauthorized = await fetch(baseUrl + "/api/events/" + a.eventId + "/participants", {
    headers: { Authorization: "Bearer " + b.token },
  });
  assert.equal(unauthorized.status, 404);

  const disabled = await fetch(baseUrl + "/api/events/" + b.eventId + "/participants", {
    headers: { Authorization: "Bearer " + b.token },
  });
  assert.equal(disabled.status, 409);
});

test("public event exposes only types whose participant module is enabled", async () => {
  const { token, eventId } = await bootstrap("public-module");
  const enableSpeaker = await fetch(baseUrl + "/api/events/" + eventId + "/modules/SPEAKERS", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(enableSpeaker.status, 200);

  const createSpeaker = await fetch(baseUrl + "/api/events/" + eventId + "/speakers", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ name: "Public Speaker", isPublic: true }),
  });
  assert.equal(createSpeaker.status, 201);

  await prisma.event.update({ where: { id: eventId }, data: { status: "PUBLISHED", visibility: "public" } });

  const response = await fetch(baseUrl + "/api/public/events/" + eventId + "/participants");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.participants.length, 1);
  assert.equal(body.participants[0].participantType, "SPEAKER");
});

test("specialized participant APIs report their own disabled module", async () => {
  const cases = [
    { label: "speaker-module-error", path: "speakers", type: "SPEAKERS", name: "Speaker" },
    { label: "sponsor-module-error", path: "sponsors", type: "SPONSORS", name: "Sponsor" },
    { label: "vendor-module-error", path: "vendors", type: "VENDORS", name: "Vendor" },
    { label: "partner-module-error", path: "partners", type: "PARTNERS", name: "Partner" },
    { label: "staff-module-error", path: "staff", type: "PARTICIPANTS", name: "Staff" },
  ] as const;

  for (const item of cases) {
    const { token, eventId } = await bootstrap(item.label);
    const response = await fetch(baseUrl + "/api/events/" + eventId + "/" + item.path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ name: item.name }),
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "The " + item.type + " module is not enabled for this event");
  }
});

test("participant RBAC matrix: view-only finance can read but cannot mutate", async () => {
  const owner = await bootstrap("rbac-owner");
  await enableParticipants(owner.token, owner.eventId);

  const financeSignup = await signup("rbac-finance");
  const event = await prisma.event.findUnique({ where: { id: owner.eventId }, select: { organizerId: true } });
  assert.ok(event?.organizerId);

  await prisma.organizerMembership.create({
    data: {
      organizerId: event.organizerId,
      userId: (await prisma.user.findUniqueOrThrow({ where: { email: "participants-rbac-finance-" + ts + "@example.com" }, select: { id: true } })).id,
      role: "finance",
      status: "active",
    },
  });

  const read = await fetch(baseUrl + "/api/events/" + owner.eventId + "/participants", {
    headers: { Authorization: "Bearer " + financeSignup.token },
  });
  assert.equal(read.status, 200);

  const mutation = await fetch(baseUrl + "/api/events/" + owner.eventId + "/participants", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + financeSignup.token },
    body: JSON.stringify({ participantType: "SPEAKER", name: "Finance Must Not Create" }),
  });
  assert.equal(mutation.status, 404);
});

test("participant RBAC matrix: operations role can mutate within its organizer", async () => {
  const owner = await bootstrap("rbac-operations");
  await enableParticipants(owner.token, owner.eventId);

  const operationsSignup = await signup("rbac-ops");
  const event = await prisma.event.findUniqueOrThrow({ where: { id: owner.eventId }, select: { organizerId: true } });
  const opsUser = await prisma.user.findUniqueOrThrow({
    where: { email: "participants-rbac-ops-" + ts + "@example.com" },
    select: { id: true },
  });

  await prisma.organizerMembership.create({
    data: { organizerId: event.organizerId, userId: opsUser.id, role: "operations", status: "active" },
  });

  const create = await fetch(baseUrl + "/api/events/" + owner.eventId + "/participants", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + operationsSignup.token },
    body: JSON.stringify({ participantType: "SPEAKER", name: "Operations Speaker" }),
  });
  assert.equal(create.status, 201);
});

test("participant RBAC matrix: suspended organizer blocks existing members", async () => {
  const owner = await bootstrap("rbac-suspended");
  await enableParticipants(owner.token, owner.eventId);

  const memberSignup = await signup("rbac-suspended-member");
  const event = await prisma.event.findUniqueOrThrow({ where: { id: owner.eventId }, select: { organizerId: true } });
  const member = await prisma.user.findUniqueOrThrow({
    where: { email: "participants-rbac-suspended-member-" + ts + "@example.com" },
    select: { id: true },
  });

  await prisma.organizerMembership.create({
    data: { organizerId: event.organizerId, userId: member.id, role: "finance", status: "active" },
  });
  await prisma.organizer.update({ where: { id: event.organizerId }, data: { suspended: true } });

  const read = await fetch(baseUrl + "/api/events/" + owner.eventId + "/participants", {
    headers: { Authorization: "Bearer " + memberSignup.token },
  });
  assert.equal(read.status, 404);
});

test("participant module independence: PARTICIPANTS does not implicitly enable SPEAKERS", async () => {
  const { token, eventId } = await bootstrap("module-independence");
  await enableParticipants(token, eventId);

  const create = await fetch(baseUrl + "/api/events/" + eventId + "/speakers", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ name: "Module Isolation Speaker" }),
  });
  assert.equal(create.status, 409);
  assert.equal((await create.json()).error, "The SPEAKERS module is not enabled for this event");
});

test("participant RBAC matrix: marketing and scanner are read-only", async () => {
  const owner = await bootstrap("rbac-read-only-roles");
  await enableParticipants(owner.token, owner.eventId);

  for (const [label, role] of [["marketing", "marketing"], ["scanner", "scanner"]] as const) {
    const memberSignup = await signup("rbac-" + label);
    const member = await prisma.user.findUniqueOrThrow({
      where: { email: "participants-rbac-" + label + "-" + ts + "@example.com" },
      select: { id: true },
    });
    const event = await prisma.event.findUniqueOrThrow({ where: { id: owner.eventId }, select: { organizerId: true } });

    await prisma.organizerMembership.create({
      data: { organizerId: event.organizerId, userId: member.id, role, status: "active" },
    });

    const read = await fetch(baseUrl + "/api/events/" + owner.eventId + "/participants", {
      headers: { Authorization: "Bearer " + memberSignup.token },
    });
    assert.equal(read.status, 200);

    const mutation = await fetch(baseUrl + "/api/events/" + owner.eventId + "/participants", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + memberSignup.token },
      body: JSON.stringify({ participantType: "SPEAKER", name: label + " must not create" }),
    });
    assert.equal(mutation.status, 404);
  }
});

test("participant RBAC matrix: admin can mutate and restore within organizer scope", async () => {
  const owner = await bootstrap("rbac-admin");
  await enableParticipants(owner.token, owner.eventId);

  const adminSignup = await signup("rbac-admin-member");
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "participants-rbac-admin-member-" + ts + "@example.com" },
    select: { id: true },
  });
  const event = await prisma.event.findUniqueOrThrow({ where: { id: owner.eventId }, select: { organizerId: true } });

  await prisma.organizerMembership.create({
    data: { organizerId: event.organizerId, userId: admin.id, role: "admin", status: "active" },
  });

  const create = await fetch(baseUrl + "/api/events/" + owner.eventId + "/participants", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + adminSignup.token },
    body: JSON.stringify({ participantType: "SPEAKER", name: "Admin Speaker" }),
  });
  assert.equal(create.status, 201);
  const participantId = (await create.json()).participant.id as string;

  const archive = await fetch(baseUrl + "/api/events/" + owner.eventId + "/participants/" + participantId, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + adminSignup.token },
  });
  assert.equal(archive.status, 204);

  const restore = await fetch(baseUrl + "/api/events/" + owner.eventId + "/participants/" + participantId + "/restore", {
    method: "POST",
    headers: { Authorization: "Bearer " + adminSignup.token },
  });
  assert.equal(restore.status, 200);
});


test("specialized participant APIs enforce the same RBAC boundaries", async () => {
  const cases = [
    { label: "speaker-rbac", path: "speakers", module: "SPEAKERS", payload: { name: "RBAC Speaker" } },
    { label: "sponsor-rbac", path: "sponsors", module: "SPONSORS", payload: { name: "RBAC Sponsor" } },
    { label: "vendor-rbac", path: "vendors", module: "VENDORS", payload: { name: "RBAC Vendor" } },
    { label: "partner-rbac", path: "partners", module: "PARTNERS", payload: { name: "RBAC Partner" } },
    { label: "staff-rbac", path: "staff", module: "PARTICIPANTS", payload: { name: "RBAC Staff" } },
  ] as const;

  const owner = await bootstrap("rbac-specialized-owner");

  const ownerEvent = await prisma.event.findUniqueOrThrow({
    where: { id: owner.eventId },
    select: { organizerId: true },
  });

  for (const item of cases) {
    const enabled = await fetch(baseUrl + "/api/events/" + owner.eventId + "/modules/" + item.module, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + owner.token },
      body: JSON.stringify({ enabled: true }),
    });
    assert.equal(enabled.status, 200);

    const financeSignup = await signup("rbac-specialized-finance-" + item.label);
    const finance = await prisma.user.findUniqueOrThrow({
      where: { email: "participants-rbac-specialized-finance-" + item.label + "-" + ts + "@example.com" },
      select: { id: true },
    });
    await prisma.organizerMembership.create({
      data: { organizerId: ownerEvent.organizerId, userId: finance.id, role: "finance", status: "active" },
    });

    const read = await fetch(baseUrl + "/api/events/" + owner.eventId + "/" + item.path, {
      headers: { Authorization: "Bearer " + financeSignup.token },
    });
    assert.equal(read.status, 200);

    const financeMutation = await fetch(baseUrl + "/api/events/" + owner.eventId + "/" + item.path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + financeSignup.token },
      body: JSON.stringify(item.payload),
    });
    assert.equal(financeMutation.status, 404);

    const operationsSignup = await signup("rbac-specialized-operations-" + item.label);
    const operations = await prisma.user.findUniqueOrThrow({
      where: { email: "participants-rbac-specialized-operations-" + item.label + "-" + ts + "@example.com" },
      select: { id: true },
    });
    await prisma.organizerMembership.create({
      data: { organizerId: ownerEvent.organizerId, userId: operations.id, role: "operations", status: "active" },
    });

    const operationsMutation = await fetch(baseUrl + "/api/events/" + owner.eventId + "/" + item.path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + operationsSignup.token },
      body: JSON.stringify(item.payload),
    });
    assert.equal(operationsMutation.status, 201);
  }
});


test("participant mutations are rate limited to prevent scripted organizer abuse", async () => {
  const { token, eventId } = await bootstrap("rate-limit");
  await enableParticipants(token, eventId);

  const headers = {
    "Content-Type": "application/json",
    Authorization: "Bearer " + token,
  };

  const responses: Response[] = [];
  for (let attempt = 0; attempt < 30; attempt += 1) {
    responses.push(
      await fetch(baseUrl + "/api/events/" + eventId + "/participants", {
        method: "POST",
        headers,
        body: JSON.stringify({
          participantType: "SPEAKER",
          name: "Rate Limit Speaker " + attempt,
        }),
      }),
    );
  }

  assert.equal(responses.every((response) => response.status === 201), true);

  const blocked = await fetch(baseUrl + "/api/events/" + eventId + "/participants", {
    method: "POST",
    headers,
    body: JSON.stringify({
      participantType: "SPEAKER",
      name: "Blocked Rate Limit Speaker",
    }),
  });

  assert.equal(blocked.status, 429);
});
