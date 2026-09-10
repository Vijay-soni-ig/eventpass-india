import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";

const TEST_PASSWORD = "TestPassword123!";

export async function login(baseUrl: string, email: string, password = "DevPassword123!") {
  const r = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }).then((res) => res.json());
  assert.ok(r.token, `login must succeed for ${email}: ${JSON.stringify(r)}`);
  return r.token as string;
}

export async function bootstrapOrganizer(baseUrl: string, label: string, ts: number) {
  const email = `phase20c-${label}-${ts}@example.com`;
  const signup = await fetch(`${baseUrl}/api/auth/signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: TEST_PASSWORD, fullName: `Phase20C ${label}`, userType: "exhibitor" }) }).then((r) => r.json());
  const created = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${signup.token}` },
    body: JSON.stringify({ name: `Phase20C ${label} Exhibition 1`, status: "live", visibility: "public", venue: "Test Venue", city: "Test City", startDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), endDate: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10), ticketTypes: [{ name: "General", price: 0, quantity: 100, visible: true }], stalls: [] }),
  }).then((r) => r.json());
  assert.ok(created.exhibition?.organizerId, `organizer bootstrap must succeed: ${JSON.stringify(created)}`);
  return { userId: signup.user.id as string, email, token: signup.token as string, organizerId: created.exhibition.organizerId as string, firstExhibitionId: created.exhibition.id as string };
}

export async function setSubscription(organizerId: string, planCode: "starter" | "growth" | "enterprise", status: "trialing" | "active" | "cancelled" | "expired") {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: `plan-${planCode}` } });
  await prisma.subscription.updateMany({ where: { organizerId }, data: { planId: plan.id, status } });
}

export async function createExhibition(baseUrl: string, token: string, name: string, extra: Record<string, unknown> = {}) {
  const res = await fetch(`${baseUrl}/api/exhibitions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ name, status: "live", visibility: "public", venue: "Test Venue", city: "Test City", startDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), endDate: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10), stalls: [], ...extra }) });
  return { status: res.status, body: await res.json() };
}

export async function markExhibitionCompleted(exhibitionId: string) {
  await prisma.exhibition.update({ where: { id: exhibitionId }, data: { status: "completed" } });
}

export async function applyAsExhibitor(baseUrl: string, exhibitionId: string, label: string, ts: number) {
  const email = `phase20c-${label}-${ts}@example.com`;
  const signup = await fetch(`${baseUrl}/api/auth/signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: TEST_PASSWORD, fullName: `Phase20C ${label}`, userType: "exhibitor" }) }).then((r) => r.json());
  const apply = await fetch(`${baseUrl}/api/exhibitor/participations`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${signup.token}` }, body: JSON.stringify({ exhibitionId }) }).then((r) => r.json());
  assert.ok(apply.participation?.id, `application must succeed: ${JSON.stringify(apply)}`);
  return { userId: signup.user.id as string, token: signup.token as string, participationId: apply.participation.id as string };
}

export async function approveParticipation(baseUrl: string, organizerToken: string, exhibitionId: string, participationId: string) {
  const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}/exhibitors/${participationId}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${organizerToken}` }, body: JSON.stringify({ status: "approved" }) });
  return { status: res.status, body: await res.json() };
}

export async function createStall(baseUrl: string, organizerToken: string, exhibitionId: string, price = 4000) {
  const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}/stalls`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${organizerToken}` }, body: JSON.stringify({ price }) });
  return { status: res.status, body: await res.json() };
}

export async function inviteTeamMember(baseUrl: string, organizerToken: string, organizerId: string, email: string) {
  const res = await fetch(`${baseUrl}/api/organizer-members/${organizerId}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${organizerToken}` }, body: JSON.stringify({ invitedEmail: email, role: "scanner" }) });
  return { status: res.status, body: await res.json() };
}

