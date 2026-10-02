// Removes what a previous run of e2e/floor-plan.spec.ts created, so the spec starts
// from a known state and can be re-run against the same database. Only things the
// spec itself named are touched; real plans, halls and stalls are never deleted:
//   - floor plans named "E2E ..."   (objects and elements go with them, ON DELETE CASCADE)
//   - halls named "E2E ..."         (and their plans)
//   - stalls whose code starts with "E2E-"
const { PrismaClient } = require("../server/node_modules/@prisma/client");

async function resetE2eFloorPlans(exhibitionId) {
  const prisma = new PrismaClient();
  try {
    const plans = await prisma.floorPlan.deleteMany({ where: { exhibitionId, name: { startsWith: "E2E " } } });
    const halls = await prisma.exhibitionHall.deleteMany({ where: { exhibitionId, name: { startsWith: "E2E " } } });
    const stalls = await prisma.stall.deleteMany({ where: { exhibitionId, code: { startsWith: "E2E-" } } });
    return plans.count + halls.count + stalls.count;
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = { resetE2eFloorPlans };
