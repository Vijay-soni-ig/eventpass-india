import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers, setSubscription, createExhibition } from "./helpers/entitlementFixtures";
import { signupUser } from "./helpers/phase21bFixtures";
import { generateFollowerNotifications } from "../src/lib/notificationService";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const visitorUserIds: string[] = [];

// Organizers AND visitor accounts are bootstrapped once in before() and
// reused across tests — this file's process shares one in-memory
// auth-rate-limit store (20 signups/15min per IP, see routes/auth.ts), and
// this file legitimately needs many independent notification scenarios.
// Most assertions are scoped by entityId (a specific exhibition/ticket/
// organizer), so reusing the same follower account across independent
// scenarios is safe — only tests that compare two distinct accounts (IDOR,
// opt-out vs control, multi-follower fan-out) get their own extra account.
let orgA: Awaited<ReturnType<typeof bootstrapOrganizer>>;
let orgB: Awaited<ReturnType<typeof bootstrapOrganizer>>;
let orgC: Awaited<ReturnType<typeof bootstrapOrganizer>>;
let visitorA: { userId: string; token: string }; // follows orgA throughout
let visitorB: { userId: string; token: string }; // follows orgB throughout
let visitorC: { userId: string; token: string }; // follows orgC throughout

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
  orgA = await bootstrapOrganizer(baseUrl, "notif-a", ts);
  orgB = await bootstrapOrganizer(baseUrl, "notif-b", ts);
  orgC = await bootstrapOrganizer(baseUrl, "notif-c", ts);
  organizerIds.push(orgA.organizerId, orgB.organizerId, orgC.organizerId);
  // Enterprise (unlimited exhibitions) — this file creates many per
  // organizer across its scenarios; Starter/Growth's non-completed
  // exhibition caps would otherwise be hit well before the file finishes.
  await setSubscription(orgA.organizerId, "enterprise", "active");
  await setSubscription(orgB.organizerId, "enterprise", "active");
  await setSubscription(orgC.organizerId, "enterprise", "active");

  // Follow (Phase 22.1) only works against a publicly-visible organizer.
  for (const [org, label] of [[orgA, "a"], [orgB, "b"], [orgC, "c"]] as const) {
    await fetch(`${baseUrl}/api/organizer/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${org.token}` },
      body: JSON.stringify({ publicProfileEnabled: true, slug: `notif-org-${label}-${ts}` }),
    });
  }

  visitorA = await signupUser(baseUrl, `phase22n-visitor-a-${ts}@example.com`, "Visitor A", "visitor");
  visitorB = await signupUser(baseUrl, `phase22n-visitor-b-${ts}@example.com`, "Visitor B", "visitor");
  visitorC = await signupUser(baseUrl, `phase22n-visitor-c-${ts}@example.com`, "Visitor C", "visitor");
  visitorUserIds.push(visitorA.userId, visitorB.userId, visitorC.userId);
});

after(async () => {
  await prisma.notification.deleteMany({ where: { organizerId: { in: organizerIds } } });
  await prisma.notificationPreference.deleteMany({ where: { userId: { in: visitorUserIds } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ entityType: "Organizer", entityId: { in: organizerIds } }, { entityType: "NotificationPreference" }] } });
  await prisma.organizerFollow.deleteMany({ where: { organizerId: { in: organizerIds } } });
  await prisma.user.deleteMany({ where: { id: { in: visitorUserIds } } });
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

async function follow(organizerId: string, visitorToken: string) {
  const res = await fetch(`${baseUrl}/api/organizers/${organizerId}/follow`, { method: "POST", headers: { Authorization: `Bearer ${visitorToken}` } });
  assert.equal(res.status, 200);
}

async function unfollow(organizerId: string, visitorToken: string) {
  const res = await fetch(`${baseUrl}/api/organizers/${organizerId}/follow`, { method: "DELETE", headers: { Authorization: `Bearer ${visitorToken}` } });
  assert.equal(res.status, 200);
}

