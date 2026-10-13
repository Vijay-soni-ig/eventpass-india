import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();

before(async () => { ({ baseUrl, stop } = await startTestServer()); });
after(async () => { await stop(); });

test("contact deletion is rejected while its parent participant is archived", async () => {
  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "archived-contact-delete" },
    body: JSON.stringify({
      email: `archived-contact-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: "Archived Contact Test",
      userType: "organizer",
    }),
  });
  assert.equal(signup.status, 201);
  const { token } = await signup.json() as { token: string };

  const eventResponse = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: `Archived Contact Event ${ts}`,
      status: "PUBLISHED",
      visibility: "public",
      city: "Ahmedabad",
      venue: "Contact Test Hall",
      startDate: "2027-07-01",
      endDate: "2027-07-02",
      modules: ["PARTICIPANTS"],
    }),
  });
  assert.equal(eventResponse.status, 201);
  const eventBody = await eventResponse.json() as { event: { id: string } };

  const participant = await prisma.eventParticipant.create({
    data: {
      eventId: eventBody.event.id,
      participantType: "SPEAKER",
      name: "Archived Contact Speaker",
      isPublic: true,
    },
  });
  const contact = await prisma.eventParticipantContact.create({
    data: {
      eventId: eventBody.event.id,
      participantId: participant.id,
      name: "Primary Contact",
      contactType: "PRIMARY",
      isPrimary: true,
      email: "primary@example.com",
    },
  });
  await prisma.eventParticipant.update({
    where: { id: participant.id },
    data: { archivedAt: new Date() },
  });

  const response = await fetch(
    `${baseUrl}/api/events/${eventBody.event.id}/participants/${participant.id}/contacts/${contact.id}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );
  assert.equal(response.status, 409);

  const unchanged = await prisma.eventParticipantContact.findUniqueOrThrow({ where: { id: contact.id } });
  assert.equal(unchanged.archivedAt, null);
  assert.equal(unchanged.isPrimary, true);

  await prisma.eventParticipant.update({
    where: { id: participant.id },
    data: { archivedAt: null },
  });
});
