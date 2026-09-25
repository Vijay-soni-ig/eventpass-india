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
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `participant-mutation-isolation-${label}` },
    body: JSON.stringify({ email: `participant-mutation-isolation-${label}-${ts}@example.com`, password: "TestPassword123!", fullName: `Participant Mutation Isolation ${label}`, userType: "organizer" }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  return { token: body.token as string };
}

async function createEvent(token: string, label: string) {
  const res = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ eventType: "CONFERENCE", title: `Participant Mutation Isolation ${label} ${ts}`, status: "PUBLISHED", visibility: "public", city: "Ahmedabad", venue: "Isolation Hall", startDate: "2027-11-01", endDate: "2027-11-02", modules: ["PARTICIPANTS"] }),
  });
  assert.equal(res.status, 201);
  return (await res.json()).event.id as string;
}

test("participant child-resource mutations remain event-scoped for the same organizer", async () => {
  const { token } = await signup("same-organizer");
  const eventA = await createEvent(token, "A");
  const eventB = await createEvent(token, "B");

  const participant = await prisma.eventParticipant.create({ data: { eventId: eventA, participantType: "SPEAKER", name: "Event A Speaker", isPublic: true } });
  const contact = await prisma.eventParticipantContact.create({ data: { eventId: eventA, participantId: participant.id, name: "Event A Contact", email: "event-a-contact@example.com", isPrimary: true, contactType: "PRIMARY" } });

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const createContact = await fetch(`${baseUrl}/api/events/${eventB}/participants/${participant.id}/contacts`, { method: "POST", headers, body: JSON.stringify({ name: "Cross Event Contact", email: "cross-event@example.com", isPrimary: false }) });
  assert.equal(createContact.status, 404, "contact creation must not cross event boundaries");

  const updateContact = await fetch(`${baseUrl}/api/events/${eventB}/participants/${participant.id}/contacts/${contact.id}`, { method: "PATCH", headers, body: JSON.stringify({ name: "Unauthorized Update" }) });
  assert.equal(updateContact.status, 404, "contact update must not cross event boundaries");

  const deleteContact = await fetch(`${baseUrl}/api/events/${eventB}/participants/${participant.id}/contacts/${contact.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(deleteContact.status, 404, "contact deletion must not cross event boundaries");

  const unchanged = await prisma.eventParticipantContact.findUniqueOrThrow({ where: { id: contact.id } });
  assert.equal(unchanged.name, "Event A Contact");
  assert.equal(unchanged.archivedAt, null);
});