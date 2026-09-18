import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, applyAsExhibitor, approveParticipation, createStall, cleanupOrganizers } from "./helpers/entitlementFixtures";
import { selectStall } from "./helpers/phase21bFixtures";
import { enqueueNotificationIntent } from "../src/lib/notificationOutboxService";
import { processOneIntent, processOneDelivery, runDispatcherTick } from "../src/lib/notificationDispatcher";
import { releaseExpiredReservations, RESERVATION_EXPIRY_MS } from "../src/lib/stallReservationExpiry";

/** Backdates a stall's reservedAt past the expiry window — same trick server/tests/phase30_reservationExpiry.test.ts uses to simulate an abandoned reservation without waiting a real hour. */
async function backdateReservation(stallId: string) {
  await prisma.stall.update({
    where: { id: stallId },
    data: { reservedAt: new Date(Date.now() - RESERVATION_EXPIRY_MS - 60_000) },
  });
}

let baseUrl: string;
let stop: () => Promise<void>;
const organizerIds: string[] = [];
const ts = Date.now();

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

// The outbox is a genuinely global FIFO queue by design
// (claimNotificationIntent/claimNotificationDelivery pick the OLDEST
// eligible row, not a row scoped to any particular test) — exactly the
// real-world behavior a dispatcher needs. That means each test needs to
// start from an empty queue: a row left behind by an earlier test in this
// same file (e.g. one that only asserts on delivery status without draining
// them) would otherwise get claimed by a later, unrelated test's concurrent-
// claim assertions instead of its own rows. These two tables are wholly
// owned by this phase — safe to clear before every test.
beforeEach(async () => {
  await prisma.$executeRaw`DELETE FROM notification_deliveries`;
  await prisma.$executeRaw`DELETE FROM notification_intents`;
});

