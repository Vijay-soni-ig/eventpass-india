// Removes the floor plans a previous run of e2e/floor-plan.spec.ts created, so the
// spec starts from a known state and can be re-run against the same database.
// Only plans whose name starts with "E2E " are touched; real plans are never deleted.
// Objects and elements go with their plan (ON DELETE CASCADE).
const { PrismaClient } = require("../server/node_modules/@prisma/client");

async function resetE2eFloorPlans(exhibitionId) {
  const prisma = new PrismaClient();
  try {
    const result = await prisma.floorPlan.deleteMany({ where: { exhibitionId, name: { startsWith: "E2E " } } });
    return result.count;
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = { resetE2eFloorPlans };
