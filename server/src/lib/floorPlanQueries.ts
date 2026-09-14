import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

// Phase 29 (FP-04) — shared "get published floor plan" query, extracted out
// of server/src/routes/public.ts's GET /exhibitions/:id/floor-plan so the
// authenticated exhibitor-side GET /:id/floor-plan in
// exhibitorParticipations.ts can read the exact same published floor plan
// without re-implementing (and risking drift from) this raw-SQL shape.
//
// `floor_plans`/`floor_plan_objects` are managed via raw SQL (see
// floorPlanLayout.ts) because their Prisma client models aren't wired up for
// app-level use yet. Their columns are already declared as quoted camelCase
// identifiers in the FP-02 migration (e.g. "canvasWidth", "publishedAt"), so
// no snake_case-vs-camelCase aliasing mismatch exists here; DECIMAL columns
// are still explicitly Number()-converted below since $queryRaw returns them
// as Prisma.Decimal, never left as-is or restated as a mismatched TS type.
// Only the public-safe stall fields are ever attached to an object — never
// buyerName/buyerEmail.
//
// This function performs NO exhibition-level authorization/visibility check
// of its own — callers (the public route, the exhibitor route) are
// responsible for verifying the caller may see this exhibitionId's floor
// plan before calling this, since the right check differs per caller (public
// visibility rules vs. an exhibitor's own participation ownership).
export type PublishedFloorPlanStall = {
  id: string;
  code: string | null;
  stallType: string | null;
  price: number;
  status: string;
};

export type PublishedFloorPlanObject = {
  id: string;
  stallId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  labelVisible: boolean;
  stall: PublishedFloorPlanStall | null;
};

export type PublishedFloorPlanResult = {
  id: string;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  backgroundUrl: string | null;
  publishedAt: Date | null;
  objects: PublishedFloorPlanObject[];
};

export async function getPublishedFloorPlan(exhibitionId: string): Promise<PublishedFloorPlanResult | null> {
  const plans = await prisma.$queryRaw<
    Array<{ id: string; name: string; canvasWidth: Prisma.Decimal; canvasHeight: Prisma.Decimal; backgroundUrl: string | null; publishedAt: Date | null }>
  >(Prisma.sql`
    SELECT id, name, "canvasWidth", "canvasHeight", "backgroundUrl", "publishedAt"
    FROM "floor_plans"
    WHERE "exhibitionId" = ${exhibitionId} AND status = 'published'
    ORDER BY "publishedAt" DESC
    LIMIT 1
  `);
  if (plans.length === 0) return null;
  const plan = plans[0];

  const objects = await prisma.$queryRaw<
    Array<{ id: string; stallId: string; x: Prisma.Decimal; y: Prisma.Decimal; width: Prisma.Decimal; height: Prisma.Decimal; rotation: Prisma.Decimal; zIndex: number; labelVisible: boolean }>
  >(Prisma.sql`
    SELECT id, "stallId", x, y, width, height, rotation, "zIndex", "labelVisible"
    FROM "floor_plan_objects"
    WHERE "floorPlanId" = ${plan.id}
    ORDER BY "zIndex" ASC, "createdAt" ASC
  `);

  const stallIds = objects.map((object) => object.stallId);
  const stalls = stallIds.length
    ? await prisma.$queryRaw<Array<{ id: string; code: string | null; stallType: string | null; price: Prisma.Decimal; status: string }>>(Prisma.sql`
        SELECT id, code, "stallType", price, status FROM "stalls" WHERE id IN (${Prisma.join(stallIds)})
      `)
    : [];
  const stallsById = new Map(stalls.map((stall) => [stall.id, stall]));

  return {
    id: plan.id,
    name: plan.name,
    canvasWidth: Number(plan.canvasWidth),
    canvasHeight: Number(plan.canvasHeight),
    backgroundUrl: plan.backgroundUrl,
    publishedAt: plan.publishedAt,
    objects: objects.map((object) => {
      const stall = stallsById.get(object.stallId);
      return {
        id: object.id,
        stallId: object.stallId,
        x: Number(object.x),
        y: Number(object.y),
        width: Number(object.width),
        height: Number(object.height),
        rotation: Number(object.rotation),
        zIndex: object.zIndex,
        labelVisible: object.labelVisible,
        stall: stall ? { id: stall.id, code: stall.code, stallType: stall.stallType, price: Number(stall.price), status: stall.status } : null,
      };
    }),
  };
}
