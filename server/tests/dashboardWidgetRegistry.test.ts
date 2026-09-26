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

test("dashboard widgets expose valid persona and capability contracts", () => {
  for (const widget of Object.values(DASHBOARD_WIDGETS)) {
    const expectedRole = widget.scope === "ORGANIZER" || widget.scope === "EVENT" ? "ORGANIZER" : "EXHIBITOR";
    assert.ok(widget.roles.includes(expectedRole));
    assert.ok(widget.requiredPermissions.length > 0);
    if (widget.requiredModule) {
      assert.ok([
        "EXHIBITION", "REGISTRATION", "TICKETING", "EXHIBITORS", "STALL_BOOKING",
        "FLOOR_PLAN", "CHECK_IN", "LEADS", "SPEAKERS", "SESSIONS", "SPONSORS",
        "PARTNERS", "VENDORS", "VOLUNTEERS", "SEATING", "PARTICIPANTS", "ANALYTICS",
      ].includes(widget.requiredModule));
    }
  }
});

test("dashboard widgets do not expose platform widgets before platform data resolution exists", () => {
  assert.equal(listDashboardWidgets("PLATFORM").length, 0);
});
