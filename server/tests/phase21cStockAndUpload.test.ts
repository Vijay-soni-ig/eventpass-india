import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";
import { signupUser, cleanupOrphanPayments } from "./helpers/phase21bFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const visitorUserIds: string[] = [];
const exhibitorUserIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await cleanupOrphanPayments();
  const businesses = await prisma.exhibitorBusiness.findMany({ where: { ownerId: { in: exhibitorUserIds } }, select: { id: true } });
  const businessIds = businesses.map((b) => b.id);
  await prisma.document.deleteMany({ where: { exhibitorBusinessId: { in: businessIds } } });
  await prisma.exhibitorMembership.deleteMany({ where: { exhibitorBusinessId: { in: businessIds } } });
  await prisma.exhibitorBusiness.deleteMany({ where: { id: { in: businessIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [...visitorUserIds, ...exhibitorUserIds] } } });
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

async function createLimitedTicketType(baseUrl: string, organizerToken: string, exhibitionId: string, quantity: number) {
  const res = await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${organizerToken}` },
    body: JSON.stringify({ name: "Limited", price: 0, quantity }),
  });
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));
  return body.ticket.id as string;
}

async function bookTicket(baseUrl: string, exhibitionId: string, ticketTypeId: string, label: string, quantity: number) {
  const email = `phase21c-stock-${label}-${ts}@example.com`;
  const { userId, token } = await signupUser(baseUrl, email, `Stock ${label}`, "visitor");
  visitorUserIds.push(userId);
  const res = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ exhibitionId, ticketTypeId, attendeeName: `Stock ${label}`, attendeeEmail: email, quantity }),
  });
  return { status: res.status, body: await res.json() };
}

// -------- P2-3: Sold Out / remaining stall inventory (ticket-type stock enforcement) --------

test("a booking within remaining stock succeeds", async () => {
  const org = await bootstrapOrganizer(baseUrl, "stock-ok", ts);
  organizerIds.push(org.organizerId);
  const ticketTypeId = await createLimitedTicketType(baseUrl, org.token, org.firstExhibitionId, 5);

  const result = await bookTicket(baseUrl, org.firstExhibitionId, ticketTypeId, "ok", 3);
  assert.equal(result.status, 201, JSON.stringify(result.body));
});

test("a booking that would exceed remaining stock is rejected with 409, and no booking is created", async () => {
  const org = await bootstrapOrganizer(baseUrl, "stock-exceed", ts);
  organizerIds.push(org.organizerId);
  const ticketTypeId = await createLimitedTicketType(baseUrl, org.token, org.firstExhibitionId, 2);

  const first = await bookTicket(baseUrl, org.firstExhibitionId, ticketTypeId, "exceed-1", 2);
  assert.equal(first.status, 201, JSON.stringify(first.body));

  const second = await bookTicket(baseUrl, org.firstExhibitionId, ticketTypeId, "exceed-2", 1);
  assert.equal(second.status, 409, JSON.stringify(second.body));
  assert.equal(second.body.remaining, 0);

  const count = await prisma.ticketBooking.count({ where: { ticketTypeId } });
  assert.equal(count, 1, "the rejected booking must not have been created");
});

test("a refunded booking's quantity is released back to remaining stock", async () => {
  const org = await bootstrapOrganizer(baseUrl, "stock-refund-release", ts);
  organizerIds.push(org.organizerId);
  const ticketTypeId = await createLimitedTicketType(baseUrl, org.token, org.firstExhibitionId, 1);

  const first = await bookTicket(baseUrl, org.firstExhibitionId, ticketTypeId, "refund-release-1", 1);
  assert.equal(first.status, 201, JSON.stringify(first.body));

  const blocked = await bookTicket(baseUrl, org.firstExhibitionId, ticketTypeId, "refund-release-2", 1);
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));

  // Simulate the booking's payment being refunded (frees the seat) —
  // directly flipping paymentStatus, mirroring what applyPaymentOutcome
  // would do on a real refund, without touching refund architecture itself.
  await prisma.ticketBooking.update({ where: { id: first.body.booking.id }, data: { paymentStatus: "refunded" } });

  const afterRefund = await bookTicket(baseUrl, org.firstExhibitionId, ticketTypeId, "refund-release-3", 1);
  assert.equal(afterRefund.status, 201, JSON.stringify(afterRefund.body), "a refunded booking must release its seat back to remaining stock");
});

test("concurrent bookings for the last remaining seats never oversell", async () => {
  const org = await bootstrapOrganizer(baseUrl, "stock-concurrent", ts);
  organizerIds.push(org.organizerId);
  const ticketTypeId = await createLimitedTicketType(baseUrl, org.token, org.firstExhibitionId, 1);

  const [a, b] = await Promise.all([
    bookTicket(baseUrl, org.firstExhibitionId, ticketTypeId, "race-1", 1),
    bookTicket(baseUrl, org.firstExhibitionId, ticketTypeId, "race-2", 1),
  ]);

  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [201, 409], "exactly one concurrent request must win the last seat");

  const count = await prisma.ticketBooking.count({ where: { ticketTypeId, paymentStatus: { not: "failed" } } });
  assert.equal(count, 1, "the ticket type must never be oversold");
});

test("the public exhibition detail endpoint reports real remaining stock, not the raw total allotment", async () => {
  const org = await bootstrapOrganizer(baseUrl, "stock-public-detail", ts);
  organizerIds.push(org.organizerId);
  const ticketTypeId = await createLimitedTicketType(baseUrl, org.token, org.firstExhibitionId, 3);
  await bookTicket(baseUrl, org.firstExhibitionId, ticketTypeId, "public-detail", 2);

  const res = await fetch(`${baseUrl}/api/public/exhibitions/${org.firstExhibitionId}`);
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  const ticketType = body.exhibition.ticketTypes.find((t: { id: string }) => t.id === ticketTypeId);
  assert.equal(ticketType.quantity, 3, "total allotment is unchanged");
  assert.equal(ticketType.remaining, 1, "remaining must reflect quantity minus sold, not the raw total");
});

// -------- P2-4: Document upload error handling --------

/** Bootstraps a fresh exhibitor's ExhibitorBusiness via the same first-use PUT /api/business path real signups go through. */
async function bootstrapExhibitorBusiness(baseUrl: string, token: string) {
  const res = await fetch(`${baseUrl}/api/business`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 200, JSON.stringify(await res.json()));
}

test("uploading an unsupported document file type returns 400 with a real reason, not a 500", async () => {
  const { userId, token } = await signupUser(baseUrl, `phase21c-doc-${ts}@example.com`, "Doc Uploader", "exhibitor");
  exhibitorUserIds.push(userId);
  await bootstrapExhibitorBusiness(baseUrl, token);

  const form = new FormData();
  form.append("file", new Blob(["not a real document"], { type: "text/plain" }), "notes.txt");

  const res = await fetch(`${baseUrl}/api/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const body = await res.json();
  assert.equal(res.status, 400, JSON.stringify(body));
  assert.equal(typeof body.error, "string");
  assert.ok(body.error.length > 0 && !/stack|internal server error/i.test(body.error));
});

test("uploading a valid document still succeeds (no regression)", async () => {
  const { userId, token } = await signupUser(baseUrl, `phase21c-doc-ok-${ts}@example.com`, "Doc Uploader OK", "exhibitor");
  exhibitorUserIds.push(userId);
  await bootstrapExhibitorBusiness(baseUrl, token);

  const form = new FormData();
  form.append("file", new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" }), "logo.png");

  const res = await fetch(`${baseUrl}/api/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));
  assert.ok(body.document.id);

  // Cleanup the uploaded file's DB row (the on-disk file is harmless test
  // clutter under server/uploads, same accepted footprint prior phases'
  // document-upload tests already leave).
  await prisma.document.delete({ where: { id: body.document.id } });
});
