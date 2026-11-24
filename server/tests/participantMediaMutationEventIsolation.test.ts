import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
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

async function signup(label?: string) {
  const email = label
    ? `participant-media-isolation-${label}-${ts}@example.com`
    : `participant-media-isolation-${ts}@example.com`;
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Test-Rate-Limit-Key": email,
    },
    body: JSON.stringify({
      email,
      password: "TestPassword123!",
      fullName: "Participant Media Isolation",
      userType: "organizer",
    }),
  });
  assert.equal(res.status, 201);
  return (await res.json()).token as string;
}

async function createEvent(token: string, label: string) {
  const res = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: `Participant Media Isolation ${label} ${ts}`,
      status: "PUBLISHED",
      visibility: "public",
      city: "Ahmedabad",
      venue: "Isolation Hall",
      startDate: "2027-11-01",
      endDate: "2027-11-02",
      modules: ["PARTICIPANTS"],
    }),
  });
  assert.equal(res.status, 201);
  return (await res.json()).event.id as string;
}

test("participant media mutations remain event-scoped for the same organizer", async () => {
  const token = await signup();
  const eventA = await createEvent(token, "A");
  const eventB = await createEvent(token, "B");

  const participant = await prisma.eventParticipant.create({
    data: {
      eventId: eventA,
      participantType: "SPEAKER",
      name: "Event A Speaker",
      isPublic: true,
    },
  });

  const media = await prisma.eventParticipantMedia.create({
    data: {
      participantId: participant.id,
      kind: "GALLERY",
      visibility: "PUBLIC",
      fileUrl: "/uploads/participant-media-public/event-a-gallery.jpg",
      mimeType: "image/jpeg",
      fileSizeBytes: 1024,
      caption: "Event A Media",
      altText: "Event A media",
      sortOrder: 0,
      uploadedByUserId: (await prisma.user.findFirstOrThrow({ where: { email: `participant-media-isolation-${ts}@example.com` } })).id,
    },
  });

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const update = await fetch(
    `${baseUrl}/api/events/${eventB}/participants/${participant.id}/media/${media.id}`,
    { method: "PATCH", headers, body: JSON.stringify({ caption: "Cross Event Update" }) },
  );
  assert.equal(update.status, 404, "media update must not cross event boundaries");

  const remove = await fetch(
    `${baseUrl}/api/events/${eventB}/participants/${participant.id}/media/${media.id}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );
  assert.equal(remove.status, 404, "media deletion must not cross event boundaries");

  const reorder = await fetch(
    `${baseUrl}/api/events/${eventB}/participants/${participant.id}/media/reorder`,
    { method: "PATCH", headers, body: JSON.stringify({ items: [{ id: media.id, sortOrder: 10 }] }) },
  );
  assert.equal(reorder.status, 404, "media reorder must not cross event boundaries");

  const unchanged = await prisma.eventParticipantMedia.findUniqueOrThrow({ where: { id: media.id } });
  assert.equal(unchanged.caption, "Event A Media");
  assert.equal(unchanged.archivedAt, null);
  assert.equal(unchanged.sortOrder, 0);
});

test("media file access is rejected when its parent participant is archived", async () => {
  const token = await signup("archived-parent");
  const eventId = await createEvent(token, "archived-parent");
  const user = await prisma.user.findFirstOrThrow({
    where: { email: `participant-media-isolation-archived-parent-${ts}@example.com` },
    select: { id: true },
  });
  const participant = await prisma.eventParticipant.create({
    data: {
      eventId,
      participantType: "SPEAKER",
      name: "Archived Speaker",
      isPublic: true,
    },
  });
  const media = await prisma.eventParticipantMedia.create({
    data: {
      participantId: participant.id,
      kind: "GALLERY",
      visibility: "PRIVATE",
      fileUrl: "private://participant-media-private/archived-parent-file.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: 128,
      caption: "Sensitive archived media",
      sortOrder: 0,
      uploadedByUserId: user.id,
    },
  });
  await prisma.eventParticipant.update({
    where: { id: participant.id },
    data: { status: "ARCHIVED", archivedAt: new Date(), isPublic: false },
  });

  const response = await fetch(
    `${baseUrl}/api/events/${eventId}/participants/${participant.id}/media/${media.id}/file`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  assert.equal(response.status, 409, "archived participant media must not be served through direct file access");

  const unchanged = await prisma.eventParticipantMedia.findUniqueOrThrow({ where: { id: media.id } });
  assert.equal(unchanged.archivedAt, null, "denied access must not mutate the media record");
  assert.equal(unchanged.active, true);
});


test("private participant media download revalidates organizer membership under the organizer lock", async () => {
  const label = "revoked-download";
  const token = await signup(label);
  const eventId = await createEvent(token, label);
  const email = `participant-media-isolation-${label}-${ts}@example.com`;
  const user = await prisma.user.findFirstOrThrow({ where: { email }, select: { id: true } });
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { organizerId: true } });
  const participant = await prisma.eventParticipant.create({
    data: { eventId, participantType: "SPEAKER", name: "Revoked Media Download", isPublic: true },
  });
  const media = await prisma.eventParticipantMedia.create({
    data: {
      participantId: participant.id,
      kind: "GALLERY",
      visibility: "PRIVATE",
      fileUrl: "private://participant-media-private/revoked-download.png",
      mimeType: "image/png",
      fileSizeBytes: 8,
      uploadedByUserId: user.id,
    },
  });
  const membership = await prisma.organizerMembership.findFirstOrThrow({
    where: { organizerId: event.organizerId, userId: user.id, status: "active" },
  });

  const client = prisma as unknown as { $transaction: typeof prisma.$transaction };
  const originalTransaction = client.$transaction;
  let transactionCount = 0;
  try {
    client.$transaction = (async (...args: unknown[]) => {
      transactionCount += 1;
      await prisma.organizerMembership.delete({ where: { id: membership.id } });
      return (originalTransaction as (...inner: unknown[]) => Promise<unknown>).apply(prisma, args);
    }) as typeof client.$transaction;

    const response = await fetch(
      `${baseUrl}/api/events/${eventId}/participants/${participant.id}/media/${media.id}/file`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(response.status, 404, "revoked membership must not read private participant media");
  } finally {
    client.$transaction = originalTransaction;
  }
  assert.equal(transactionCount, 1, "the protected media read must use one locked transaction");
});

test("participant media archive revalidates organizer update permission under the organizer lock", async () => {
  const label = "revoked-archive";
  const token = await signup(label);
  const eventId = await createEvent(token, label);
  const email = `participant-media-isolation-${label}-${ts}@example.com`;
  const user = await prisma.user.findFirstOrThrow({ where: { email }, select: { id: true } });
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { organizerId: true } });
  const participant = await prisma.eventParticipant.create({
    data: { eventId, participantType: "SPEAKER", name: "Revoked Media Archive", isPublic: true },
  });
  const media = await prisma.eventParticipantMedia.create({
    data: {
      participantId: participant.id,
      kind: "GALLERY",
      visibility: "PUBLIC",
      fileUrl: "/uploads/participant-media-public/revoked-archive.png",
      mimeType: "image/png",
      fileSizeBytes: 8,
      uploadedByUserId: user.id,
    },
  });
  const membership = await prisma.organizerMembership.findFirstOrThrow({
    where: { organizerId: event.organizerId, userId: user.id, status: "active" },
  });

  const client = prisma as unknown as { $transaction: typeof prisma.$transaction };
  const originalTransaction = client.$transaction;
  try {
    client.$transaction = (async (...args: unknown[]) => {
      await prisma.organizerMembership.delete({ where: { id: membership.id } });
      return (originalTransaction as (...inner: unknown[]) => Promise<unknown>).apply(prisma, args);
    }) as typeof client.$transaction;

    const response = await fetch(
      `${baseUrl}/api/events/${eventId}/participants/${participant.id}/media/${media.id}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(response.status, 404, "revoked membership must not archive participant media");
  } finally {
    client.$transaction = originalTransaction;
  }

  const unchanged = await prisma.eventParticipantMedia.findUniqueOrThrow({ where: { id: media.id } });
  assert.equal(unchanged.archivedAt, null, "revoked request must not change media archive state");
  assert.equal(unchanged.active, true);
});

