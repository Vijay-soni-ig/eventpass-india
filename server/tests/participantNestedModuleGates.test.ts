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

async function bootstrap() {
  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Test-Rate-Limit-Key": `nested-module-gates-${ts}`,
    },
    body: JSON.stringify({
      email: `nested-module-gates-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: "Nested Module Gate Test",
      userType: "organizer",
    }),
  });
  assert.equal(signup.status, 201);
  const signupBody = await signup.json();
  const token = signupBody.token as string;

  const eventResponse = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: `Nested Module Gate Event ${ts}`,
      status: "PUBLISHED",
      visibility: "public",
      city: "Ahmedabad",
      venue: "Module Gate Hall",
      startDate: "2027-10-01",
      endDate: "2027-10-02",
      modules: ["PARTICIPANTS"],
    }),
  });
  assert.equal(eventResponse.status, 201);
  const eventBody = await eventResponse.json();
  const eventId = eventBody.event.id as string;

  const disable = await fetch(`${baseUrl}/api/events/${eventId}/modules/PARTICIPANTS`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(disable.status, 200);

  return { token, eventId };
}

test("disabled PARTICIPANTS module blocks nested participant APIs before child lookup or mutation", async () => {
  const { token, eventId } = await bootstrap();
  const participantId = "participant-id-when-module-disabled";
  const childId = "child-id-when-module-disabled";
  const auth = { Authorization: `Bearer ${token}` };
  const jsonAuth = {
    ...auth,
    "Content-Type": "application/json",
  };

  const before = {
    participants: await prisma.eventParticipant.count({ where: { eventId } }),
    contacts: await prisma.eventParticipantContact.count({ where: { eventId } }),
    documents: await prisma.eventParticipantDocument.count({ where: { participant: { eventId } } }),
    media: await prisma.eventParticipantMedia.count({ where: { participant: { eventId } } }),
  };

  const requests: Array<{ label: string; url: string; init?: RequestInit }> = [
    { label: "contacts list", url: `/api/events/${eventId}/participants/${participantId}/contacts` },
    {
      label: "contact create",
      url: `/api/events/${eventId}/participants/${participantId}/contacts`,
      init: { method: "POST", headers: jsonAuth, body: JSON.stringify({ name: "Blocked Contact" }) },
    },
    {
      label: "contact update",
      url: `/api/events/${eventId}/participants/${participantId}/contacts/${childId}`,
      init: { method: "PATCH", headers: jsonAuth, body: JSON.stringify({ name: "Blocked Update" }) },
    },
    {
      label: "contact archive",
      url: `/api/events/${eventId}/participants/${participantId}/contacts/${childId}`,
      init: { method: "DELETE", headers: auth },
    },
    {
      label: "contact restore",
      url: `/api/events/${eventId}/participants/${participantId}/contacts/${childId}/restore`,
      init: { method: "POST", headers: auth },
    },
    { label: "activity timeline", url: `/api/events/${eventId}/participants/${participantId}/activity` },
    { label: "documents list", url: `/api/events/${eventId}/participants/${participantId}/documents` },
    {
      label: "document upload",
      url: `/api/events/${eventId}/participants/${participantId}/documents`,
      init: { method: "POST", headers: auth, body: new FormData() },
    },
    {
      label: "document download",
      url: `/api/events/${eventId}/participants/${participantId}/documents/${childId}/download`,
    },
    {
      label: "document archive",
      url: `/api/events/${eventId}/participants/${participantId}/documents/${childId}`,
      init: { method: "DELETE", headers: auth },
    },
    {
      label: "document restore",
      url: `/api/events/${eventId}/participants/${participantId}/documents/${childId}/restore`,
      init: { method: "POST", headers: auth },
    },
    { label: "media list", url: `/api/events/${eventId}/participants/${participantId}/media` },
    {
      label: "media upload",
      url: `/api/events/${eventId}/participants/${participantId}/media`,
      init: { method: "POST", headers: auth, body: new FormData() },
    },
    {
      label: "media reorder",
      url: `/api/events/${eventId}/participants/${participantId}/media/reorder`,
      init: { method: "PATCH", headers: jsonAuth, body: JSON.stringify({ ids: [childId] }) },
    },
    {
      label: "media update",
      url: `/api/events/${eventId}/participants/${participantId}/media/${childId}`,
      init: { method: "PATCH", headers: jsonAuth, body: JSON.stringify({ caption: "Blocked update" }) },
    },
    {
      label: "media archive",
      url: `/api/events/${eventId}/participants/${participantId}/media/${childId}`,
      init: { method: "DELETE", headers: auth },
    },
    {
      label: "media restore",
      url: `/api/events/${eventId}/participants/${participantId}/media/${childId}/restore`,
      init: { method: "POST", headers: auth },
    },
    {
      label: "media file download",
      url: `/api/events/${eventId}/participants/${participantId}/media/${childId}/file`,
    },
  ];

  for (const request of requests) {
    const response = await fetch(baseUrl + request.url, {
      ...request.init,
      headers: request.init?.headers ?? auth,
    });
    assert.equal(response.status, 409, `${request.label} should reject when PARTICIPANTS is disabled; body: ${await response.text()}`);
  }

  const afterState = {
    participants: await prisma.eventParticipant.count({ where: { eventId } }),
    contacts: await prisma.eventParticipantContact.count({ where: { eventId } }),
    documents: await prisma.eventParticipantDocument.count({ where: { participant: { eventId } } }),
    media: await prisma.eventParticipantMedia.count({ where: { participant: { eventId } } }),
  };
  assert.deepEqual(afterState, before, "disabled-module requests must not create or mutate participant child records");
});
