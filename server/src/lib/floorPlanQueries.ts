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

export type PublishedFloorPlanElement = {
  id: string;
  type: string;
  label: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
};

export type PublishedFloorPlanResult = {
  id: string;
  /** The hall this plan belongs to. */
  hall: { id: string; name: string };
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  backgroundUrl: string | null;
  publishedAt: Date | null;
  objects: PublishedFloorPlanObject[];
  elements: PublishedFloorPlanElement[];
};

type PublishedPlanRow = {
  id: string;
  name: string;
  canvasWidth: Prisma.Decimal;
  canvasHeight: Prisma.Decimal;
  backgroundUrl: string | null;
  publishedAt: Date | null;
  hallId: string;
  hallName: string;
};

async function loadPublishedPlan(plan: PublishedPlanRow): Promise<PublishedFloorPlanResult> {

  const objects = await prisma.$queryRaw<
    Array<{ id: string; stallId: string; x: Prisma.Decimal; y: Prisma.Decimal; width: Prisma.Decimal; height: Prisma.Decimal; rotation: Prisma.Decimal; zIndex: number; labelVisible: boolean }>
  >(Prisma.sql`
    SELECT id, "stallId", x, y, width, height, rotation, "zIndex", "labelVisible"
    FROM "floor_plan_objects"
    WHERE "floorPlanId" = ${plan.id}
    ORDER BY "zIndex" ASC, "createdAt" ASC
  `);

  const elements = await prisma.$queryRaw<
    Array<{ id: string; type: string; label: string | null; x: Prisma.Decimal; y: Prisma.Decimal; width: Prisma.Decimal; height: Prisma.Decimal; rotation: Prisma.Decimal; zIndex: number }>
  >(Prisma.sql`
    SELECT id, type::text AS type, label, x, y, width, height, rotation, "zIndex"
    FROM "floor_plan_elements"
    WHERE "floorPlanId" = ${plan.id}
    ORDER BY "zIndex" ASC, "createdAt" ASC, id ASC
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
    hall: { id: plan.hallId, name: plan.hallName },
    name: plan.name,
    canvasWidth: Number(plan.canvasWidth),
    canvasHeight: Number(plan.canvasHeight),
    backgroundUrl: plan.backgroundUrl,
    publishedAt: plan.publishedAt,
    elements: elements.map((element) => ({
      id: element.id,
      type: element.type,
      label: element.label,
      x: Number(element.x),
      y: Number(element.y),
      width: Number(element.width),
      height: Number(element.height),
      rotation: Number(element.rotation),
      zIndex: element.zIndex,
    })),
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

/**
 * Every hall's published plan for an exhibition, in hall order (a hall without a
 * published plan is simply absent). Same authorization contract as before: callers
 * decide whether the caller may see this exhibition at all.
 */
export async function getPublishedFloorPlans(exhibitionId: string): Promise<PublishedFloorPlanResult[]> {
  const plans = await prisma.$queryRaw<PublishedPlanRow[]>(Prisma.sql`
    SELECT p.id, p.name, p."canvasWidth", p."canvasHeight", p."backgroundUrl", p."publishedAt",
           h.id AS "hallId", h.name AS "hallName"
    FROM "floor_plans" p
    JOIN "exhibition_halls" h ON h.id = p."hallId"
    WHERE p."exhibitionId" = ${exhibitionId} AND p.status = 'published'
    ORDER BY h."sortOrder" ASC, h."createdAt" ASC, h.id ASC
  `);
  return Promise.all(plans.map(loadPublishedPlan));
}

/** The first hall's published plan (kept for callers that predate halls). */
export async function getPublishedFloorPlan(exhibitionId: string): Promise<PublishedFloorPlanResult | null> {
  const plans = await getPublishedFloorPlans(exhibitionId);
  return plans[0] ?? null;
}
