import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { MockPaymentProvider } from "../src/lib/payments";

let baseUrl: string;
let stop: () => Promise<void>;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await stop();
  await prisma.$disconnect();
});

async function signup(
  email: string,
  userType: "organizer" | "visitor",
) {
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "TestPassword123!",
      fullName: `P0 Ticket Concurrency ${userType}`,
      userType,
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  return body as { token: string; user: { id: string } };
}

test("same reservation idempotency key concurrently returns one winning reservation", async () => {
  const suffix = Date.now();
  const organizer = await signup(`p0-ticket-idem-org-${suffix}@example.com`, "organizer");
  const visitor = await signup(`p0-ticket-idem-visitor-${suffix}@example.com`, "visitor");
  const membership = await prisma.organizerMembership.findFirstOrThrow({ where: { userId: organizer.user.id, status: "active" } });
  const event = await prisma.event.create({
    data: {
      organizerId: membership.organizerId,
      ownerId: organizer.user.id,
      title: `P0 Ticket Idempotency ${suffix}`,
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
      startDate: new Date("2030-01-01T10:00:00Z"),
      endDate: new Date("2030-01-01T18:00:00Z"),
      moduleEnablements: { create: [{ moduleType: "TICKETING", enabled: true }] },
    },
  });
  const ticket = await prisma.eventTicketType.create({
    data: {
      eventId: event.id,
      name: "Idempotency Ticket",
      price: 0,
      currency: "INR",
      capacity: 2,
      maxPerOrder: 1,
      maxPerAttendee: 2,
      status: "ACTIVE",
    },
  });
  try {
    const reserve = (eventTicketTypeId = ticket.id, quantity = 1) => fetch(`${baseUrl}/api/event-ticket-reservations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${visitor.token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `p0-ticket-idem-${suffix}`,
      },
      body: JSON.stringify({
        eventTicketTypeId,
        attendeeName: "Idempotent Visitor",
        attendeeEmail: `p0-ticket-idem-visitor-${suffix}@example.com`,
        quantity,
      }),
    });
    const [a, b] = await Promise.all([reserve(), reserve()]);
    const bodies = await Promise.all([a.json(), b.json()]);
    assert.deepEqual([a.status, b.status].sort((x, y) => x - y), [200, 201]);
    assert.equal(bodies[0].reservation.id, bodies[1].reservation.id);
    assert.equal(bodies[0].replayed || bodies[1].replayed, true);
    assert.equal(await prisma.eventTicketReservation.count({ where: { eventTicketTypeId: ticket.id } }), 1);

    const changedPayload = await reserve(ticket.id, 2);
    assert.equal(changedPayload.status, 409, "reusing a key with a different quantity must be rejected");
    const differentTicket = await prisma.eventTicketType.create({
      data: {
        eventId: event.id,
        name: "Different Idempotency Ticket",
        price: 0,
        currency: "INR",
        capacity: 2,
        maxPerOrder: 2,
        maxPerAttendee: 2,
        status: "ACTIVE",
      },
    });
    try {
      const changedTicket = await reserve(differentTicket.id, 1);
      assert.equal(changedTicket.status, 409, "reusing a key for another ticket type must be rejected");
      assert.equal(await prisma.eventTicketReservation.count({ where: { eventTicketTypeId: differentTicket.id } }), 0);
    } finally {
      await prisma.eventTicketReservation.deleteMany({ where: { eventTicketTypeId: differentTicket.id } });
      await prisma.eventTicketType.delete({ where: { id: differentTicket.id } });
    }
  } finally {
    await prisma.eventTicketReservation.deleteMany({ where: { eventTicketTypeId: ticket.id } });
    await prisma.eventTicketType.delete({ where: { id: ticket.id } });
    await prisma.eventModuleEnablement.deleteMany({ where: { eventId: event.id } });
    await prisma.event.delete({ where: { id: event.id } });
    await prisma.organizerMembership.deleteMany({ where: { organizerId: membership.organizerId } });
    await prisma.organizer.delete({ where: { id: membership.organizerId } });
    await prisma.user.deleteMany({ where: { id: { in: [organizer.user.id, visitor.user.id] } } });
  }
});

test("ticket reservation concurrency never exceeds ticket capacity", async () => {
  const suffix = Date.now();

  const organizer = await signup(
    `p0-ticket-concurrency-org-${suffix}@example.com`,
    "organizer",
  );
  const visitorA = await signup(
    `p0-ticket-concurrency-a-${suffix}@example.com`,
    "visitor",
  );
  const visitorB = await signup(
    `p0-ticket-concurrency-b-${suffix}@example.com`,
    "visitor",
  );

  const membership = await prisma.organizerMembership.findFirstOrThrow({
    where: { userId: organizer.user.id, status: "active" },
  });

  const event = await prisma.event.create({
    data: {
      organizerId: membership.organizerId,
      ownerId: organizer.user.id,
      title: `P0 Ticket Concurrency ${suffix}`,
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
      startDate: new Date("2030-01-01T10:00:00Z"),
      endDate: new Date("2030-01-01T18:00:00Z"),
      moduleEnablements: {
        create: [{ moduleType: "TICKETING", enabled: true }],
      },
    },
  });

  const ticket = await prisma.eventTicketType.create({
    data: {
      eventId: event.id,
      name: "Concurrency Ticket",
      price: 0,
      currency: "INR",
      capacity: 1,
      maxPerOrder: 1,
      maxPerAttendee: 1,
      status: "ACTIVE",
    },
  });

  try {
    const reserve = (token: string, email: string, key: string) =>
      fetch(`${baseUrl}/api/event-ticket-reservations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body: JSON.stringify({
          eventTicketTypeId: ticket.id,
          attendeeName: "Concurrency Visitor",
          attendeeEmail: email,
          quantity: 1,
        }),
      });

    const results = await Promise.all([
      reserve(
        visitorA.token,
        `p0-ticket-concurrency-a-${suffix}@example.com`,
        `p0-ticket-concurrency-a-${suffix}`,
      ),
      reserve(
        visitorB.token,
        `p0-ticket-concurrency-b-${suffix}@example.com`,
        `p0-ticket-concurrency-b-${suffix}`,
      ),
    ]);

    const statuses = results.map((response) => response.status).sort((a, b) => a - b);
    assert.deepEqual(
      statuses,
      [201, 409],
      "exactly one concurrent reservation must consume the single available ticket",
    );

    const active = await prisma.eventTicketReservation.aggregate({
      where: {
        eventTicketTypeId: ticket.id,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
      },
      _sum: { quantity: true },
    });

    assert.equal(
      active._sum.quantity ?? 0,
      1,
      "persisted active reservation quantity must never exceed capacity",
    );
  } finally {
    await prisma.eventTicketReservation.deleteMany({
      where: { eventTicketTypeId: ticket.id },
    });
    await prisma.eventTicketType.delete({ where: { id: ticket.id } });
    await prisma.eventModuleEnablement.deleteMany({
      where: { eventId: event.id },
    });
    await prisma.event.delete({ where: { id: event.id } });
    await prisma.organizerMembership.deleteMany({
      where: { organizerId: membership.organizerId },
    });
    await prisma.organizer.delete({
      where: { id: membership.organizerId },
    });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            organizer.user.id,
            visitorA.user.id,
            visitorB.user.id,
          ],
        },
      },
    });
  }
});