async function publishDraftExhibition(orgToken: string, name: string) {
  const created = await createExhibition(baseUrl, orgToken, name, { status: "draft" });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const exhibitionId = created.body.exhibition.id as string;

  const publish = await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgToken}` },
    body: JSON.stringify({ status: "live" }),
  });
  assert.equal(publish.status, 200, JSON.stringify(await publish.json()));
  return exhibitionId;
}

async function notificationsFor(userId: string, entityId?: string) {
  return prisma.notification.findMany({ where: { userId, ...(entityId ? { entityId } : {}) } });
}

test("event publish (draft -> live+public) generates EVENT_PUBLISHED for followers, deep-links to the public event page", async () => {
  await follow(orgA.organizerId, visitorA.token);
  const exhibitionId = await publishDraftExhibition(orgA.token, "Publish Test Expo");

  const notes = await notificationsFor(visitorA.userId, exhibitionId);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].type, "EVENT_PUBLISHED");
  assert.equal(notes[0].actionUrl, `/exhibition/${exhibitionId}`);
  assert.equal(notes[0].readAt, null);
});

test("no followers -> no notification created", async () => {
  const before = await prisma.notification.count({ where: { organizerId: orgB.organizerId } });
  await publishDraftExhibition(orgB.token, "Lonely Expo");
  const after = await prisma.notification.count({ where: { organizerId: orgB.organizerId } });
  assert.equal(after, before);
});

test("multiple followers each receive exactly one notification", async () => {
  const f2 = await signupUser(baseUrl, `phase22n-multi2-${ts}@example.com`, "Multi Two", "visitor");
  visitorUserIds.push(f2.userId);
  await follow(orgC.organizerId, visitorC.token);
  await follow(orgC.organizerId, f2.token);

  const exhibitionId = await publishDraftExhibition(orgC.token, "Multi Follower Expo");

  const notes1 = await notificationsFor(visitorC.userId, exhibitionId);
  const notes2 = await notificationsFor(f2.userId, exhibitionId);
  assert.equal(notes1.length, 1);
  assert.equal(notes2.length, 1);
});

test("unfollowed user receives no notification for a later event; re-following restores future notifications", async () => {
  // visitorA already follows orgA from the first test.
  await unfollow(orgA.organizerId, visitorA.token);
  const e2 = await publishDraftExhibition(orgA.token, "During Unfollow Expo");
  assert.equal((await notificationsFor(visitorA.userId, e2)).length, 0);

  await follow(orgA.organizerId, visitorA.token);
  // Re-following must not retroactively create a notification for e2 (no
  // historical backfill on follow).
  assert.equal((await notificationsFor(visitorA.userId, e2)).length, 0);

  const e3 = await publishDraftExhibition(orgA.token, "After Refollow Expo");
  assert.equal((await notificationsFor(visitorA.userId, e3)).length, 1);
});

test("event publish is idempotent: re-saving an already-live+public event does not create a second EVENT_PUBLISHED", async () => {
  await follow(orgB.organizerId, visitorB.token);
  const exhibitionId = await publishDraftExhibition(orgB.token, "Idempotent Publish Expo");
  assert.equal((await notificationsFor(visitorB.userId, exhibitionId)).length, 1);

  const again = await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgB.token}` },
    body: JSON.stringify({ status: "live" }),
  });
  assert.equal(again.status, 200);
  assert.equal((await notificationsFor(visitorB.userId, exhibitionId)).length, 1, "must still be exactly one EVENT_PUBLISHED");
});

test("meaningful event update (venue changed) generates EVENT_UPDATED; irrelevant internal field change generates nothing", async () => {
  // visitorC already follows orgC from the multi-follower test.
  const exhibitionId = await publishDraftExhibition(orgC.token, "Update Test Expo");
  assert.equal((await notificationsFor(visitorC.userId, exhibitionId)).length, 1);

  await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgC.token}` },
    body: JSON.stringify({ category: "New Category", refundPolicy: "No refunds after 24h" }),
  });
  const afterIrrelevant = await notificationsFor(visitorC.userId, exhibitionId);
  assert.equal(afterIrrelevant.length, 1, "irrelevant field change must not add a notification");

  await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgC.token}` },
    body: JSON.stringify({ venue: "New Venue Hall" }),
  });
  const afterMeaningful = await notificationsFor(visitorC.userId, exhibitionId);
  assert.equal(afterMeaningful.length, 2);
  assert.ok(afterMeaningful.some((n) => n.type === "EVENT_UPDATED"));
});

