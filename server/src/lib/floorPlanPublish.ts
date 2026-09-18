import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

function assertBounds(x: number, y: number, width: number, height: number, canvasWidth: number, canvasHeight: number) {
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > canvasWidth || y + height > canvasHeight) {
    throw Object.assign(new Error("Floor plan object must remain within canvas bounds"), { status: 400 });
  }
}

/**
 * Publishes a draft floor plan, archiving whichever plan (if any) was
 * previously published for the exhibition — a legitimate, wanted outcome
 * when publish calls happen one after another (see
 * phase28_floorPlanRegressions.test.ts: "publishing a new draft archives the
 * previously-published plan").
 *
 * The bug this guards against is two publish calls racing: both see "no plan
 * published yet", so a lock alone (even SERIALIZABLE isolation) can't tell
 * the two cases apart — whichever transaction runs second still legitimately
 * archives-and-supersedes the other from its own point of view, silently
 * producing two successes instead of one success and one conflict (see
 * phase29_floorPlanPublishConcurrency.test.ts).
 *
 * Fixed with optimistic concurrency: snapshot which plan (if any) is
 * published *before* queuing behind any concurrent publisher, then serialize
 * with a blocking exhibition-scoped advisory lock, then re-read the same
 * snapshot. If it changed while we were waiting, some other request
 * published in the same window we started in — reject. If it's unchanged, no
 * one raced us (whether this is the very first publish, or one made well
 * after a prior publish already settled), so archive-and-publish is a
 * normal, intentional supersede.
 *
 * Exported as a plain function (rather than only reachable via the HTTP
 * route) so tests can call it directly with Promise.all to force genuine
 * concurrent execution — two fetch() calls fired via Promise.all do not
 * reliably overlap at the server (HTTP/connection-setup jitter routinely
 * lets one request's entire round trip finish before the other's handler
 * even starts), which made an HTTP-level version of the race test flaky.
 */
export async function publishFloorPlan(exhibitionId: string, floorPlanId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const before = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM "floor_plans" WHERE "exhibitionId" = ${exhibitionId} AND status = 'published' LIMIT 1
    `);
    const publishedBeforeId = before[0]?.id ?? null;

    await tx.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${`floor-plan-publish:${exhibitionId}`}, 0))
    `);

    const after = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM "floor_plans" WHERE "exhibitionId" = ${exhibitionId} AND status = 'published' LIMIT 1
    `);
    const publishedAfterId = after[0]?.id ?? null;
    if (publishedAfterId !== publishedBeforeId) {
      throw Object.assign(new Error("Another floor plan was published concurrently. Please refresh and try again."), { status: 409 });
    }

    const plan = await tx.$queryRaw<Array<{ id: string; status: string; canvasWidth: number; canvasHeight: number }>>(Prisma.sql`
      SELECT id, status, "canvasWidth", "canvasHeight" FROM "floor_plans"
      WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId} FOR UPDATE
    `);
    if (plan.length === 0) throw Object.assign(new Error("Floor plan not found"), { status: 404 });
    if (plan[0].status !== "draft") throw Object.assign(new Error("Only draft floor plans can be published"), { status: 409 });
    const objects = await tx.$queryRaw<Array<{ id: string; stallId: string; x: number; y: number; width: number; height: number }>>(Prisma.sql`
      SELECT id, "stallId", x, y, width, height FROM "floor_plan_objects" WHERE "floorPlanId" = ${floorPlanId}
    `);
    if (objects.length === 0) throw Object.assign(new Error("At least one stall must be mapped before publishing"), { status: 400 });
    const stallIds = objects.map((object) => object.stallId);
    const stalls = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM "stalls" WHERE "exhibitionId" = ${exhibitionId} AND id IN (${Prisma.join(stallIds)})
    `);
    if (stalls.length !== stallIds.length) throw Object.assign(new Error("One or more floor plan objects reference a stall outside this exhibition"), { status: 400 });
    for (const object of objects) assertBounds(Number(object.x), Number(object.y), Number(object.width), Number(object.height), Number(plan[0].canvasWidth), Number(plan[0].canvasHeight));

    await tx.$executeRaw(Prisma.sql`
      UPDATE "floor_plans" SET status = 'archived', "updatedAt" = CURRENT_TIMESTAMP
      WHERE "exhibitionId" = ${exhibitionId} AND status = 'published' AND id <> ${floorPlanId}
    `);
    await tx.$executeRaw(Prisma.sql`
      UPDATE "floor_plans" SET status = 'published', "publishedAt" = CURRENT_TIMESTAMP, version = version + 1, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ${floorPlanId} AND "exhibitionId" = ${exhibitionId}
    `);
  });
}
