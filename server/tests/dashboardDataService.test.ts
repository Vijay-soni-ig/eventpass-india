import assert from "node:assert/strict";
import { test } from "node:test";
import { DashboardDataError, parseDashboardFilters } from "../src/lib/dashboardDataService";

test("dashboard filters default to a bounded 30-day range", () => {
  const now = new Date("2026-09-27T00:00:00.000Z");
  const filters = parseDashboardFilters({}, now);
  assert.equal(filters.to.toISOString(), "2026-09-27T00:00:00.000Z");
  assert.equal(filters.from.toISOString(), "2026-08-29T00:00:00.000Z");
});

test("dashboard filters accept scoped UUID filters", () => {
  const filters = parseDashboardFilters({
    from: "2026-09-01T00:00:00.000Z",
    to: "2026-09-27T00:00:00.000Z",
    eventId: "123e4567-e89b-12d3-a456-426614174000",
    ticketTypeId: "123e4567-e89b-12d3-a456-426614174001",
  });
  assert.equal(filters.eventId, "123e4567-e89b-12d3-a456-426614174000");
  assert.equal(filters.ticketTypeId, "123e4567-e89b-12d3-a456-426614174001");
});

test("dashboard filters reject invalid and oversized ranges", () => {
  assert.throws(() => parseDashboardFilters({ from: "2026-09-27", to: "2026-09-01" }), DashboardDataError);
  assert.throws(() => parseDashboardFilters({ eventId: "not-a-uuid" }), DashboardDataError);
  assert.throws(() => parseDashboardFilters({ from: "2025-01-01", to: "2026-09-27" }), DashboardDataError);
});
