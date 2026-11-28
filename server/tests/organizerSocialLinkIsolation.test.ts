import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";
import { signupUser } from "./helpers/phase21bFixtures";

// A1 (#926) — organizer profile social links: tenant isolation and boundary
// validation. The handlers resolve the organizer from the caller's membership
// and scope every lookup by organizerId; nothing exercised that before.

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const visitorUserIds: string[] = [];
let orgA: Awaited<ReturnType<typeof bootstrapOrganizer>>;
let orgB: Awaited<ReturnType<typeof bootstrapOrganizer>>;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
  orgA = await bootstrapOrganizer(baseUrl, "sociallink-a", ts);
  orgB = await bootstrapOrganizer(baseUrl, "sociallink-b", ts);
  organizerIds.push(orgA.organizerId, orgB.organizerId);
});

after(async () => {
  await prisma.auditLog.deleteMany({ where: { entityType: "Organizer", entityId: { in: organizerIds } } });
  await prisma.user.deleteMany({ where: { id: { in: visitorUserIds } } });
  // organizer_social_links rows cascade-delete with their Organizer.
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

function api(path: string, token: string | null, method: string, body?: unknown) {
  return fetch(`${baseUrl}/api/organizer/profile${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function createLink(token: string, url = "https://instagram.com/organizer-a") {
  const res = await api("/social-links", token, "POST", { platform: "instagram", url });
  assert.equal(res.status, 201, await res.clone().text());
  return (await res.json()).socialLink as { id: string; url: string; active: boolean; sortOrder: number };
}

test("organizer B cannot update or delete organizer A's social link; A's row is unchanged", async () => {
  const link = await createLink(orgA.token);

  const patch = await api(`/social-links/${link.id}`, orgB.token, "PATCH", { url: "https://evil.example.com", active: false, sortOrder: 7 });
  assert.equal(patch.status, 404, "B must not be able to update A's link");

  const del = await api(`/social-links/${link.id}`, orgB.token, "DELETE");
  assert.equal(del.status, 404, "B must not be able to delete A's link");

  const stillA = await prisma.organizerSocialLink.findUniqueOrThrow({ where: { id: link.id } });
  assert.equal(stillA.organizerId, orgA.organizerId);
  assert.equal(stillA.url, link.url);
  assert.equal(stillA.active, link.active);
  assert.equal(stillA.sortOrder, link.sortOrder);
});

test("a link created by organizer B is attached to B, never to an organizer id supplied by the client", async () => {
  const res = await api("/social-links", orgB.token, "POST", {
    platform: "linkedin",
    url: "https://linkedin.com/company/b",
    organizerId: orgA.organizerId,
  });
  assert.equal(res.status, 201);
  const { socialLink } = await res.json();
  const row = await prisma.organizerSocialLink.findUniqueOrThrow({ where: { id: socialLink.id } });
  assert.equal(row.organizerId, orgB.organizerId, "organizer must come from membership, not the request body");
});

test("owner can update and delete their own social link", async () => {
  const link = await createLink(orgA.token, "https://instagram.com/before");

  const patch = await api(`/social-links/${link.id}`, orgA.token, "PATCH", { url: "https://instagram.com/after" });
  assert.equal(patch.status, 200);
  assert.equal((await patch.json()).socialLink.url, "https://instagram.com/after");

  const del = await api(`/social-links/${link.id}`, orgA.token, "DELETE");
  assert.equal(del.status, 204);
  assert.equal(await prisma.organizerSocialLink.findUnique({ where: { id: link.id } }), null);
});

test("unauthenticated callers and plain visitors cannot touch social links", async () => {
  const link = await createLink(orgA.token);

  assert.equal((await api("/social-links", null, "POST", { platform: "instagram", url: "https://instagram.com/x" })).status, 401);
  assert.equal((await api(`/social-links/${link.id}`, null, "PATCH", { active: false })).status, 401);
  assert.equal((await api(`/social-links/${link.id}`, null, "DELETE")).status, 401);

  const visitor = await signupUser(baseUrl, `sociallink-visitor-${ts}@example.com`, "Social Link Visitor", "visitor");
  visitorUserIds.push(visitor.userId);
  assert.equal((await api("/social-links", visitor.token, "POST", { platform: "instagram", url: "https://instagram.com/x" })).status, 403);
  assert.equal((await api(`/social-links/${link.id}`, visitor.token, "PATCH", { active: false })).status, 403);
  assert.equal((await api(`/social-links/${link.id}`, visitor.token, "DELETE")).status, 403);

  assert.ok(await prisma.organizerSocialLink.findUnique({ where: { id: link.id } }), "denied attempts must leave the link in place");
});

test("social link URLs must be http(s) and the platform must be on the allow-list", async () => {
  for (const url of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "ftp://example.com/x"]) {
    const res = await api("/social-links", orgA.token, "POST", { platform: "instagram", url });
    assert.equal(res.status, 400, `${url} must be rejected`);
  }
  const badPlatform = await api("/social-links", orgA.token, "POST", { platform: "myspace", url: "https://example.com" });
  assert.equal(badPlatform.status, 400);

  const link = await createLink(orgA.token);
  const badPatch = await api(`/social-links/${link.id}`, orgA.token, "PATCH", { url: "javascript:alert(1)" });
  assert.equal(badPatch.status, 400);
  const row = await prisma.organizerSocialLink.findUniqueOrThrow({ where: { id: link.id } });
  assert.equal(row.url, link.url, "a rejected PATCH must not change the stored URL");
});

test("an organizer cannot exceed the social link limit", async () => {
  const existing = await prisma.organizerSocialLink.count({ where: { organizerId: orgB.organizerId } });
  for (let i = existing; i < 8; i += 1) {
    const res = await api("/social-links", orgB.token, "POST", { platform: "other", url: `https://example.com/${i}` });
    assert.equal(res.status, 201);
  }
  const over = await api("/social-links", orgB.token, "POST", { platform: "other", url: "https://example.com/over" });
  assert.equal(over.status, 400);
  assert.equal(await prisma.organizerSocialLink.count({ where: { organizerId: orgB.organizerId } }), 8);
});