test("participant media upload cleans up the stored object when membership is revoked after preflight", async () => {
  const label = "revoked-upload";
  const token = await signup(label);
  const eventId = await createEvent(token, label);
  const email = `participant-media-isolation-${label}-${ts}@example.com`;
  const user = await prisma.user.findFirstOrThrow({ where: { email }, select: { id: true } });
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { organizerId: true } });
  const participant = await prisma.eventParticipant.create({
    data: { eventId, participantType: "SPEAKER", name: "Revoked Media Upload", isPublic: true },
  });
  const membership = await prisma.organizerMembership.findFirstOrThrow({
    where: { organizerId: event.organizerId, userId: user.id, status: "active" },
  });

  const uploadDir = path.join(process.cwd(), "uploads", "participant-media-public");
  await fs.mkdir(uploadDir, { recursive: true });
  const filesBefore = new Set(await fs.readdir(uploadDir));
  const client = prisma as unknown as { $transaction: typeof prisma.$transaction };
  const originalTransaction = client.$transaction;
  let transactionCount = 0;
  try {
    client.$transaction = (async (...args: unknown[]) => {
      transactionCount += 1;
      if (transactionCount === 2) {
        // First transaction is the pre-upload authorization check. Revoke after
        // Multer stores the object but before the final media-row transaction.
        await prisma.organizerMembership.delete({ where: { id: membership.id } });
      }
      return (originalTransaction as (...inner: unknown[]) => Promise<unknown>).apply(prisma, args);
    }) as typeof client.$transaction;

    const form = new FormData();
    form.append("kind", "GALLERY");
    form.append(
      "file",
      new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" }),
      "revoked-media.png",
    );
    const response = await fetch(
      `${baseUrl}/api/events/${eventId}/participants/${participant.id}/media`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form },
    );
    assert.equal(response.status, 404, "membership revoked after upload must deny media persistence");
  } finally {
    client.$transaction = originalTransaction;
  }

  assert.equal(transactionCount, 2, "upload should perform preflight and post-upload locked authorization");
  assert.deepEqual(
    [...(await fs.readdir(uploadDir))].filter((name) => !filesBefore.has(name)),
    [],
    "revoked post-upload request must remove the stored media object",
  );
  assert.equal(
    await prisma.eventParticipantMedia.count({ where: { participantId: participant.id } }),
    0,
    "revoked post-upload request must not create a media row",
  );
});

