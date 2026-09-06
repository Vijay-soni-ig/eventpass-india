import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";

after(async () => {
  await prisma.$disconnect();
});

// Plan #1 — required plans exist, with the exact limits from
// docs/PHASE_20A_COMMERCIAL_MODEL_REPORT.md Section 7-8.
test("Starter, Growth, and Enterprise plans exist, are active, and have the specified limits", async () => {
  const starter = await prisma.plan.findUnique({ where: { id: "plan-starter" } });
  assert.ok(starter, "plan-starter must exist");
  assert.equal(starter!.active, true);
  assert.equal(Number(starter!.price), 14999);
  assert.equal(starter!.eventLimit, 1);
  assert.equal(starter!.visitorLimit, 1000);
  assert.equal(starter!.exhibitorLimit, 25);
  assert.equal(starter!.stallLimit, 25);
  assert.equal(starter!.teamMemberLimit, 3);

  const growth = await prisma.plan.findUnique({ where: { id: "plan-growth" } });
  assert.ok(growth, "plan-growth must exist");
  assert.equal(growth!.active, true);
  assert.equal(Number(growth!.price), 24999);
  assert.equal(growth!.eventLimit, 5);
  assert.equal(growth!.visitorLimit, 10000);
  assert.equal(growth!.exhibitorLimit, 150);
  assert.equal(growth!.stallLimit, 150);
  assert.equal(growth!.teamMemberLimit, 10);

  const enterprise = await prisma.plan.findUnique({ where: { id: "plan-enterprise" } });
  assert.ok(enterprise, "plan-enterprise must exist");
  assert.equal(enterprise!.active, true);
  // Nullable limit fields = unlimited, per this schema's own established
  // convention (see Plan's doc comment in schema.prisma) — not an invented
  // large number.
  assert.equal(enterprise!.eventLimit, null);
  assert.equal(enterprise!.visitorLimit, null);
  assert.equal(enterprise!.exhibitorLimit, null);
  assert.equal(enterprise!.stallLimit, null);
  assert.equal(enterprise!.teamMemberLimit, null);
});

// Plan #2 — the pre-existing placeholder must never be mistaken for a real offer.
test("plan-custom-unconfigured remains an inactive FK placeholder, not a real commercial plan", async () => {
  const placeholder = await prisma.plan.findUnique({ where: { id: "plan-custom-unconfigured" } });
  assert.ok(placeholder, "the Phase 19A placeholder plan must still exist, untouched");
  assert.equal(placeholder!.active, false, "the placeholder must remain inactive so it is never assignable as a real plan");
  assert.equal(Number(placeholder!.price), 0);

  // Only the three real plans should ever be active.
  const activePlans = await prisma.plan.findMany({ where: { active: true }, select: { id: true } });
  const activeIds = activePlans.map((p) => p.id).sort();
  assert.deepEqual(activeIds, ["plan-enterprise", "plan-growth", "plan-starter"]);
});

// Plan #3 — the feature contract (Phase 20B Section 2): all three real
// plans expose the same core feature set, differentiated only by volume
// limits and support level.
test("all three real plans share the same core feature contract", async () => {
  const [starter, growth, enterprise] = await Promise.all([
    prisma.plan.findUniqueOrThrow({ where: { id: "plan-starter" } }),
    prisma.plan.findUniqueOrThrow({ where: { id: "plan-growth" } }),
    prisma.plan.findUniqueOrThrow({ where: { id: "plan-enterprise" } }),
  ]);

  const coreFeatures = [
    "exhibition_management", "stall_management", "ticket_management", "exhibitor_management",
    "visitor_registration", "qr_checkin", "lead_management", "analytics", "documents",
    "team_management", "refunds", "payments",
  ];

  for (const plan of [starter, growth, enterprise]) {
    const features = plan.features as Record<string, unknown>;
    for (const key of coreFeatures) {
      assert.equal(features[key], true, `${plan.code} must have "${key}": true — core functionality stays free/equal at every tier`);
    }
  }

  // Support level is the one dimension that legitimately differs.
  assert.equal((starter.features as Record<string, unknown>).supportLevel, "community");
  assert.equal((growth.features as Record<string, unknown>).supportLevel, "priority");
  assert.equal((enterprise.features as Record<string, unknown>).supportLevel, "dedicated");
});