after(async () => {
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

async function getIntentStatus(intentId: string): Promise<{ status: string; attempts: number }> {
  const rows = await prisma.$queryRaw<Array<{ status: string; attempts: number }>>`
    SELECT status, attempts FROM notification_intents WHERE id = ${intentId}
  `;
  return rows[0];
}

async function getDeliveries(intentId: string): Promise<Array<{ id: string; channel: string; status: string; attempts: number; recipient_user_id: string }>> {
  return prisma.$queryRaw`SELECT id, channel, status, attempts, recipient_user_id FROM notification_deliveries WHERE intent_id = ${intentId} ORDER BY channel ASC`;
}

/** Sets up a fresh exhibitor business (owned by a known user) under a fresh organizer, for tests that need a real, resolvable STALL_RESERVATION_EXPIRED recipient without going through the full reserve/expire flow every time. */
async function setupBusinessOwner(label: string, tsOffset: number) {
  const { organizerId, token: organizerToken, firstExhibitionId } = await bootstrapOrganizer(baseUrl, label, ts + tsOffset);
  organizerIds.push(organizerId);
  const exhibitor = await applyAsExhibitor(baseUrl, firstExhibitionId, `${label}-x`, ts + tsOffset);
  return { organizerToken, firstExhibitionId, ownerUserId: exhibitor.userId, participationId: exhibitor.participationId };
}

test("notification dispatcher: successful dispatch — intent resolves, fans out, delivers IN_APP, and completes", async () => {
  const { ownerUserId, participationId } = await setupBusinessOwner("phase31-success", 0);

  const enqueued = await enqueueNotificationIntent({
    eventKey: `test:${randomUUID()}`,
    idempotencyKey: `test:${randomUUID()}`,
    eventType: "STALL_RESERVATION_EXPIRED",
    entityType: "ExhibitionExhibitor",
    entityId: participationId,
    payload: { exhibitionId: "test-exhibition", stallId: "test-stall" },
  });

  const intentResult = await processOneIntent("test-worker-1");
  assert.equal(intentResult, "processed");
  const intentStatus = await getIntentStatus(enqueued.id);
  assert.equal(intentStatus.status, "COMPLETED");

  const deliveries = await getDeliveries(enqueued.id);
  assert.equal(deliveries.length, 2, "IN_APP and EMAIL deliveries must both be created for this resolver");
  assert.deepEqual(deliveries.map((d) => d.channel).sort(), ["EMAIL", "IN_APP"]);
  assert.ok(deliveries.every((d) => d.status === "PENDING"));

  let drained = 0;
  while ((await processOneDelivery("test-worker-1")) === "processed" && drained < 10) drained++;
  assert.equal(drained, 2);

  const finalDeliveries = await getDeliveries(enqueued.id);
  assert.ok(finalDeliveries.every((d) => d.status === "SENT"), JSON.stringify(finalDeliveries));

  const notification = await prisma.notification.findFirst({
    where: { userId: ownerUserId, type: "STALL_RESERVATION_EXPIRED", entityId: participationId, sourceVersion: enqueued.id },
  });
  assert.ok(notification, "the IN_APP delivery must have written a real row into the existing notifications table");
  assert.equal(notification!.actionUrl, "/exhibitor-dashboard/participations");
  assert.match(notification!.title, /expired/i);
});

test("notification dispatcher: temporary provider failure retries with backoff, then succeeds", async () => {
  const { ownerUserId, participationId } = await setupBusinessOwner("phase31-retry", 1);

  const enqueued = await enqueueNotificationIntent({
    eventKey: `test:${randomUUID()}`,
    idempotencyKey: `test:${randomUUID()}`,
    eventType: "STALL_RESERVATION_EXPIRED",
    entityType: "ExhibitionExhibitor",
    entityId: participationId,
    // The mock EMAIL adapter fails every attempt <= 1, succeeds from attempt 2 onward.
    payload: { exhibitionId: "test-exhibition", stallId: "test-stall", __testForceFailUntilAttempt: 1 },
  });

  await processOneIntent("test-worker-1");
  const deliveries = await getDeliveries(enqueued.id);
  const emailDelivery = deliveries.find((d) => d.channel === "EMAIL")!;
  assert.ok(emailDelivery);

  // Two deliveries (IN_APP + EMAIL) were created in the same fan-out — their
  // created_at can tie, so claimNotificationDelivery's FIFO order between them
  // is not guaranteed. Drain both unconditionally (two calls) rather than
  // assuming which one a single call happens to pick, then assert on the
  // EMAIL delivery specifically by id.
  await processOneDelivery("test-worker-1");
  await processOneDelivery("test-worker-1");

  const afterFirst = await prisma.$queryRaw<Array<{ status: string; attempts: number; available_at: Date; last_error: string | null }>>`
    SELECT status, attempts, available_at, last_error FROM notification_deliveries WHERE id = ${emailDelivery.id}
  `;
  assert.equal(afterFirst[0].status, "RETRY_WAIT");
  assert.equal(afterFirst[0].attempts, 1);
  assert.match(afterFirst[0].last_error ?? "", /Simulated transient provider failure/);
  assert.ok(afterFirst[0].available_at.getTime() > Date.now(), "retry must be scheduled in the future, not immediately claimable");

  // Move the retry into the past so it's claimable now, without waiting for the real backoff window.
  await prisma.$executeRaw`UPDATE notification_deliveries SET available_at = NOW() - INTERVAL '1 second' WHERE id = ${emailDelivery.id}`;

  const secondAttempt = await processOneDelivery("test-worker-1");
  assert.equal(secondAttempt, "processed");
  const afterSecond = await prisma.$queryRaw<Array<{ status: string; attempts: number }>>`
    SELECT status, attempts FROM notification_deliveries WHERE id = ${emailDelivery.id}
  `;
  assert.equal(afterSecond[0].status, "SENT", "attempt 2 must succeed since forceFailUntilAttempt is 1");
  assert.equal(afterSecond[0].attempts, 2);

  const notification = await prisma.notification.findFirst({ where: { userId: ownerUserId, sourceVersion: enqueued.id } });
  assert.ok(notification, "the IN_APP delivery (no forced failure) must have succeeded independently, in whichever of the two calls above claimed it");
});

test("notification dispatcher: a delivery that keeps failing is retried up to MAX_DELIVERY_ATTEMPTS, then permanently FAILED (never DEAD_LETTER, and never retried again)", async () => {
  const { participationId } = await setupBusinessOwner("phase31-max-attempts", 1.5);

  const enqueued = await enqueueNotificationIntent({
    eventKey: `test:${randomUUID()}`,
    idempotencyKey: `test:${randomUUID()}`,
    eventType: "STALL_RESERVATION_EXPIRED",
    entityType: "ExhibitionExhibitor",
    entityId: participationId,
    // Fails every attempt through 999 — i.e. always, for the life of this test.
    payload: { exhibitionId: "test-exhibition", stallId: "test-stall", __testForceFailUntilAttempt: 999 },
  });

  await processOneIntent("test-worker-max");
  const deliveries = await getDeliveries(enqueued.id);
  const emailDelivery = deliveries.find((d) => d.channel === "EMAIL")!;
  const inAppDelivery = deliveries.find((d) => d.channel === "IN_APP")!;
  assert.ok(emailDelivery);

  // claimNotificationDelivery claims the oldest eligible row without regard
  // to channel, and this intent's IN_APP + EMAIL deliveries can tie on
  // created_at — so take the IN_APP row out of contention directly (it has
  // no forced failure and would just succeed) rather than race it against
  // the EMAIL attempt-loop below via repeated processOneDelivery calls.
  await prisma.$executeRaw`UPDATE notification_deliveries SET status = 'SENT', locked_at = NULL, locked_by = NULL WHERE id = ${inAppDelivery.id}`;

  // Drive the EMAIL delivery through every retry attempt up to the max,
  // forcing each retry's available_at into the past so it's immediately
  // claimable instead of waiting out the real backoff window.
  for (let attempt = 1; attempt <= 5; attempt++) {
    await prisma.$executeRaw`UPDATE notification_deliveries SET available_at = NOW() - INTERVAL '1 second' WHERE id = ${emailDelivery.id}`;
    await processOneDelivery("test-worker-max");
    const row = await prisma.$queryRaw<Array<{ status: string; attempts: number }>>`
      SELECT status, attempts FROM notification_deliveries WHERE id = ${emailDelivery.id}
    `;
    assert.equal(row[0].attempts, attempt);
    if (attempt < 5) {
      assert.equal(row[0].status, "RETRY_WAIT", `attempt ${attempt} of 5 must still be retryable`);
    } else {
      assert.equal(row[0].status, "FAILED", "attempt 5 (MAX_DELIVERY_ATTEMPTS) must permanently fail the delivery, not dead-letter it — DEAD_LETTER is an intent-level status, not a delivery-level one");
    }
  }

  const auditCount = await prisma.auditLog.count({ where: { action: "notification.delivery_failed", entityId: emailDelivery.id } });
  assert.equal(auditCount, 1, "the terminal failure must be audited exactly once");

  // A FAILED delivery must never be claimed again, even once its available_at
  // is in the past — claimNotificationDelivery only matches PENDING/RETRY_WAIT
  // (or a stale PROCESSING lease), never FAILED.
  await prisma.$executeRaw`UPDATE notification_deliveries SET available_at = NOW() - INTERVAL '1 second' WHERE id = ${emailDelivery.id}`;
  const claimAttempt = await processOneDelivery("test-worker-max");
  assert.equal(claimAttempt, "empty", "a FAILED delivery must never be reclaimed, even with available_at in the past");
  const afterMax = await prisma.$queryRaw<Array<{ status: string; attempts: number }>>`
    SELECT status, attempts FROM notification_deliveries WHERE id = ${emailDelivery.id}
  `;
  assert.equal(afterMax[0].status, "FAILED");
  assert.equal(afterMax[0].attempts, 5, "a FAILED delivery must never be reclaimed or re-attempted");
});

test("notification dispatcher: duplicate worker execution — two concurrent claims on the same intent, exactly one processes it", async () => {
  const { participationId } = await setupBusinessOwner("phase31-dup-intent", 2);

  const enqueued = await enqueueNotificationIntent({
    eventKey: `test:${randomUUID()}`,
    idempotencyKey: `test:${randomUUID()}`,
    eventType: "STALL_RESERVATION_EXPIRED",
    entityType: "ExhibitionExhibitor",
    entityId: participationId,
    payload: {},
  });

  const [a, b] = await Promise.all([processOneIntent("worker-a"), processOneIntent("worker-b")]);
  const outcomes = [a, b].sort();
  assert.deepEqual(outcomes, ["empty", "processed"], "exactly one concurrent claim must win; the other must find nothing left to claim");

  const deliveries = await getDeliveries(enqueued.id);
  assert.equal(deliveries.length, 2, "the intent must be fanned out exactly once, not once per racing worker");

  const status = await getIntentStatus(enqueued.id);
  assert.equal(status.status, "COMPLETED");
});

test("notification dispatcher: duplicate worker execution on a delivery — two concurrent claims on the SAME delivery, exactly one wins", async () => {
  const { participationId } = await setupBusinessOwner("phase31-dup-delivery", 3);
  const enqueued = await enqueueNotificationIntent({
    eventKey: `test:${randomUUID()}`,
    idempotencyKey: `test:${randomUUID()}`,
    eventType: "STALL_RESERVATION_EXPIRED",
    entityType: "ExhibitionExhibitor",
    entityId: participationId,
    payload: {},
  });
  await processOneIntent("worker-setup");

  // The fan-out creates two deliveries (IN_APP + EMAIL). Racing two claimers
  // against a pool of TWO available rows doesn't reliably test "duplicate
  // worker execution" — if both racers' candidate selection happens to land
  // on the same row (a legitimate outcome when rows tie on created_at), one
  // correctly gets "empty" while the OTHER row sits untouched, which looks
  // identical to a bug from the outside but isn't one. Isolate the actual
  // invariant instead: delete one delivery so exactly ONE contended row
  // exists, then race two claimers against that single row — deterministic,
  // and exactly what "two workers try to claim the same unit of work" means.
  const deliveries = await getDeliveries(enqueued.id);
  const [keep, ...rest] = deliveries;
  for (const d of rest) {
    await prisma.$executeRaw`DELETE FROM notification_deliveries WHERE id = ${d.id}`;
  }

  const [a, b] = await Promise.all([processOneDelivery("worker-a"), processOneDelivery("worker-b")]);
  assert.deepEqual([a, b].sort(), ["empty", "processed"], "exactly one concurrent claim on the same delivery must win; the other must find nothing left to claim");

  const final = await prisma.$queryRaw<Array<{ attempts: number; status: string }>>`
    SELECT attempts, status FROM notification_deliveries WHERE id = ${keep.id}
  `;
  assert.equal(final[0].attempts, 1, "the contended delivery must be attempted exactly once, never twice, by the concurrent pair");
  assert.equal(final[0].status, "SENT");
});

test("notification dispatcher: restart recovery — a stale PROCESSING lease is reclaimable after the lease window", async () => {
  const { participationId } = await setupBusinessOwner("phase31-restart", 4);
  const enqueued = await enqueueNotificationIntent({
    eventKey: `test:${randomUUID()}`,
    idempotencyKey: `test:${randomUUID()}`,
    eventType: "STALL_RESERVATION_EXPIRED",
    entityType: "ExhibitionExhibitor",
    entityId: participationId,
    payload: {},
  });

  // Simulate a worker crashing mid-processing: claimed, locked, never finished.
  const crashed = await processOneIntent("worker-that-crashes");
  assert.equal(crashed, "processed");
  // processOneIntent completes synchronously in this test (no real crash), so
  // force the intent back into a stuck PROCESSING state with a stale lease to
  // simulate the crash scenario the claim SQL's 5-minute window guards against.
  await prisma.$executeRaw`
    UPDATE notification_intents
    SET status = 'PROCESSING', locked_at = NOW() - INTERVAL '10 minutes', locked_by = 'worker-that-crashed', completed_at = NULL
    WHERE id = ${enqueued.id}
  `;

  const beforeRecovery = await getIntentStatus(enqueued.id);
  assert.equal(beforeRecovery.status, "PROCESSING");

  const recovered = await processOneIntent("worker-recovery");
  assert.equal(recovered, "processed", "a stale (>5 minute) PROCESSING lease must be reclaimable, not stuck forever");
  const afterRecovery = await getIntentStatus(enqueued.id);
  assert.equal(afterRecovery.status, "COMPLETED");
});

test("notification dispatcher: invalid recipient is dead-lettered cleanly, no crash", async () => {
  const enqueued = await enqueueNotificationIntent({
    eventKey: `test:${randomUUID()}`,
    idempotencyKey: `test:${randomUUID()}`,
    eventType: "STALL_RESERVATION_EXPIRED",
    entityType: "ExhibitionExhibitor",
    entityId: "00000000-0000-0000-0000-000000000000", // does not exist
    payload: {},
  });

  const result = await processOneIntent("worker-invalid");
  assert.equal(result, "processed");
  const status = await getIntentStatus(enqueued.id);
  assert.equal(status.status, "DEAD_LETTER");

  const deliveries = await getDeliveries(enqueued.id);
  assert.equal(deliveries.length, 0, "no delivery rows should be created for an unresolvable recipient");

  const auditCount = await prisma.auditLog.count({ where: { action: "notification.intent_dead_letter", entityId: enqueued.id } });
  assert.equal(auditCount, 1);
});

test("notification dispatcher: unknown event type is dead-lettered cleanly, no crash", async () => {
  const enqueued = await enqueueNotificationIntent({
    eventKey: `test:${randomUUID()}`,
    idempotencyKey: `test:${randomUUID()}`,
    eventType: "SOME_EVENT_TYPE_WITH_NO_RESOLVER",
    entityType: "Whatever",
    entityId: "irrelevant",
    payload: {},
  });

  const result = await processOneIntent("worker-unknown-type");
  assert.equal(result, "processed");
  const status = await getIntentStatus(enqueued.id);
  assert.equal(status.status, "DEAD_LETTER");
});

test("notification dispatcher: a disabled channel preference creates a SUPPRESSED delivery, never attempted", async () => {
  const { ownerUserId, participationId } = await setupBusinessOwner("phase31-suppressed", 5);

  await prisma.$executeRaw`
    INSERT INTO notification_channel_preferences (user_id, event_type, channel, enabled)
    VALUES (${ownerUserId}, 'STALL_RESERVATION_EXPIRED', 'EMAIL', false)
  `;

  const enqueued = await enqueueNotificationIntent({
    eventKey: `test:${randomUUID()}`,
    idempotencyKey: `test:${randomUUID()}`,
    eventType: "STALL_RESERVATION_EXPIRED",
    entityType: "ExhibitionExhibitor",
    entityId: participationId,
    payload: {},
  });

  await processOneIntent("worker-pref");
  const deliveries = await getDeliveries(enqueued.id);
  const email = deliveries.find((d) => d.channel === "EMAIL")!;
  const inApp = deliveries.find((d) => d.channel === "IN_APP")!;
  assert.equal(email.status, "SUPPRESSED", "a disabled channel must still get an audited row, not be silently dropped");
  assert.equal(inApp.status, "PENDING", "the non-disabled channel must be unaffected");

  // A SUPPRESSED delivery must never actually be claimed/attempted.
  await processOneDelivery("worker-pref");
  const afterDrain = await getDeliveries(enqueued.id);
  assert.equal(afterDrain.find((d) => d.channel === "EMAIL")!.status, "SUPPRESSED");
  assert.equal(afterDrain.find((d) => d.channel === "IN_APP")!.status, "SENT");
});

test("notification dispatcher: a preference disabled AFTER the intent is queued (but before delivery) still suppresses that channel — delivery-time re-check, not just enqueue-time", async () => {
  const { ownerUserId, participationId } = await setupBusinessOwner("phase31-late-pref", 5.5);

  // No channel preference row exists yet — the intent is enqueued and fanned
  // out to deliveries first, exactly like a real recipient who has never
  // touched their preferences.
  const enqueued = await enqueueNotificationIntent({
    eventKey: `test:${randomUUID()}`,
    idempotencyKey: `test:${randomUUID()}`,
    eventType: "STALL_RESERVATION_EXPIRED",
    entityType: "ExhibitionExhibitor",
    entityId: participationId,
    payload: {},
  });
  await processOneIntent("worker-late-pref");
  const beforePrefChange = await getDeliveries(enqueued.id);
  assert.ok(beforePrefChange.every((d) => d.status === "PENDING"), "both channels start PENDING before any preference exists");

  // The recipient disables EMAIL only now, strictly after enqueue/fan-out.
  await prisma.$executeRaw`
    INSERT INTO notification_channel_preferences (user_id, event_type, channel, enabled)
    VALUES (${ownerUserId}, 'STALL_RESERVATION_EXPIRED', 'EMAIL', false)
  `;

  await processOneDelivery("worker-late-pref");
  await processOneDelivery("worker-late-pref");
  const afterDrain = await getDeliveries(enqueued.id);
  assert.equal(afterDrain.find((d) => d.channel === "EMAIL")!.status, "SUPPRESSED", "a preference change after enqueue must still be honored at delivery time");
  assert.equal(afterDrain.find((d) => d.channel === "IN_APP")!.status, "SENT", "the untouched channel must still deliver normally");
});

test("notification dispatcher: end-to-end — an expired reservation's notification is enqueued after the expiry transaction commits and is deliverable", async () => {
  const { organizerId, token: organizerToken, firstExhibitionId } = await bootstrapOrganizer(baseUrl, "phase31-e2e", ts + 6);
  organizerIds.push(organizerId);
  const stall = await createStall(baseUrl, organizerToken, firstExhibitionId, 16000);
  assert.equal(stall.status, 201);
  const stallId = stall.body.stall.id as string;

  const exhibitor = await applyAsExhibitor(baseUrl, firstExhibitionId, "phase31-e2e-x", ts + 6);
  await approveParticipation(baseUrl, organizerToken, firstExhibitionId, exhibitor.participationId);
  const select = await selectStall(baseUrl, exhibitor.token, exhibitor.participationId, stallId);
  assert.equal(select.status, 200);

  await backdateReservation(stallId);
  await releaseExpiredReservations(firstExhibitionId);

  const intentRows = await prisma.$queryRaw<Array<{ id: string; status: string }>>`
    SELECT id, status FROM notification_intents WHERE entity_id = ${exhibitor.participationId} AND event_type = 'STALL_RESERVATION_EXPIRED'
  `;
  assert.equal(intentRows.length, 1, "expiry must have enqueued exactly one intent for this participation");

  const tickResult = await runDispatcherTick("worker-e2e");
  assert.ok(tickResult.intentsProcessed >= 1);
  assert.ok(tickResult.deliveriesProcessed >= 1);

  const notification = await prisma.notification.findFirst({
    where: { userId: exhibitor.userId, type: "STALL_RESERVATION_EXPIRED", entityId: exhibitor.participationId },
  });
  assert.ok(notification, "the exhibitor who lost their reservation must have a real, queryable in-app notification about it");
});
