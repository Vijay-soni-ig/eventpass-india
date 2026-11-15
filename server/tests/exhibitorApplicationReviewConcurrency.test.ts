import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, applyAsExhibitor, cleanupOrganizers } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const organizerIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

test("concurrent approval and rejection can transition an exhibitor application only once", async () => {
  const { organizerId, token, firstExhibitionId } = await bootstrapOrganizer(
    baseUrl,
    "application-review-race",
    Date.now(),
  );
  organizerIds.push(organizerId);

  const exhibitor = await applyAsExhibitor(
    baseUrl,
    firstExhibitionId,
    "application-review-race-exhibitor",
    Date.now(),
  );

  // Force both requests past their preflight read before either transaction
  // starts. Without a row lock + in-transaction status revalidation, both
  // requests can observe "applied" and overwrite each other's decision.
  const prismaClient = prisma as unknown as { $transaction: typeof prisma.$transaction };
  const originalTransaction = prismaClient.$transaction;
  let arrivals = 0;
  let releaseGate!: () => void;
  const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
  prismaClient.$transaction = (async (...args: unknown[]) => {
    arrivals += 1;
    if (arrivals === 2) releaseGate();
    await gate;
    return (originalTransaction as (...inner: unknown[]) => Promise<unknown>).apply(prisma, args);
  }) as typeof prismaClient.$transaction;

  let approveResponse: Response;
  let rejectResponse: Response;
  try {
    [approveResponse, rejectResponse] = await Promise.all([
      fetch(`${baseUrl}/api/exhibitions/${firstExhibitionId}/exhibitors/${exhibitor.participationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: "approved" }),
      }),
      fetch(`${baseUrl}/api/exhibitions/${firstExhibitionId}/exhibitors/${exhibitor.participationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: "rejected" }),
      }),
    ]);
  } finally {
    prismaClient.$transaction = originalTransaction;
  }

  const statuses = [approveResponse!.status, rejectResponse!.status].sort((a, b) => a - b);
  assert.deepEqual(statuses, [200, 409], "exactly one review decision must win; the competing decision must conflict");

  const finalParticipation = await prisma.exhibitionExhibitor.findUniqueOrThrow({
    where: { id: exhibitor.participationId },
    select: { status: true },
  });
  const successfulDecision = approveResponse!.status === 200 ? "approved" : "rejected";
  assert.equal(finalParticipation.status, successfulDecision, "the stored status must match the one successful review response");
});
