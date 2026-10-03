import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

const ts = Date.now();
let baseUrl: string;
let stop: () => Promise<void>;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});
after(async () => {
  await stop();
});

const auth = (token: string) => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

async function signup(label: string, userType: "organizer" | "exhibitor" | "visitor") {
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `tix-mgmt-${label}` },
    body: JSON.stringify({ email: `tix-mgmt-${label}-${ts}@example.com`, password: "TestPassword123!", fullName: `Tix ${label}`, userType }),
  });
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));
  return { token: body.token as string, email: `tix-mgmt-${label}-${ts}@example.com` };
}

async function createEvent(token: string, label: string) {
  const res = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({
      eventType: "CONFERENCE",
      title: `Tix Mgmt ${label} ${ts}`,
      city: "Ahmedabad",
      venue: "Convention Centre",
      startDate: "2027-10-01",
      endDate: "2027-10-02",
      status: "DRAFT",
      visibility: "public",
    }),
  });
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));
  return body.event.id as string;
}

async function publish(token: string, eventId: string) {
  const res = await fetch(`${baseUrl}/api/events/${eventId}/publish`, { method: "POST", headers: auth(token) });
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
}

const validTicket = (extra: Record<string, unknown> = {}) => ({ name: "General admission", price: 499, capacity: 100, maxPerOrder: 5, ...extra });

async function post(token: string, eventId: string, body: Record<string, unknown>) {
  return fetch(`${baseUrl}/api/event-tickets`, { method: "POST", headers: auth(token), body: JSON.stringify({ eventId, ...body }) });
}
const patch = (token: string, id: string, body: Record<string, unknown>) => fetch(`${baseUrl}/api/event-tickets/${id}`, { method: "PATCH", headers: auth(token), body: JSON.stringify(body) });
const list = (token: string, eventId: string) => fetch(`${baseUrl}/api/event-tickets?eventId=${eventId}`, { headers: auth(token) });
const publicTickets = async (eventId: string) => (await (await fetch(`${baseUrl}/api/public/events/${eventId}/tickets`)).json()).ticketTypes as Array<{ id: string; name: string; price: string; remaining: number }>;

async function createTicket(token: string, eventId: string, extra: Record<string, unknown> = {}) {
  const res = await post(token, eventId, validTicket(extra));
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));
  return body.ticket as { id: string; name: string; capacity: number; currency: string; status: string; price: string };
}

test("an organizer can create, list and read back a ticket type with live inventory", async () => {
  const { token } = await signup("crud", "organizer");
  const eventId = await createEvent(token, "crud");

  const empty = await (await list(token, eventId)).json();
  assert.deepEqual(empty.tickets, []);

  const ticket = await createTicket(token, eventId, { description: "Entry for one", maxPerAttendee: 4 });
  assert.equal(ticket.currency, "INR");
  assert.equal(ticket.status, "ACTIVE");

  const body = await (await list(token, eventId)).json();
  assert.equal(body.tickets.length, 1);
  assert.equal(body.tickets[0].name, "General admission");
  assert.equal(Number(body.tickets[0].price), 499);
  assert.equal(body.tickets[0].capacity, 100);
  assert.equal(body.tickets[0].sold, 0);
  assert.equal(body.tickets[0].reserved, 0);
  assert.equal(body.tickets[0].remaining, 100);

  const audit = await prisma.auditLog.findFirst({ where: { entityId: ticket.id, action: "eventTicketType.created" } });
  assert.ok(audit, "creation is audited");
});