test("profile-image archive and restore keep the participant photo projection consistent", async () => {
  const label = "profile-projection";
  const token = await signup(label);
  const eventId = await createEvent(token, label);
  const participant = await prisma.eventParticipant.create({
    data: { eventId, participantType: "SPEAKER", name: "Profile Projection Speaker", isPublic: true },
  });
  const firstUrl = "/uploads/participant-media-public/profile-first.png";
  const secondUrl = "/uploads/participant-media-public/profile-second.png";
  const first = await prisma.eventParticipantMedia.create({
    data: {
      participantId: participant.id,
      kind: "PROFILE_IMAGE",
      visibility: "PUBLIC",
      fileUrl: firstUrl,
      mimeType: "image/png",
      fileSizeBytes: 8,
      sortOrder: 0,
    },
  });
  await prisma.eventParticipantMedia.create({
    data: {
      participantId: participant.id,
      kind: "PROFILE_IMAGE",
      visibility: "PUBLIC",
      fileUrl: secondUrl,
      mimeType: "image/png",
      fileSizeBytes: 8,
      sortOrder: 1,
    },
  });
  await prisma.eventParticipant.update({ where: { id: participant.id }, data: { photoUrl: firstUrl } });

  const headers = { Authorization: `Bearer ${token}` };
  const archived = await fetch(
    `${baseUrl}/api/events/${eventId}/participants/${participant.id}/media/${first.id}`,
    { method: "DELETE", headers },
  );
  assert.equal(archived.status, 204);
  const afterArchive = await prisma.eventParticipant.findUniqueOrThrow({
    where: { id: participant.id },
    select: { photoUrl: true },
  });
  assert.equal(afterArchive.photoUrl, secondUrl, "archive must select the next active public profile image");

  const restored = await fetch(
    `${baseUrl}/api/events/${eventId}/participants/${participant.id}/media/${first.id}/restore`,
    { method: "POST", headers },
  );
  assert.equal(restored.status, 200);
  const afterRestore = await prisma.eventParticipant.findUniqueOrThrow({
    where: { id: participant.id },
    select: { photoUrl: true },
  });
  assert.equal(afterRestore.photoUrl, firstUrl, "restore must project the restored profile image");
  const second = await prisma.eventParticipantMedia.findFirstOrThrow({
    where: { participantId: participant.id, fileUrl: secondUrl },
    select: { archivedAt: true, active: true },
  });
  assert.ok(second.archivedAt, "restoring a profile image must archive the previous active image");
  assert.equal(second.active, false);
});
