import assert from "node:assert/strict";
import { test } from "node:test";
import { EventModule as PrismaEventModule } from "@prisma/client";
import {
  EVENT_MODULE_VALUES,
  MODULE_CONFIG_SCHEMAS,
  validateModuleConfig,
} from "../src/lib/eventModules";

test("application EventModule registry stays in sync with the Prisma enum", () => {
  const prismaValues = Object.values(PrismaEventModule).sort();
  assert.deepEqual([...EVENT_MODULE_VALUES].sort(), prismaValues);
  assert.deepEqual(Object.keys(MODULE_CONFIG_SCHEMAS).sort(), prismaValues);
});

test("every registered Event module config fails closed on unknown fields", () => {
  for (const moduleType of EVENT_MODULE_VALUES) {
    assert.equal(
      validateModuleConfig(moduleType, {}).success,
      true,
      `${moduleType} should accept the empty configuration contract`,
    );
    assert.equal(
      validateModuleConfig(moduleType, { unexpected: true }).success,
      false,
      `${moduleType} must reject unrecognized configuration fields`,
    );
  }
});