test("concurrent captured-payment webhooks issue exactly the purchased ticket quantity", async () => {
  const suffix = Date.now();
  const organizer = await signup(`p0-concurrent-settlement-org-${suffix}@example.com`, "organizer");
  const visitor = await signup(`p0-concurrent-settlement-visitor-${suffix}@example.com`, "visitor");
  const membership = await prisma.organizerMembership.findFirstOrThrow({
    where: { userId: organizer.user.id, status: "active" },
  });
  const event = await prisma.event.create({
    data: {
      organizerId: membership.organizerId,
      ownerId: organizer.user.id,
      title: `Concurrent Settlement ${suffix}`,
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
      startDate: new Date("2030-01-01T10:00:00Z"),
      endDate: new Date("2030-01-01T18:00:00Z"),
      moduleEnablements: { create: [{ moduleType: "TICKETING", enabled: true }] },
    },
  });
  const ticketType = await prisma.eventTicketType.create({
    data: {
      eventId: event.id,
      name: "Concurrent Settlement Ticket",
      price: 500,
      currency: "INR",
      capacity: 2,
      maxPerOrder: 2,
      maxPerAttendee: 2,
      status: "ACTIVE",
    },
  });

  let reservationId: string | null = null;
  let paymentId: string | null = null;
  try {
    const reservationResponse = await fetch(`${baseUrl}/api/event-ticket-reservations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${visitor.token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `p0-concurrent-settlement-reservation-${suffix}`,
      },
      body: JSON.stringify({
        eventTicketTypeId: ticketType.id,
        attendeeName: "Concurrent Settlement Visitor",
        attendeeEmail: `p0-concurrent-settlement-visitor-${suffix}@example.com`,
        quantity: 2,
      }),
    });
    assert.equal(reservationResponse.status, 201, JSON.stringify(await reservationResponse.clone().json()));
    const reservationBody = await reservationResponse.json();
    reservationId = reservationBody.reservation.id as string;

    const orderResponse = await fetch(`${baseUrl}/api/event-ticket-orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${visitor.token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `p0-concurrent-settlement-order-${suffix}`,
      },
      body: JSON.stringify({ reservationId }),
    });
    assert.equal(orderResponse.status, 201, JSON.stringify(await orderResponse.clone().json()));
    const orderBody = await orderResponse.json();
    paymentId = orderBody.payment.id as string;

    const provider = new MockPaymentProvider();
    const deliver = (index: number) => {
      const payload = {
        eventId: `p0-concurrent-capture-${suffix}-${index}`,
        eventType: "payment.captured",
        providerOrderId: orderBody.payment.providerOrderId,
        providerPaymentId: `mock_pay_${paymentId}`,
        amount: Number(orderBody.payment.amount),
        currency: orderBody.payment.currency,
        outcome: "paid",
      };
      const rawBody = JSON.stringify(payload);
      return fetch(`${baseUrl}/api/webhooks/payments/mock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Mock-Signature": provider.sign(rawBody),
          "X-Razorpay-Event-Id": payload.eventId,
        },
        body: rawBody,
      });
    };

    const responses = await Promise.all(Array.from({ length: 6 }, (_, index) => deliver(index)));
    const responseBodies = await Promise.all(responses.map(async (response) => ({
      status: response.status,
      body: await response.json(),
    })));
    assert.ok(
      responseBodies.every((response) => response.status === 200),
      JSON.stringify(responseBodies),
    );

    const persistedPayment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const persistedOrder = await prisma.eventTicketOrder.findUniqueOrThrow({ where: { paymentId } });
    const persistedReservation = await prisma.eventTicketReservation.findUniqueOrThrow({ where: { id: reservationId } });
    const issuedTickets = await prisma.eventTicket.findMany({
      where: { eventTicketOrderId: persistedOrder.id },
      orderBy: { createdAt: "asc" },
    });
    const activeReservations = await prisma.eventTicketReservation.aggregate({
      where: { eventTicketTypeId: ticketType.id, status: "ACTIVE", expiresAt: { gt: new Date() } },
      _sum: { quantity: true },
    });
    const paidOrders = await prisma.eventTicketOrder.aggregate({
      where: { status: "PAID", reservation: { eventTicketTypeId: ticketType.id } },
      _sum: { quantity: true },
    });

    assert.equal(persistedPayment.status, "paid");
    assert.equal(persistedOrder.status, "PAID");
    assert.equal(persistedReservation.status, "CONVERTED");
    assert.equal(issuedTickets.length, 2, "concurrent captures must issue exactly the purchased quantity");
    assert.equal(new Set(issuedTickets.map((ticket) => ticket.ticketCode)).size, 2, "issued ticket codes must be unique");
    assert.equal(
      (activeReservations._sum.quantity ?? 0) + (paidOrders._sum.quantity ?? 0),
      2,
      "active reservations plus paid orders must not exceed or lose the two-ticket capacity",
    );
    assert.equal(
      await prisma.paymentEvent.count({ where: { paymentId, eventType: "payment.captured" } }),
      6,
      "each distinct provider event is auditable even though settlement is idempotent",
    );
  } finally {
    if (paymentId) {
      const order = await prisma.eventTicketOrder.findUnique({ where: { paymentId } });
      if (order) await prisma.eventTicket.deleteMany({ where: { eventTicketOrderId: order.id } });
      await prisma.paymentEvent.deleteMany({ where: { paymentId } });
      await prisma.refund.deleteMany({ where: { paymentId } });
      await prisma.eventTicketOrder.deleteMany({ where: { paymentId } });
      await prisma.payment.deleteMany({ where: { id: paymentId } });
    }
    if (reservationId) await prisma.eventTicketReservation.deleteMany({ where: { id: reservationId } });
    await prisma.eventTicketType.deleteMany({ where: { eventId: event.id } });
    await prisma.eventModuleEnablement.deleteMany({ where: { eventId: event.id } });
    await prisma.event.delete({ where: { id: event.id } });
    await prisma.organizerMembership.deleteMany({ where: { organizerId: membership.organizerId } });
    await prisma.organizer.delete({ where: { id: membership.organizerId } });
    await prisma.user.deleteMany({ where: { id: { in: [organizer.user.id, visitor.user.id] } } });
  }
});

test("late successful payment never issues a ticket after reservation expiry and enters compensation refund flow", async () => {
  const suffix = Date.now();
  const organizer = await signup(`p0-late-payment-org-${suffix}@example.com`, "organizer");
  const visitor = await signup(`p0-late-payment-visitor-${suffix}@example.com`, "visitor");
  const membership = await prisma.organizerMembership.findFirstOrThrow({ where: { userId: organizer.user.id, status: "active" } });
  const event = await prisma.event.create({
    data: {
      organizerId: membership.organizerId,
      ownerId: organizer.user.id,
      title: `P0 Late Payment ${suffix}`,
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
      startDate: new Date("2030-01-01T10:00:00Z"),
      endDate: new Date("2030-01-01T18:00:00Z"),
      moduleEnablements: { create: [{ moduleType: "TICKETING", enabled: true }] },
    },
  });
  const ticket = await prisma.eventTicketType.create({
    data: {
      eventId: event.id,
      name: "Late Payment Ticket",
      price: 500,
      currency: "INR",
      capacity: 1,
      maxPerOrder: 1,
      maxPerAttendee: 1,
      status: "ACTIVE",
    },
  });

  let paymentId: string | null = null;
  try {
    const reservationResponse = await fetch(`${baseUrl}/api/event-ticket-reservations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${visitor.token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `p0-late-payment-reservation-${suffix}`,
      },
      body: JSON.stringify({
        eventTicketTypeId: ticket.id,
        attendeeName: "Late Payment Visitor",
        attendeeEmail: `p0-late-payment-visitor-${suffix}@example.com`,
        quantity: 1,
      }),
    });
    assert.equal(reservationResponse.status, 201);
    const reservationBody = await reservationResponse.json();

    const orderResponse = await fetch(`${baseUrl}/api/event-ticket-orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${visitor.token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `p0-late-payment-order-${suffix}`,
      },
      body: JSON.stringify({ reservationId: reservationBody.reservation.id }),
    });
    assert.equal(orderResponse.status, 201);
    const orderBody = await orderResponse.json();
    paymentId = orderBody.payment.id as string;

    // Simulate the reservation being released before the provider reports
    // success. This is the critical late-webhook/browser-callback race.
    await prisma.eventTicketReservation.update({
      where: { id: reservationBody.reservation.id },
      data: { status: "EXPIRED", expiresAt: new Date(Date.now() - 1_000) },
    });

    const completion = await fetch(`${baseUrl}/api/payments/${paymentId}/mock-complete`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${visitor.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ outcome: "success" }),
    });
    assert.equal(completion.status, 200, JSON.stringify(await completion.clone().json()));

    const persistedPayment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const persistedOrder = await prisma.eventTicketOrder.findUniqueOrThrow({ where: { paymentId } });
    const persistedReservation = await prisma.eventTicketReservation.findUniqueOrThrow({ where: { id: reservationBody.reservation.id } });
    const refunds = await prisma.refund.findMany({ where: { paymentId } });
    const issuedTickets = await prisma.eventTicket.count({ where: { eventTicketOrderId: persistedOrder.id } });

    assert.equal(persistedPayment.status, "paid", "the captured payment must remain financially authoritative until the refund settles");
    assert.equal(persistedOrder.status, "FAILED", "the expired order must never be presented as a valid paid order");
    assert.equal(persistedReservation.status, "EXPIRED");
    assert.equal(issuedTickets, 0, "released inventory must never be re-issued by a late payment");
    assert.equal(refunds.length, 1, "late captured payment must enter the normal refund ledger");
    assert.equal(refunds[0].status, "PROCESSING", "the mock provider intentionally leaves compensation refunds pending");
    assert.equal(Number(refunds[0].amount), 500);
  } finally {
    if (paymentId) {
      await prisma.refund.deleteMany({ where: { paymentId } });
      await prisma.eventTicketOrder.deleteMany({ where: { paymentId } });
      await prisma.payment.delete({ where: { id: paymentId } }).catch(() => undefined);
    }
    await prisma.eventTicketReservation.deleteMany({ where: { eventTicketTypeId: ticket.id } });
    await prisma.eventTicketType.delete({ where: { id: ticket.id } });
    await prisma.eventModuleEnablement.deleteMany({ where: { eventId: event.id } });
    await prisma.event.delete({ where: { id: event.id } });
    await prisma.organizerMembership.deleteMany({ where: { organizerId: membership.organizerId } });
    await prisma.organizer.delete({ where: { id: membership.organizerId } });
    await prisma.user.deleteMany({ where: { id: { in: [organizer.user.id, visitor.user.id] } } });
  }
});


test("signed payment webhook compensates a late ticket capture and safely retries the duplicate event", async () => {
  const suffix = Date.now();
  const organizer = await signup(`p0-webhook-late-org-${suffix}@example.com`, "organizer");
  const visitor = await signup(`p0-webhook-late-visitor-${suffix}@example.com`, "visitor");
  const membership = await prisma.organizerMembership.findFirstOrThrow({
    where: { userId: organizer.user.id, status: "active" },
  });
  const event = await prisma.event.create({
    data: {
      organizerId: membership.organizerId,
      ownerId: organizer.user.id,
      title: `Webhook Late Payment ${suffix}`,
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
      startDate: new Date("2030-01-01T10:00:00Z"),
      endDate: new Date("2030-01-01T18:00:00Z"),
      moduleEnablements: { create: [{ moduleType: "TICKETING", enabled: true }] },
    },
  });
  const ticketType = await prisma.eventTicketType.create({
    data: {
      eventId: event.id,
      name: "Webhook Late Payment Ticket",
      price: 500,
      currency: "INR",
      capacity: 1,
      maxPerOrder: 1,
      maxPerAttendee: 1,
      status: "ACTIVE",
    },
  });
  let reservationId: string | null = null;
  let paymentId: string | null = null;
  try {
    const reservationResponse = await fetch(`${baseUrl}/api/event-ticket-reservations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${visitor.token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `p0-webhook-late-reservation-${suffix}`,
      },
      body: JSON.stringify({
        eventTicketTypeId: ticketType.id,
        attendeeName: "Webhook Late Visitor",
        attendeeEmail: `p0-webhook-late-visitor-${suffix}@example.com`,
        quantity: 1,
      }),
    });
    assert.equal(reservationResponse.status, 201);
    const reservationBody = await reservationResponse.json();
    reservationId = reservationBody.reservation.id as string;

    const orderResponse = await fetch(`${baseUrl}/api/event-ticket-orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${visitor.token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `p0-webhook-late-order-${suffix}`,
      },
      body: JSON.stringify({ reservationId }),
    });
    assert.equal(orderResponse.status, 201);
    const orderBody = await orderResponse.json();
    paymentId = orderBody.payment.id as string;

    await prisma.eventTicketReservation.update({
      where: { id: reservationId },
      data: { status: "EXPIRED", expiresAt: new Date(Date.now() - 1_000) },
    });

    const provider = new MockPaymentProvider();
    const eventPayload = {
      eventId: `p0-webhook-late-captured-${suffix}`,
      eventType: "payment.captured",
      providerOrderId: orderBody.payment.providerOrderId,
      providerPaymentId: `mock_pay_${paymentId}`,
      amount: Number(orderBody.payment.amount),
      currency: orderBody.payment.currency,
      outcome: "paid",
    };
    const rawBody = JSON.stringify(eventPayload);
    const signature = provider.sign(rawBody);
    const deliver = () => fetch(`${baseUrl}/api/webhooks/payments/mock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mock-Signature": signature,
        "X-Razorpay-Event-Id": eventPayload.eventId,
      },
      body: rawBody,
    });

    const first = await deliver();
    assert.equal(first.status, 200, JSON.stringify(await first.clone().json()));
    const persistedPayment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const persistedOrder = await prisma.eventTicketOrder.findUniqueOrThrow({ where: { paymentId } });
    const refunds = await prisma.refund.findMany({ where: { paymentId } });
    assert.equal(persistedPayment.status, "paid");
    assert.equal(persistedOrder.status, "FAILED");
    assert.equal(refunds.length, 1, "late captured webhook must create one compensation refund");
    assert.equal(refunds[0].status, "PROCESSING");
    assert.equal(Number(refunds[0].amount), Number(persistedPayment.amount));
    assert.equal(await prisma.eventTicket.count({ where: { eventTicketOrderId: persistedOrder.id } }), 0);

    const replay = await deliver();
    assert.equal(replay.status, 200, JSON.stringify(await replay.clone().json()));
    assert.deepEqual(await replay.json(), { received: true, duplicate: true });
    assert.equal(await prisma.refund.count({ where: { paymentId } }), 1, "duplicate webhook must not create a second refund");
  } finally {
    if (paymentId) {
      await prisma.refund.deleteMany({ where: { paymentId } });
      await prisma.eventTicketOrder.deleteMany({ where: { paymentId } });
      await prisma.payment.deleteMany({ where: { id: paymentId } });
    }
    if (reservationId) await prisma.eventTicketReservation.deleteMany({ where: { id: reservationId } });
    await prisma.eventTicketType.deleteMany({ where: { eventId: event.id } });
    await prisma.eventModuleEnablement.deleteMany({ where: { eventId: event.id } });
    await prisma.event.delete({ where: { id: event.id } });
    await prisma.organizerMembership.deleteMany({ where: { organizerId: membership.organizerId } });
    await prisma.organizer.delete({ where: { id: membership.organizerId } });
    await prisma.user.deleteMany({ where: { id: { in: [organizer.user.id, visitor.user.id] } } });
  }
});