test("invalid ticket data is rejected by the server and nothing is stored", async () => {
  const { token } = await signup("validate", "organizer");
  const eventId = await createEvent(token, "validate");
  const bad: Array<[string, Record<string, unknown>]> = [
    ["empty name", { name: "   " }],
    ["name too long", { name: "x".repeat(161) }],
    ["negative price", { price: -1 }],
    ["more than 2 decimals", { price: 10.999 }],
    ["price beyond the column (used to be a 500)", { price: 100000000 }],
    ["zero capacity", { capacity: 0 }],
    ["fractional capacity", { capacity: 10.5 }],
    ["max per order above 100", { maxPerOrder: 101 }],
    ["max per order above capacity", { capacity: 5, maxPerOrder: 6 }],
    ["max per attendee above capacity", { capacity: 5, maxPerOrder: 5, maxPerAttendee: 6 }],
    ["sales end before start", { saleStartsAt: "2027-01-02T00:00:00.000Z", saleEndsAt: "2027-01-01T00:00:00.000Z" }],
    ["sales end equal to start", { saleStartsAt: "2027-01-01T00:00:00.000Z", saleEndsAt: "2027-01-01T00:00:00.000Z" }],
    ["invalid date", { saleStartsAt: "tomorrow" }],
    ["unknown status", { status: "DELETED" }],
  ];
  for (const [label, override] of bad) {
    const res = await post(token, eventId, validTicket(override));
    assert.equal(res.status, 400, `${label} should be 400, got ${res.status}`);
  }
  assert.equal((await post(token, eventId, { price: 10 })).status, 400, "missing fields");
  assert.equal((await post(token, "", validTicket())).status, 400, "missing event");
  assert.deepEqual((await (await list(token, eventId)).json()).tickets, [], "nothing was stored");

  // Free tickets and the largest valid price are accepted.
  await createTicket(token, eventId, { name: "Free pass", price: 0 });
  await createTicket(token, eventId, { name: "Patron", price: 99999999.99 });
});

test("ticket names are unique per event, ignoring case, until the older ticket is archived", async () => {
  const { token } = await signup("dupes", "organizer");
  const eventId = await createEvent(token, "dupes");
  const first = await createTicket(token, eventId, { name: "Early Bird" });

  assert.equal((await post(token, eventId, validTicket({ name: "early bird" }))).status, 409);
  const other = await createTicket(token, eventId, { name: "Regular" });
  assert.equal((await patch(token, other.id, { name: "EARLY BIRD" })).status, 409, "renaming into a clash");
  assert.equal((await patch(token, other.id, { name: "regular" })).status, 200, "changing only the case of its own name is fine");

  await fetch(`${baseUrl}/api/event-tickets/${first.id}`, { method: "DELETE", headers: auth(token) });
  assert.equal((await post(token, eventId, validTicket({ name: "Early Bird" }))).status, 201, "an archived name can be reused");

  // A second event may reuse any name.
  const secondEvent = await createEvent(token, "dupes-2");
  assert.equal((await post(token, secondEvent, validTicket({ name: "Regular" }))).status, 201);
});

test("editing a ticket validates the sale window against the stored dates", async () => {
  const { token } = await signup("window", "organizer");
  const eventId = await createEvent(token, "window");
  const ticket = await createTicket(token, eventId, { saleStartsAt: "2027-06-10T00:00:00.000Z", saleEndsAt: "2027-06-20T00:00:00.000Z" });

  // Each of these only sends one date, so the other comes from the stored ticket.
  assert.equal((await patch(token, ticket.id, { saleEndsAt: "2027-06-05T00:00:00.000Z" })).status, 400, "end before the stored start");
  assert.equal((await patch(token, ticket.id, { saleStartsAt: "2027-06-25T00:00:00.000Z" })).status, 400, "start after the stored end");
  assert.equal((await patch(token, ticket.id, { saleEndsAt: "2027-06-30T00:00:00.000Z" })).status, 200);
  assert.equal((await patch(token, ticket.id, { saleStartsAt: null })).status, 200, "removing the start opens sales");

  const stored = await prisma.eventTicketType.findUniqueOrThrow({ where: { id: ticket.id } });
  assert.equal(stored.saleStartsAt, null);
  assert.equal(stored.saleEndsAt?.toISOString(), "2027-06-30T00:00:00.000Z");

  // Quantity limits are checked against the stored capacity too.
  assert.equal((await patch(token, ticket.id, { maxPerOrder: 101 })).status, 400);
  assert.equal((await patch(token, ticket.id, { capacity: 4 })).status, 400, "max per order (5) is now above the capacity");
});

