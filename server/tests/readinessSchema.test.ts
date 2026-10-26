import assert from "node:assert/strict";
import { test } from "node:test";
import { getMissingReadinessSchemaChecks } from "../src/lib/readinessSchema";

test("readiness diagnostics identify every missing schema prerequisite", () => {
  assert.deepEqual(getMissingReadinessSchemaChecks({
    exhibitionHalls: 0,
    floorPlanHallId: 1,
    organizerOnboardingActivation: 0,
    plansTable: 1,
  }), {
    exhibitionHalls: true,
    floorPlanHallId: false,
    organizerOnboardingActivation: true,
    plansTable: false,
  });
});

test("readiness diagnostics mark all prerequisites present when schema is current", () => {
  assert.deepEqual(getMissingReadinessSchemaChecks({
    exhibitionHalls: 1,
    floorPlanHallId: 1,
    organizerOnboardingActivation: 1,
    plansTable: 1,
  }), {
    exhibitionHalls: false,
    floorPlanHallId: false,
    organizerOnboardingActivation: false,
    plansTable: false,
  });
});

test("unavailable schema-check data fails closed and reports all checks missing", () => {
  assert.deepEqual(getMissingReadinessSchemaChecks(undefined), {
    exhibitionHalls: true,
    floorPlanHallId: true,
    organizerOnboardingActivation: true,
    plansTable: true,
  });
});