test("concurrent reservations by one visitor never exceed maxPerAttendee", async () => {
  const suffix = Date.now();
  const organizer = await signup(`p0-attendee-limit-org-${suffix}@example.com`, "organizer");
  const visitor = await signup(`p0-attendee-limit-visitor-${suffix}@example.com`, "visitor");
  const membership = await prisma.organizerMembership.findFirstOrThrow({
    where: { userId: organizer.user.id, status: "active" },
  });
  const event = await prisma.event.create({
    data: {
      organizerId: membership.organizerId,
      ownerId: organizer.user.id,
      title: `P0 Attendee Limit ${suffix}`,
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
      startDate: new Date("2030-01-01T10:00:00Z"),
      endDate: new Date("2030-01-01T18:00:00Z"),
      moduleEnablements: { create: [{ moduleType: "TICKETING", enabled: true }] },
    },
  });
  const ticket = await prisma.eventTicketType.create({
    data: {
      eventId: event.id,
      name: "One Per Visitor",
      price: 0,
      currency: "INR",
      capacity: 4,
      maxPerOrder: 1,
      maxPerAttendee: 1,
      status: "ACTIVE",
    },
  });

  try {
    const reserve = (key: string) => fetch(`${baseUrl}/api/event-ticket-reservations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${visitor.token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify({
        eventTicketTypeId: ticket.id,
        attendeeName: "Concurrent Limit Visitor",
        attendeeEmail: `p0-attendee-limit-visitor-${suffix}@example.com`,
        quantity: 1,
      }),
    });

    const responses = await Promise.all([
      reserve(`p0-attendee-limit-a-${suffix}`),
      reserve(`p0-attendee-limit-b-${suffix}`),
    ]);
    const results = await Promise.all(responses.map(async (response) => ({
      status: response.status,
      body: await response.json(),
    })));

    assert.deepEqual(
      results.map((result) => result.status).sort((a, b) => a - b),
      [201, 409],
      "only one of two concurrent requests may consume the visitor's single-ticket allowance",
    );
    assert.equal(
      results.find((result) => result.status === 409)?.body.error,
      "Attendee ticket limit exceeded",
    );

    const persisted = await prisma.eventTicketReservation.aggregate({
      where: {
        eventTicketTypeId: ticket.id,
        userId: visitor.user.id,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
      },
      _sum: { quantity: true },
    });
    assert.equal(
      persisted._sum.quantity ?? 0,
      1,
      "persisted active reservations for the visitor must respect maxPerAttendee",
    );
    assert.equal(
      await prisma.eventTicketReservation.count({ where: { eventTicketTypeId: ticket.id } }),
      1,
      "the losing request must not persist a second reservation",
    );
  } finally {
    await prisma.eventTicketReservation.deleteMany({ where: { eventTicketTypeId: ticket.id } });
    await prisma.eventTicketType.delete({ where: { id: ticket.id } });
    await prisma.eventModuleEnablement.deleteMany({ where: { eventId: event.id } });
    await prisma.event.delete({ where: { id: event.id } });
    await prisma.organizerMembership.deleteMany({ where: { organizerId: membership.organizerId } });
    await prisma.organizer.delete({ where: { id: membership.organizerId } });
    await prisma.user.deleteMany({ where: { id: { in: [organizer.user.id, visitor.user.id] } } });
  }
});
