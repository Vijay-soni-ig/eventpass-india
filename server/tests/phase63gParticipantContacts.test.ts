import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => { ({ baseUrl, stop } = await startTestServer()); });
after(async () => { await stop(); });

async function signup(label: string) {
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `participant-contact-${label}` },
    body: JSON.stringify({
      email: `participant-contact-${label}-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: `Participant Contact ${label}`,
      userType: "organizer",
    }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  return { token: body.token as string };
}

async function bootstrap(label: string) {
  const { token } = await signup(label);
  const eventRes = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: `Contact Event ${label} ${ts}`,
      status: "PUBLISHED",
      visibility: "public",
      city: "Ahmedabad",
      venue: "Contact Hall",
      startDate: "2027-08-01",
      endDate: "2027-08-02",
      modules: ["PARTICIPANTS"],
    }),
  });
  assert.equal(eventRes.status, 201);
  const eventBody = await eventRes.json();
  const participant = await prisma.eventParticipant.create({
    data: { eventId: eventBody.event.id, participantType: "SPEAKER", name: `Speaker ${label}`, isPublic: true },
  });
  return { token, eventId: eventBody.event.id as string, participantId: participant.id };
}

test("6.3G participant contacts: CRUD, primary replacement, archive/restore lifecycle", async () => {
  const ctx = await bootstrap("lifecycle");

  const first = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/contacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.token}` },
    body: JSON.stringify({
      name: "Priya Shah",
      designation: "Event Manager",
      contactType: "OPERATIONS",
      email: "priya@example.com",
      phone: "+91 98765 43210",
      isPrimary: true,
    }),
  });
  assert.equal(first.status, 201);
  const firstBody = await first.json();
  assert.equal(firstBody.contact.isPrimary, true);
  assert.equal(firstBody.contact.contactType, "PRIMARY");

  const second = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/contacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.token}` },
    body: JSON.stringify({
      name: "Rahul Patel",
      designation: "Operations",
      contactType: "OPERATIONS",
      email: "rahul@example.com",
      isPrimary: false,
    }),
  });
  assert.equal(second.status, 201);
  const secondBody = await second.json();

  const promote = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/contacts/${secondBody.contact.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.token}` },
    body: JSON.stringify({ isPrimary: true }),
  });
  assert.equal(promote.status, 200);
  assert.equal((await promote.json()).contact.isPrimary, true);

  const list = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/contacts`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  assert.equal(list.status, 200);
  const contacts = (await list.json()).contacts;
  assert.equal(contacts.length, 2);
  assert.equal(contacts.filter((c: { isPrimary: boolean }) => c.isPrimary).length, 1);

  const archive = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/contacts/${secondBody.contact.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  assert.equal(archive.status, 204);

  const afterArchive = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/contacts`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  const remaining = (await afterArchive.json()).contacts;
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, firstBody.contact.id);
  assert.equal(remaining[0].isPrimary, true);

  const restore = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/contacts/${secondBody.contact.id}/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.token}` },
    body: JSON.stringify({ isPrimary: true, contactType: "PRIMARY" }),
  });
  assert.equal(restore.status, 200);
  assert.equal((await restore.json()).contact.isPrimary, true);

  const final = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/contacts`, {
    headers: { Authorization: `Bearer ${ctx.token}` },
  });
  const finalContacts = (await final.json()).contacts;
  assert.equal(finalContacts.length, 2);
  assert.equal(finalContacts.filter((c: { isPrimary: boolean }) => c.isPrimary).length, 1);
});

test("6.3G participant contacts: validation and organizer isolation", async () => {
  const ctx = await bootstrap("validation");
  const bad = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/contacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.token}` },
    body: JSON.stringify({ name: "Bad Contact", email: "not-an-email", phone: "x", isPrimary: false }),
  });
  assert.equal(bad.status, 400);

  const other = await signup("other");
  const cross = await fetch(`${baseUrl}/api/events/${ctx.eventId}/participants/${ctx.participantId}/contacts`, {
    headers: { Authorization: `Bearer ${other.token}` },
  });
  assert.equal(cross.status, 404);
});
