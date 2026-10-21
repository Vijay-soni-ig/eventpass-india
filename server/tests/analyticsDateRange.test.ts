import assert from "node:assert/strict";
import { test } from "node:test";
import { dateRangeEnd } from "../src/lib/validation";

test("date-only analytics end filters include the entire UTC calendar day", () => {
  assert.equal(dateRangeEnd("2026-10-21")?.toISOString(), "2026-10-21T23:59:59.999Z");
});

test("timestamp analytics end filters preserve the supplied instant", () => {
  assert.equal(dateRangeEnd("2026-10-21T14:30:00.000Z")?.toISOString(), "2026-10-21T14:30:00.000Z");
});

test("missing analytics end filters remain undefined", () => {
  assert.equal(dateRangeEnd(undefined), undefined);
});
