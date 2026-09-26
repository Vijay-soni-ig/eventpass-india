import test from "node:test";
import assert from "node:assert/strict";
import { validateDashboardLayout, validateDashboardName, validateDashboardOwner } from "../src/lib/dashboardStoragePolicy";

test("dashboard layout stays within the 12-column grid", () => {
  assert.doesNotThrow(() => validateDashboardLayout({ x: 9, y: 0, width: 3, height: 4 }));
  assert.throws(() => validateDashboardLayout({ x: 10, y: 0, width: 3, height: 4 }));
  assert.throws(() => validateDashboardLayout({ x: 0, y: 0, width: 13, height: 4 }));
  assert.throws(() => validateDashboardLayout({ x: 0, y: 0, width: 3, height: 21 }));
});

test("dashboard names and owners follow storage invariants", () => {
  assert.doesNotThrow(() => validateDashboardName("Organizer overview"));
  assert.throws(() => validateDashboardName("   "));
  assert.doesNotThrow(() => validateDashboardOwner("PLATFORM", null));
  assert.doesNotThrow(() => validateDashboardOwner("ORGANIZER", "org-1"));
  assert.throws(() => validateDashboardOwner("PLATFORM", "user-1"));
  assert.throws(() => validateDashboardOwner("EXHIBITOR", null));
});
