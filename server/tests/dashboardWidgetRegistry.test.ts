import test from "node:test";
import assert from "node:assert/strict";
import { DASHBOARD_WIDGETS, getDashboardWidget, listDashboardWidgets, validateDashboardWidgetRegistry } from "../src/lib/dashboardWidgetRegistry";

test("dashboard widget registry validates", () => {
  assert.doesNotThrow(() => validateDashboardWidgetRegistry());
  assert.equal(Object.keys(DASHBOARD_WIDGETS).length, 13);
});

test("widget lookup returns typed definition", () => {
  const widget = getDashboardWidget("EVENT_TICKET_REVENUE_TREND");
  assert.equal(widget?.visualization, "TREND");
  assert.deepEqual(widget?.metricIds, ["EVENT_TICKET_REVENUE_GROSS", "EVENT_TICKET_REVENUE_REFUNDED", "EVENT_TICKET_REVENUE_NET"]);
});

test("scope filtering returns only requested widgets", () => {
  assert.ok(listDashboardWidgets("ORGANIZER").every((widget) => widget.scope === "ORGANIZER"));
  assert.ok(listDashboardWidgets("EVENT").every((widget) => widget.scope === "EVENT"));
  assert.ok(listDashboardWidgets("EXHIBITOR").every((widget) => widget.scope === "EXHIBITOR"));
});
