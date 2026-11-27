import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { signupUser } from "./helpers/phase21bFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
let userId: string | undefined;
let membershipId: string | undefined;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  if (membershipId) await prisma.organizerMembership.deleteMany({ where: { id: membershipId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  await stop();
  await prisma.$disconnect();
});

test("payment detail authorization serializes with organizer membership revocation", async () => {
  const payment = await prisma.payment.findUniqueOrThrow({
    where: { id: "seed-payment-ticket-01" },
    include: { ticketBooking: { include: { exhibition: true } } },
  });
  const organizerId = payment.ticketBooking?.exhibition.organizerId;
  assert.ok(organizerId, "fixture payment must belong to an organizer");

  const email = `a1-payment-revoke-${ts}@example.com`;
  const user = await signupUser(baseUrl, email, "A1 Payment Revocation", "visitor");
  userId = user.userId;
  const membership = await prisma.organizerMembership.create({
    data: { organizerId, userId: user.userId, role: "finance", status: "active" },
  });
  membershipId = membership.id;

  let unlock!: () => void;
  let signalLocked!: () => void;
  const lockReady = new Promise<void>((resolve) => { signalLocked = resolve; });
  const holdLock = new Promise<void>((resolve) => { unlock = resolve; });

  const revoke = prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "organizers" WHERE "id" = ${organizerId} FOR UPDATE`;
    await tx.organizerMembership.delete({ where: { id: membership.id } });
    signalLocked();
    await holdLock;
  });

  await lockReady;
  const responsePromise = fetch(`${baseUrl}/api/organizer/payments/${payment.id}`, {
    headers: { Authorization: `Bearer ${user.token}` },
  });

  // A correctly serialized handler must wait for the organizer lock instead
  // of authorizing against the still-committed pre-revocation membership.
  const early = await Promise.race([
    responsePromise.then((response) => ({ completed: true as const, status: response.status })),
    new Promise<{ completed: false }>((resolve) => setTimeout(() => resolve({ completed: false }), 150)),
  ]);
  unlock();
  await revoke;

  assert.equal(early.completed, false, "payment detail returned while revocation held the organizer lock");
  const response = await responsePromise;
  assert.equal(response.status, 404, await response.text());

  const remaining = await prisma.organizerMembership.findUnique({ where: { id: membership.id } });
  assert.equal(remaining, null, "revocation must remain committed");
});