test("capacity can never drop below what is sold or held, and currency is locked once used", async () => {
  const { token } = await signup("capacity", "organizer");
  const eventId = await createEvent(token, "capacity");
  await publish(token, eventId);
  const ticket = await createTicket(token, eventId, { name: "Free entry", price: 0, capacity: 10, maxPerOrder: 5 });

  // A visitor buys two free tickets through the same API the checkout uses.
  const visitor = await signup("capacity-visitor", "visitor");
  const reservation = await fetch(`${baseUrl}/api/event-ticket-reservations`, {
    method: "POST",
    headers: auth(visitor.token),
    body: JSON.stringify({ eventTicketTypeId: ticket.id, attendeeName: "Buyer", attendeeEmail: visitor.email, quantity: 2 }),
  });
  assert.equal(reservation.status, 201);
  const { reservation: held } = await reservation.json();
  const order = await fetch(`${baseUrl}/api/event-ticket-orders`, { method: "POST", headers: auth(visitor.token), body: JSON.stringify({ reservationId: held.id }) });
  assert.equal(order.status, 201, JSON.stringify(await order.clone().json()));

  const row = (await (await list(token, eventId)).json()).tickets[0];
  assert.equal(row.sold, 2);
  assert.equal(row.remaining, 8);

  const tooLow = await patch(token, ticket.id, { capacity: 1, maxPerOrder: 1 });
  assert.equal(tooLow.status, 409);
  assert.match((await tooLow.json()).error, /2 tickets already sold/);
  assert.equal((await patch(token, ticket.id, { capacity: 2, maxPerOrder: 2 })).status, 200, "exactly the sold quantity is allowed");
  assert.equal((await patch(token, ticket.id, { capacity: 50 })).status, 200, "raising capacity is fine");

  const currency = await patch(token, ticket.id, { currency: "USD" });
  assert.equal(currency.status, 409);
  assert.equal((await patch(token, ticket.id, { currency: "INR" })).status, 200, "resending the same currency is not a change");
  assert.equal((await patch(token, ticket.id, { price: 25 })).status, 200, "price may change for new orders");
});

test("the Ticketing module switch blocks the API as well as the screen", async () => {
  const { token } = await signup("module", "organizer");
  const eventId = await createEvent(token, "module");
  const ticket = await createTicket(token, eventId);

  const off = await fetch(`${baseUrl}/api/events/${eventId}/modules/TICKETING`, { method: "PUT", headers: auth(token), body: JSON.stringify({ enabled: false }) });
  assert.equal(off.status, 200, JSON.stringify(await off.clone().json()));

  assert.equal((await list(token, eventId)).status, 409);
  assert.equal((await post(token, eventId, validTicket({ name: "Another" }))).status, 409);
  assert.equal((await patch(token, ticket.id, { name: "Renamed" })).status, 409);
  assert.equal((await fetch(`${baseUrl}/api/event-tickets/${ticket.id}`, { method: "DELETE", headers: auth(token) })).status, 409, "archive is blocked too");
  assert.equal((await prisma.eventTicketType.findUniqueOrThrow({ where: { id: ticket.id } })).status, "ACTIVE", "nothing changed");

  await fetch(`${baseUrl}/api/events/${eventId}/modules/TICKETING`, { method: "PUT", headers: auth(token), body: JSON.stringify({ enabled: true }) });
  assert.equal((await list(token, eventId)).status, 200);
});

test("a cancelled or completed event can no longer have its tickets changed", async () => {
  const { token } = await signup("closed", "organizer");
  const eventId = await createEvent(token, "closed");
  await publish(token, eventId);
  const ticket = await createTicket(token, eventId);

  const cancelled = await fetch(`${baseUrl}/api/events/${eventId}`, { method: "PATCH", headers: auth(token), body: JSON.stringify({ status: "CANCELLED" }) });
  assert.equal(cancelled.status, 200, JSON.stringify(await cancelled.clone().json()));

  const create = await post(token, eventId, validTicket({ name: "Late addition" }));
  assert.equal(create.status, 409);
  assert.match((await create.json()).error, /cancelled or completed/);
  assert.equal((await patch(token, ticket.id, { price: 1 })).status, 409);
  assert.equal((await list(token, eventId)).status, 200, "the list stays readable");
});

