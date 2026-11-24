import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const userIds: string[] = [];
let standaloneEventId: string | undefined;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  try {
    if (standaloneEventId) await prisma.event.deleteMany({ where: { id: standaloneEventId } });
    await cleanupOrganizers(organizerIds);
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  } finally {
    await stop();
    await prisma.$disconnect();
  }
});

async function signup(label: string) {
  const response = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Test-Rate-Limit-Key": "event-exhibitor-participation-" + label,
    },
    body: JSON.stringify({
      email: "event-exhibitor-participation-" + label + "-" + ts + "@example.com",
      password: "TestPassword123!",
      fullName: "Event Exhibitor " + label,
      userType: "exhibitor",
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  userIds.push(body.user.id);
  return { token: body.token as string, userId: body.user.id as string };
}

test("standalone Event exhibitor applications are tenant-scoped, reviewable, idempotent and withdrawable", async () => {
  const organizer = await bootstrapOrganizer(baseUrl, "event-native-exhibitor", ts);
  organizerIds.push(organizer.organizerId);

  const event = await prisma.event.create({
    data: {
      organizerId: organizer.organizerId,
      ownerId: organizer.userId,
      title: "Event-native exhibitor " + ts,
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
      startDate: new Date("2027-06-01T00:00:00.000Z"),
      endDate: new Date("2027-06-02T00:00:00.000Z"),
      venue: "Test Venue",
      city: "Test City",
    },
    select: { id: true },
  });
  standaloneEventId = event.id;

  const enableModule = await fetch(baseUrl + "/api/events/" + event.id + "/modules/EXHIBITORS", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + organizer.token },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(enableModule.status, 200, await enableModule.text());

  const applicant = await signup("applicant");
  const applicationResponse = await fetch(baseUrl + "/api/event-exhibitor-participations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + applicant.token },
    body: JSON.stringify({ eventId: event.id, applicationNote: "We manufacture premium event accessories." }),
  });
  const applicationBody = await applicationResponse.json();
  assert.equal(applicationResponse.status, 201, JSON.stringify(applicationBody));
  assert.equal(applicationBody.participation.status, "APPLIED");
  const participationId = applicationBody.participation.id as string;

  const duplicate = await fetch(baseUrl + "/api/event-exhibitor-participations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + applicant.token },
    body: JSON.stringify({ eventId: event.id, applicationNote: "Retry" }),
  });
  const duplicateBody = await duplicate.json();
  assert.equal(duplicate.status, 200, JSON.stringify(duplicateBody));
  assert.equal(duplicateBody.duplicate, true);
  assert.equal(duplicateBody.participation.id, participationId);

  const mine = await fetch(baseUrl + "/api/event-exhibitor-participations/mine", {
    headers: { Authorization: "Bearer " + applicant.token },
  });
  const mineBody = await mine.json();
  assert.equal(mine.status, 200, JSON.stringify(mineBody));
  assert.equal(mineBody.participations.length, 1);
  assert.equal(mineBody.participations[0].id, participationId);

  const organizerList = await fetch(baseUrl + "/api/event-exhibitor-participations/events/" + event.id, {
    headers: { Authorization: "Bearer " + organizer.token },
  });
  const organizerListBody = await organizerList.json();
  assert.equal(organizerList.status, 200, JSON.stringify(organizerListBody));
  assert.equal(organizerListBody.participations.length, 1);
  assert.equal(organizerListBody.participations[0].business.id, mineBody.participations[0].exhibitorBusinessId);

  const outsider = await signup("outsider");
  const outsiderList = await fetch(baseUrl + "/api/event-exhibitor-participations/events/" + event.id, {
    headers: { Authorization: "Bearer " + outsider.token },
  });
  assert.equal(outsiderList.status, 404, "a non-member must not enumerate another organizer's applications");

  const review = await fetch(baseUrl + "/api/event-exhibitor-participations/events/" + event.id + "/" + participationId + "/review", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + organizer.token },
    body: JSON.stringify({ status: "CONFIRMED", reviewNote: "Approved for this event." }),
  });
  const reviewBody = await review.json();
  assert.equal(review.status, 200, JSON.stringify(reviewBody));
  assert.equal(reviewBody.participation.status, "CONFIRMED");

  const repeatedReview = await fetch(baseUrl + "/api/event-exhibitor-participations/events/" + event.id + "/" + participationId + "/review", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + organizer.token },
    body: JSON.stringify({ status: "CONFIRMED" }),
  });
  assert.equal(repeatedReview.status, 200);
  assert.equal((await repeatedReview.json()).duplicate, true);

  const withdraw = await fetch(baseUrl + "/api/event-exhibitor-participations/" + participationId + "/withdraw", {
    method: "PATCH",
    headers: { Authorization: "Bearer " + applicant.token },
  });
  const withdrawBody = await withdraw.json();
  assert.equal(withdraw.status, 200, JSON.stringify(withdrawBody));
  assert.equal(withdrawBody.participation.status, "WITHDRAWN");

  const repeatedWithdraw = await fetch(baseUrl + "/api/event-exhibitor-participations/" + participationId + "/withdraw", {
    method: "PATCH",
    headers: { Authorization: "Bearer " + applicant.token },
  });
  assert.equal(repeatedWithdraw.status, 200);
  assert.equal((await repeatedWithdraw.json()).duplicate, true);

  const outsiderWithdraw = await fetch(baseUrl + "/api/event-exhibitor-participations/" + participationId + "/withdraw", {
    method: "PATCH",
    headers: { Authorization: "Bearer " + outsider.token },
  });
  assert.equal(outsiderWithdraw.status, 404, "another business must not withdraw this participation");

  const applicantBusiness = await prisma.exhibitorBusiness.findUniqueOrThrow({
    where: { ownerId: applicant.userId },
    select: { id: true },
  });
  const staff = await signup("staff");
  await prisma.exhibitorMembership.create({
    data: { userId: staff.userId, exhibitorBusinessId: applicantBusiness.id, role: "staff", status: "active" },
  });
  const staffApply = await fetch(baseUrl + "/api/event-exhibitor-participations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + staff.token },
    body: JSON.stringify({ eventId: event.id }),
  });
  assert.equal(staffApply.status, 403, "staff without manage permission must not submit applications");

  const linkedExhibition = await prisma.exhibition.findUniqueOrThrow({
    where: { id: organizer.firstExhibitionId },
    select: { id: true, eventId: true },
  });
  assert.ok(linkedExhibition.eventId);
  const linkedEventApply = await fetch(baseUrl + "/api/event-exhibitor-participations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + outsider.token },
    body: JSON.stringify({ eventId: linkedExhibition.eventId }),
  });
  assert.equal(linkedEventApply.status, 404, "linked Exhibitions must continue using the legacy participation workflow");

  const disableModule = await fetch(baseUrl + "/api/events/" + event.id + "/modules/EXHIBITORS", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + organizer.token },
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(disableModule.status, 200, await disableModule.text());
  const blockedAfterDisable = await fetch(baseUrl + "/api/event-exhibitor-participations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + outsider.token },
    body: JSON.stringify({ eventId: event.id }),
  });
  assert.equal(blockedAfterDisable.status, 404, "disabled EXHIBITORS module must block new applications");
});
