import assert from "node:assert/strict";
import test from "node:test";
import {
  DASHBOARD_METRICS,
  getDashboardMetric,
  listDashboardMetrics,
  validateDashboardMetricRegistry,
} from "../src/lib/dashboardMetricRegistry";

test("dashboard metric registry is internally valid", () => {
  assert.doesNotThrow(() => validateDashboardMetricRegistry());
  assert.equal(Object.keys(DASHBOARD_METRICS).length, 26);
});

test("metric lookup returns only registered definitions", () => {
  assert.equal(getDashboardMetric("ORGANIZER_REVENUE_GROSS")?.unit, "CURRENCY");
  assert.equal(getDashboardMetric("DOES_NOT_EXIST"), undefined);
});

test("percentage metrics define numerator and denominator", () => {
  for (const metric of Object.values(DASHBOARD_METRICS)) {
    if (metric.unit === "PERCENT") {
      assert.ok(metric.numerator);
      assert.ok(metric.denominator);
    }
  }
});

test("scope filtering only returns metrics for requested persona", () => {
  assert.ok(listDashboardMetrics("ORGANIZER").every((metric) => metric.scope === "ORGANIZER"));
  assert.ok(listDashboardMetrics("EVENT").every((metric) => metric.scope === "EVENT"));
  assert.ok(listDashboardMetrics("EXHIBITOR").every((metric) => metric.scope === "EXHIBITOR"));
});
