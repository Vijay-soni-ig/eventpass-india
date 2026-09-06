import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, applyAsExhibitor, approveParticipation, cleanupOrganizers } from "./helpers/entitlementFixtures";
import { signupUser, createTicketType, lookupTicketAsExhibitor, checkInAsExhibitor, cleanupOrphanPayments } from "./helpers/phase21bFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const extraUserIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await cleanupOrphanPayments();
  await prisma.user.deleteMany({ where: { id: { in: extraUserIds } } });
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

async function inviteExhibitorMember(baseUrl: string, ownerToken: string, businessId: string, invitedEmail: string, role: "admin" | "staff") {
  const res = await fetch(`${baseUrl}/api/exhibitor-members/${businessId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ invitedEmail, role }),
  });
  return { status: res.status, body: await res.json() };
}

// -------- P1 — Exhibitor Team (ExhibitorMembership) isolation --------

test("the legacy /api/team-members route no longer exists (removed dead system)", async () => {
  const { token } = await signupUser(baseUrl, `phase21d-legacy-check-${ts}@example.com`, "Legacy Check", "exhibitor");
  extraUserIds.push((await prisma.user.findUniqueOrThrow({ where: { email: `phase21d-legacy-check-${ts}@example.com` } })).id);
  const res = await fetch(`${baseUrl}/api/team-members`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 404, "the dead legacy route must be fully gone, not just unused");
});

test("exhibitor business A cannot see or manage business B's team members", async () => {
  const org = await bootstrapOrganizer(baseUrl, "team-isolation-org", ts);
  organizerIds.push(org.organizerId);
  const a = await applyAsExhibitor(baseUrl, org.firstExhibitionId, "team-isolation-a", ts);
  const b = await applyAsExhibitor(baseUrl, org.firstExhibitionId, "team-isolation-b", ts);

  const businessA = await prisma.exhibitorBusiness.findFirstOrThrow({ where: { ownerId: a.userId } });
  const businessB = await prisma.exhibitorBusiness.findFirstOrThrow({ where: { ownerId: b.userId } });

  // A cannot view B's roster.
  const viewB = await fetch(`${baseUrl}/api/exhibitor-members/${businessB.id}`, { headers: { Authorization: `Bearer ${a.token}` } });
  assert.equal(viewB.status, 404, JSON.stringify(await viewB.json()));

  // A cannot invite into B's business — same 403 whether B's business exists
  // or not (canManageMembers(null) is false either way), so this doesn't
  // leak whether the businessId is real.
  const inviteIntoB = await inviteExhibitorMember(baseUrl, a.token, businessB.id, `phase21d-cross-${ts}@example.com`, "staff");
  assert.equal(inviteIntoB.status, 403, JSON.stringify(inviteIntoB.body));

  // A's own roster is correctly scoped and doesn't include B's owner.
  const viewA = await fetch(`${baseUrl}/api/exhibitor-members/${businessA.id}`, { headers: { Authorization: `Bearer ${a.token}` } });
  const bodyA = await viewA.json();
  assert.equal(viewA.status, 200);
  assert.ok(!bodyA.members.some((m: { userId: string | null }) => m.userId === b.userId));
});

test("exhibitor staff cannot invite, change roles, or remove members (owner/admin only)", async () => {
  const org = await bootstrapOrganizer(baseUrl, "team-staff-block", ts);
  organizerIds.push(org.organizerId);
  const owner = await applyAsExhibitor(baseUrl, org.firstExhibitionId, "team-staff-owner", ts);
  const businessId = (await prisma.exhibitorBusiness.findFirstOrThrow({ where: { ownerId: owner.userId } })).id;

  const staffEmail = `phase21d-staff-${ts}@example.com`;
  const staffSignup = await signupUser(baseUrl, staffEmail, "Staff Member", "exhibitor");
  extraUserIds.push(staffSignup.userId);
  const invite = await inviteExhibitorMember(baseUrl, owner.token, businessId, staffEmail, "staff");
  assert.equal(invite.status, 201, JSON.stringify(invite.body));
  assert.equal(invite.body.member.status, "active", "inviting an existing user's email must activate them immediately");

  // Staff CAN view the roster (exhibitorMember:view).
  const staffView = await fetch(`${baseUrl}/api/exhibitor-members/${businessId}`, { headers: { Authorization: `Bearer ${staffSignup.token}` } });
  assert.equal(staffView.status, 200);

  // Staff CANNOT invite a new member.
  const staffInvite = await inviteExhibitorMember(baseUrl, staffSignup.token, businessId, `phase21d-staff-invitee-${ts}@example.com`, "staff");
  assert.equal(staffInvite.status, 403, JSON.stringify(staffInvite.body));

  // Staff CANNOT change another member's role.
  const roleChange = await fetch(`${baseUrl}/api/exhibitor-members/member/${invite.body.member.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${staffSignup.token}` },
    body: JSON.stringify({ role: "admin" }),
  });
  assert.equal(roleChange.status, 403, JSON.stringify(await roleChange.json()));

  // Staff CANNOT remove a member.
  const removeAttempt = await fetch(`${baseUrl}/api/exhibitor-members/member/${invite.body.member.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${staffSignup.token}` },
  });
  assert.equal(removeAttempt.status, 403);

  // Owner CAN change the staff member's role and remove them.
  const ownerRoleChange = await fetch(`${baseUrl}/api/exhibitor-members/member/${invite.body.member.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ role: "admin" }),
  });
  assert.equal(ownerRoleChange.status, 200, JSON.stringify(await ownerRoleChange.json()));

  const ownerRemove = await fetch(`${baseUrl}/api/exhibitor-members/member/${invite.body.member.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${owner.token}` },
  });
  assert.equal(ownerRemove.status, 204);
});