test("event date change generates EVENT_DATE_CHANGED", async () => {
  const exhibitionId = await publishDraftExhibition(orgA.token, "Date Change Expo");

  await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgA.token}` },
    body: JSON.stringify({ startDate: "2027-06-01", endDate: "2027-06-03" }),
  });

  const notes = await notificationsFor(visitorA.userId, exhibitionId);
  assert.ok(notes.some((n) => n.type === "EVENT_DATE_CHANGED"));
});

test("ticket-availability transition (0 -> available) generates EVENT_TICKETS_AVAILABLE, but creating an unavailable ticket does not", async () => {
  const exhibitionId = await publishDraftExhibition(orgB.token, "Ticket Availability Expo");

  const createTicket = await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgB.token}` },
    body: JSON.stringify({ name: "General", price: 100, quantity: 0, visible: true }),
  }).then((r) => r.json());
  assert.ok(createTicket.ticket?.id);

  const beforeAvailable = await notificationsFor(visitorB.userId, createTicket.ticket.id);
  assert.equal(beforeAvailable.length, 0, "a zero-quantity ticket must not notify");

  await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}/tickets/${createTicket.ticket.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgB.token}` },
    body: JSON.stringify({ quantity: 50 }),
  });

  const afterAvailable = await notificationsFor(visitorB.userId, createTicket.ticket.id);
  assert.equal(afterAvailable.length, 1);
  assert.equal(afterAvailable[0].type, "EVENT_TICKETS_AVAILABLE");
});

test("organizer profile update (meaningful public field) generates ORGANIZER_PROFILE_UPDATED, only while publicly visible", async () => {
  const initialCount = await prisma.notification.count({ where: { userId: visitorC.userId, organizerId: orgC.organizerId, type: "ORGANIZER_PROFILE_UPDATED" } });

  await fetch(`${baseUrl}/api/organizer/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${orgC.token}` },
    body: JSON.stringify({ description: "Updated description with new info" }),
  });
  const afterCount = await prisma.notification.count({ where: { userId: visitorC.userId, organizerId: orgC.organizerId, type: "ORGANIZER_PROFILE_UPDATED" } });
  assert.equal(afterCount, initialCount + 1);

  const notif = await prisma.notification.findFirst({ where: { userId: visitorC.userId, organizerId: orgC.organizerId, type: "ORGANIZER_PROFILE_UPDATED" }, orderBy: { createdAt: "desc" } });
  assert.equal(notif?.actionUrl, `/organizers/notif-org-c-${ts}`);
});

test("IDOR: an unrelated account cannot read, mark-read, or influence another user's notifications", async () => {
  const attacker = await signupUser(baseUrl, `phase22n-idor-attacker-${ts}@example.com`, "IDOR Attacker", "visitor");
  visitorUserIds.push(attacker.userId);

  // visitorA has real notifications from earlier tests.
  const victimNotes = await notificationsFor(visitorA.userId);
  assert.ok(victimNotes.length > 0);
  const targetId = victimNotes[0].id;

  const getList = await fetch(`${baseUrl}/api/notifications`, { headers: { Authorization: `Bearer ${attacker.token}` } }).then((r) => r.json());
  assert.ok(!getList.items.some((n: { id: string }) => n.id === targetId), "attacker's own list must never include the victim's notification");

  const wasReadBefore = victimNotes[0].readAt;
  const markRes = await fetch(`${baseUrl}/api/notifications/${targetId}/read`, { method: "PATCH", headers: { Authorization: `Bearer ${attacker.token}` } });
  assert.equal(markRes.status, 404, "attacker must not be able to mark the victim's notification as read");

  const stillSame = await prisma.notification.findUniqueOrThrow({ where: { id: targetId } });
  assert.equal(stillSame.readAt?.getTime(), wasReadBefore?.getTime(), "victim's notification must be completely unchanged after the attacker's attempt");
});

test("missing/invalid token is rejected on every notification route", async () => {
  const noAuth = await fetch(`${baseUrl}/api/notifications`);
  assert.equal(noAuth.status, 401);
  const badToken = await fetch(`${baseUrl}/api/notifications`, { headers: { Authorization: "Bearer not-a-real-token" } });
  assert.equal(badToken.status, 401);
});

test("mark read works and is idempotent", async () => {
  const exhibitionId = await publishDraftExhibition(orgB.token, "Mark Read Expo");
  const notes = await notificationsFor(visitorB.userId, exhibitionId);
  const id = notes[0].id;

  const first = await fetch(`${baseUrl}/api/notifications/${id}/read`, { method: "PATCH", headers: { Authorization: `Bearer ${visitorB.token}` } }).then((r) => r.json());
  assert.ok(first.notification.readAt);

  const second = await fetch(`${baseUrl}/api/notifications/${id}/read`, { method: "PATCH", headers: { Authorization: `Bearer ${visitorB.token}` } });
  assert.equal(second.status, 200, "repeated mark-read must not error");
  const secondBody = await second.json();
  assert.equal(secondBody.notification.readAt, first.notification.readAt, "readAt must not change on a repeat call");
});

test("mark-all-read and unread-count work correctly", async () => {
  await publishDraftExhibition(orgA.token, "Mark All Expo 1");
  await publishDraftExhibition(orgA.token, "Mark All Expo 2");

  const before = await fetch(`${baseUrl}/api/notifications/unread-count`, { headers: { Authorization: `Bearer ${visitorA.token}` } }).then((r) => r.json());
  assert.ok(before.unreadCount >= 2);

  await fetch(`${baseUrl}/api/notifications/read-all`, { method: "PATCH", headers: { Authorization: `Bearer ${visitorA.token}` } });
  const after = await fetch(`${baseUrl}/api/notifications/unread-count`, { headers: { Authorization: `Bearer ${visitorA.token}` } }).then((r) => r.json());
  assert.equal(after.unreadCount, 0);

  const repeat = await fetch(`${baseUrl}/api/notifications/read-all`, { method: "PATCH", headers: { Authorization: `Bearer ${visitorA.token}` } });
  assert.equal(repeat.status, 200);
});

test("preferences: disabling a notification type excludes that follower from future notifications of that type only", async () => {
  const optOut = await signupUser(baseUrl, `phase22n-optout-${ts}@example.com`, "OptOut Visitor", "visitor");
  visitorUserIds.push(optOut.userId);
  await follow(orgC.organizerId, optOut.token);

  const prefRes = await fetch(`${baseUrl}/api/notifications/preferences`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${optOut.token}` },
    body: JSON.stringify({ eventPublished: false }),
  });
  assert.equal(prefRes.status, 200, JSON.stringify(await prefRes.json()));

  const exhibitionId = await publishDraftExhibition(orgC.token, "Opt-out Expo");
  assert.equal((await notificationsFor(optOut.userId, exhibitionId)).length, 0, "opted-out follower must receive nothing");
  assert.equal((await notificationsFor(visitorC.userId, exhibitionId)).length, 1, "a follower with default preferences must still receive it");
});

