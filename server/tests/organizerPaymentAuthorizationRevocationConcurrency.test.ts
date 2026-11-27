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

  // Observe the API request actually waiting on the organizer row lock;
  // a fixed delay alone could pass merely because the HTTP request was slow.
  let blocked = false;
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const waiting = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_stat_activity activity
        WHERE activity.wait_event_type = 'Lock'
          AND activity.query ILIKE '%organizers%'
          AND activity.query ILIKE '%FOR UPDATE%'
          AND cardinality(pg_blocking_pids(activity.pid)) > 0
      ) AS waiting
    `;
    if (waiting[0]?.waiting) {
      blocked = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  unlock();
  await revoke;

  assert.equal(blocked, true, "payment detail did not wait on the organizer lock during revocation");
  const response = await responsePromise;
  assert.equal(response.status, 404, await response.text());

  const remaining = await prisma.organizerMembership.findUnique({ where: { id: membership.id } });
  assert.equal(remaining, null, "revocation must remain committed");
});