// -------- P1 — Scanner: staff can scan, only owner/admin can override --------

test("exhibitor staff can scan tickets but cannot authorize a duplicate-check-in override", async () => {
  const org = await bootstrapOrganizer(baseUrl, "scanner-staff", ts);
  organizerIds.push(org.organizerId);
  const owner = await applyAsExhibitor(baseUrl, org.firstExhibitionId, "scanner-staff-owner", ts);
  await approveParticipation(baseUrl, org.token, org.firstExhibitionId, owner.participationId);
  await prisma.exhibitionExhibitor.update({ where: { id: owner.participationId }, data: { status: "confirmed" } });

  const businessId = (await prisma.exhibitorBusiness.findFirstOrThrow({ where: { ownerId: owner.userId } })).id;
  const staffEmail = `phase21d-scanner-staff-${ts}@example.com`;
  const staffSignup = await signupUser(baseUrl, staffEmail, "Scanner Staff", "exhibitor");
  extraUserIds.push(staffSignup.userId);
  const invite = await inviteExhibitorMember(baseUrl, owner.token, businessId, staffEmail, "staff");
  assert.equal(invite.status, 201, JSON.stringify(invite.body));

  const ticketTypeId = await createTicketType(baseUrl, org.token, org.firstExhibitionId, 0);
  const visitor = await signupUser(baseUrl, `phase21d-scanner-visitor-${ts}@example.com`, "Visitor", "visitor");
  extraUserIds.push(visitor.userId);
  const bookRes = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${visitor.token}` },
    body: JSON.stringify({ exhibitionId: org.firstExhibitionId, ticketTypeId, attendeeName: "Visitor", attendeeEmail: `phase21d-scanner-visitor-${ts}@example.com`, quantity: 1 }),
  }).then((r) => r.json());

  // Staff can look up and check in the ticket (scanner:use, granted to staff).
  const lookup = await lookupTicketAsExhibitor(baseUrl, staffSignup.token, bookRes.booking.qrCode);
  assert.equal(lookup.status, 200, JSON.stringify(lookup.body));
  const checkIn = await checkInAsExhibitor(baseUrl, staffSignup.token, bookRes.booking.id);
  assert.equal(checkIn.status, 200, JSON.stringify(checkIn.body));

  // A duplicate check-in without force is rejected for everyone.
  const duplicate = await checkInAsExhibitor(baseUrl, staffSignup.token, bookRes.booking.id);
  assert.equal(duplicate.status, 409);

  // Staff CANNOT force an override (checkin:override is owner/admin only).
  const staffOverride = await checkInAsExhibitor(baseUrl, staffSignup.token, bookRes.booking.id, true);
  assert.equal(staffOverride.status, 403, JSON.stringify(staffOverride.body));

  // Owner CAN force the override.
  const ownerOverride = await checkInAsExhibitor(baseUrl, owner.token, bookRes.booking.id, true);
  assert.equal(ownerOverride.status, 200, JSON.stringify(ownerOverride.body));
  assert.equal(ownerOverride.body.wasOverride, true);
});