test("only the owning organizer with the right role can manage tickets", async () => {
  const owner = await signup("owner", "organizer");
  const stranger = await signup("stranger", "organizer");
  const exhibitor = await signup("exhibitor", "exhibitor");
  const visitor = await signup("visitor", "visitor");
  const eventId = await createEvent(owner.token, "owner");
  const ticket = await createTicket(owner.token, eventId);

  // Another organizer cannot see, create, change or archive: 404, so existence is not leaked.
  assert.equal((await list(stranger.token, eventId)).status, 404);
  assert.equal((await post(stranger.token, eventId, validTicket({ name: "Hijack" }))).status, 404);
  assert.equal((await patch(stranger.token, ticket.id, { price: 1 })).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/event-tickets/${ticket.id}`, { method: "DELETE", headers: auth(stranger.token) })).status, 404);

  // Exhibitors and visitors have no organizer access at all.
  for (const user of [exhibitor, visitor]) {
    assert.equal((await list(user.token, eventId)).status, 403);
    assert.equal((await post(user.token, eventId, validTicket({ name: "Nope" }))).status, 403);
    assert.equal((await patch(user.token, ticket.id, { price: 1 })).status, 403);
    assert.equal((await fetch(`${baseUrl}/api/event-tickets/${ticket.id}`, { method: "DELETE", headers: auth(user.token) })).status, 403);
  }
  assert.equal((await fetch(`${baseUrl}/api/event-tickets?eventId=${eventId}`)).status, 401);

  const unchanged = await prisma.eventTicketType.findUniqueOrThrow({ where: { id: ticket.id } });
  assert.equal(unchanged.name, "General admission");
  assert.equal(Number(unchanged.price), 499);
  assert.equal(unchanged.status, "ACTIVE");
});

test("an event that belongs to an exhibition is not managed through this API", async () => {
  const { token } = await signup("exhibition", "organizer");
  const created = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ name: `Tix Mgmt Exhibition ${ts}`, status: "draft", visibility: "public", ticketTypes: [], stalls: [] }),
  });
  const { exhibition } = await created.json();
  assert.equal(created.status, 201);
  const linked = await prisma.exhibition.findUniqueOrThrow({ where: { id: exhibition.id }, select: { eventId: true } });
  assert.ok(linked.eventId, "the exhibition has a linked event");

  assert.equal((await list(token, linked.eventId!)).status, 404);
  assert.equal((await post(token, linked.eventId!, validTicket())).status, 404);
});

test("archiving is a soft delete, and visitors only see tickets that are on sale", async () => {
  const { token } = await signup("public", "organizer");
  const eventId = await createEvent(token, "public");
  await publish(token, eventId);

  const onSale = await createTicket(token, eventId, { name: "On sale", price: 250, capacity: 40 });
  const hidden = await createTicket(token, eventId, { name: "Hidden", status: "INACTIVE" });
  await createTicket(token, eventId, { name: "Not yet", saleStartsAt: "2099-01-01T00:00:00.000Z" });
  await createTicket(token, eventId, { name: "Ended", saleStartsAt: "2020-01-01T00:00:00.000Z", saleEndsAt: "2020-02-01T00:00:00.000Z" });
  const toArchive = await createTicket(token, eventId, { name: "Archived soon" });

  let visible = await publicTickets(eventId);
  assert.deepEqual(visible.map((t) => t.name).sort(), ["Archived soon", "On sale"]);
  const shown = visible.find((t) => t.name === "On sale")!;
  assert.equal(Number(shown.price), 250);
  assert.equal(shown.remaining, 40);

  const archived = await fetch(`${baseUrl}/api/event-tickets/${toArchive.id}`, { method: "DELETE", headers: auth(token) });
  assert.equal(archived.status, 200);
  assert.equal((await archived.json()).ticket.status, "ARCHIVED");
  assert.ok(await prisma.eventTicketType.findUnique({ where: { id: toArchive.id } }), "the row is kept");
  assert.ok(await prisma.auditLog.findFirst({ where: { entityId: toArchive.id, action: "eventTicketType.archived" } }));
  assert.equal((await fetch(`${baseUrl}/api/event-tickets/${toArchive.id}`, { method: "DELETE", headers: auth(token) })).status, 409, "already archived");
  assert.equal((await patch(token, toArchive.id, { name: "Edited" })).status, 409, "archived tickets are read-only");

  visible = await publicTickets(eventId);
  assert.deepEqual(visible.map((t) => t.name), ["On sale"]);

  // The organizer's own list still shows everything, archived included.
  const mine = (await (await list(token, eventId)).json()).tickets as Array<{ name: string; status: string }>;
  assert.equal(mine.length, 5);
  assert.equal(mine.find((t) => t.name === "Archived soon")?.status, "ARCHIVED");

  // Turning a ticket back on makes it appear again.
  assert.equal((await patch(token, hidden.id, { status: "ACTIVE" })).status, 200);
  assert.ok((await publicTickets(eventId)).some((t) => t.name === "Hidden"));
  assert.ok(onSale.id);
});
