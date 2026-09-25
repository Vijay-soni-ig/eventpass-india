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
  const email = `evt-publish-${label}-${ts}@example.com`;
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `event-publish-${label}` },
    body: JSON.stringify({
      email,
      password: "TestPassword123!",
      fullName: `Event Publish ${label}`,
      userType: "exhibitor",
    }),
  });
  const body = await response.json();
  return { token: body.token as string };
}

async function bootstrapOrganizerOwner(label: string) {
  const { token } = await signup(label);
  const response = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: `Publish transition bootstrap ${label} ${ts}`,
      status: "draft",
      visibility: "public",
      ticketTypes: [],
      stalls: [],
    }),
  });
  const body = await response.json();
  return { token, organizerId: body.exhibition.organizerId as string };
}

test("Event PATCH cannot bypass server-authoritative publish readiness", async () => {
  const { token } = await bootstrapOrganizerOwner("patch-bypass");
  const createResponse = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: `Incomplete Publish Target ${ts}`,
      status: "DRAFT",
      visibility: "private",
    }),
  });
  const created = await createResponse.json();
  assert.equal(createResponse.status, 201);

  const patchResponse = await fetch(`${baseUrl}/api/events/${created.event.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: "PUBLISHED" }),
  });
  assert.equal(patchResponse.status, 409);
  const error = await patchResponse.json();
  assert.match(error.error, /POST \/api\/events\/:id\/publish/);

  const persisted = await prisma.event.findUniqueOrThrow({ where: { id: created.event.id } });
  assert.equal(persisted.status, "DRAFT");
  assert.equal(persisted.visibility, "private");
});