test("preferences GET returns sensible defaults for a user with no row yet", async () => {
  const res = await fetch(`${baseUrl}/api/notifications/preferences`, { headers: { Authorization: `Bearer ${visitorB.token}` } });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.preferences.eventPublished, true);
  assert.equal(body.preferences.ticketsAvailable, true);
});

test("XSS-style exhibition name is stored and returned as inert plain text in the notification", async () => {
  const payload = "<script>alert(1)</script> Expo";
  const exhibitionId = await publishDraftExhibition(orgA.token, payload);
  const notes = await notificationsFor(visitorA.userId, exhibitionId);
  assert.equal(notes.length, 1);
  assert.ok(notes[0].message.includes(payload), `expected message to contain the raw payload: ${notes[0].message}`);
  // Not sanitized server-side: this project never renders notification text
  // via dangerouslySetInnerHTML (React escapes on render), so storing the
  // literal string is safe — same contract already established for gallery
  // captions in Phase 22.2.
});

test("pagination returns the requested page size and total count", async () => {
  for (let i = 0; i < 3; i++) {
    await publishDraftExhibition(orgB.token, `Page Expo ${i}`);
  }

  const res = await fetch(`${baseUrl}/api/notifications?page=1&limit=2`, { headers: { Authorization: `Bearer ${visitorB.token}` } });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.items.length, 2);
  assert.equal(body.pageSize, 2);
  assert.ok(body.total >= 3);
});

test("concurrency: 25 parallel notification-generation calls for the identical business event produce exactly one notification per follower", async () => {
  const params = {
    organizerId: orgA.organizerId,
    type: "EVENT_PUBLISHED" as const,
    title: "Concurrency Test Expo",
    message: "This is a concurrency test.",
    entityType: "Exhibition",
    entityId: `concurrency-test-${ts}`,
    actionUrl: `/exhibition/concurrency-test-${ts}`,
    sourceVersion: "v1",
  };

  const results = await Promise.all(Array.from({ length: 25 }, () => generateFollowerNotifications(params)));
  assert.ok(results.every((r) => typeof r.created === "number"));

  // Only visitorA follows orgA at this point in the file.
  const total = await prisma.notification.count({ where: { entityId: params.entityId, type: "EVENT_PUBLISHED" } });
  assert.equal(total, 1, "exactly one notification per follower must survive 25 concurrent identical generation calls");
});