export async function bookFreeTicket(baseUrl: string, exhibitionId: string, ticketTypeId: string, label: string, ts: number) {
  const email = `phase20c-visitor-${label}-${ts}@example.com`;
  const signup = await fetch(`${baseUrl}/api/auth/signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: TEST_PASSWORD, fullName: `Phase20C Visitor ${label}`, userType: "visitor" }) }).then((r) => r.json());
  const res = await fetch(`${baseUrl}/api/bookings/tickets`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${signup.token}` }, body: JSON.stringify({ exhibitionId, ticketTypeId, attendeeName: `Phase20C Visitor ${label}`, attendeeEmail: email, quantity: 1 }) });
  return { userId: signup.user.id as string, status: res.status, body: await res.json() };
}

export async function cleanupOrphanFreePayments() {
  const orphans = await prisma.payment.findMany({ where: { provider: "free", ticketBooking: { is: null }, stallBooking: { is: null }, createdAt: { lt: new Date(Date.now() - 30_000) } }, select: { id: true } });
  if (orphans.length === 0) return;
  await prisma.payment.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
}

export async function cleanupOrganizers(organizerIds: string[]) {
  if (organizerIds.length === 0) return;
  const exhibitions = await prisma.exhibition.findMany({ where: { organizerId: { in: organizerIds } }, select: { id: true } });
  const exhibitionIds = exhibitions.map((e) => e.id);
  const ticketBookings = await prisma.ticketBooking.findMany({ where: { exhibitionId: { in: exhibitionIds } }, select: { id: true, paymentId: true, buyerUserId: true } });
  const stallBookings = await prisma.stallBooking.findMany({ where: { exhibitionId: { in: exhibitionIds } }, select: { id: true, paymentId: true, buyerUserId: true } });
  const paymentIds = [...ticketBookings, ...stallBookings].map((b) => b.paymentId).filter((id): id is string => !!id);
  const visitorUserIds = ticketBookings.map((b) => b.buyerUserId).filter((id): id is string => !!id);
  const participations = await prisma.exhibitionExhibitor.findMany({ where: { exhibitionId: { in: exhibitionIds } }, select: { id: true, exhibitorBusinessId: true } });
  const businessIds = participations.map((p) => p.exhibitorBusinessId);
  const businessOwners = await prisma.exhibitorBusiness.findMany({ where: { id: { in: businessIds } }, select: { ownerId: true } });
  const exhibitorOwnerIds = businessOwners.map((b) => b.ownerId);
  const memberships = await prisma.organizerMembership.findMany({ where: { organizerId: { in: organizerIds } }, select: { userId: true } });
  const memberUserIds = memberships.map((m) => m.userId).filter((id): id is string => !!id);
  await prisma.refund.deleteMany({ where: { paymentId: { in: paymentIds } } });
  await prisma.ticketBooking.deleteMany({ where: { id: { in: ticketBookings.map((b) => b.id) } } });
  await prisma.stallBooking.deleteMany({ where: { id: { in: stallBookings.map((b) => b.id) } } });
  await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
  await prisma.stall.deleteMany({ where: { exhibitionId: { in: exhibitionIds } } });
  await prisma.exhibitionExhibitor.deleteMany({ where: { id: { in: participations.map((p) => p.id) } } });
  await prisma.exhibitorMembership.deleteMany({ where: { exhibitorBusinessId: { in: businessIds } } });
  await prisma.exhibitorBusiness.deleteMany({ where: { id: { in: businessIds } } });
  await prisma.ticketType.deleteMany({ where: { exhibitionId: { in: exhibitionIds } } });
  await prisma.subscription.deleteMany({ where: { organizerId: { in: organizerIds } } });
  await prisma.exhibition.deleteMany({ where: { id: { in: exhibitionIds } } });
  await prisma.organizerMembership.deleteMany({ where: { organizerId: { in: organizerIds } } });
  await prisma.organizer.deleteMany({ where: { id: { in: organizerIds } } });
  await prisma.auditLog.deleteMany({ where: { entityType: "Organizer", entityId: { in: organizerIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [...new Set([...visitorUserIds, ...exhibitorOwnerIds, ...memberUserIds])] } } });
}
