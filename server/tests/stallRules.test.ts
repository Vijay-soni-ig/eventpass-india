import assert from "node:assert/strict";
import { test } from "node:test";
import { isDuplicateStallCode, normalizeStallCode, stallDeleteBlock, stallEditBlock } from "../src/lib/stallRules";

const free = { status: "available" as const, bookingCount: 0, hasExhibitor: false };

test("normalizeStallCode trims and turns blank into undefined", () => {
  assert.equal(normalizeStallCode("  A-01 "), "A-01");
  assert.equal(normalizeStallCode("   "), undefined);
  assert.equal(normalizeStallCode(undefined), undefined);
  assert.equal(normalizeStallCode(null), undefined);
});

test("isDuplicateStallCode is case-insensitive, trim-insensitive and ignores null codes", () => {
  assert.equal(isDuplicateStallCode(["A-01", null, "B-02"], " a-01 "), true);
  assert.equal(isDuplicateStallCode(["A-01", null], "A-02"), false);
  assert.equal(isDuplicateStallCode([null, null], "A-01"), false);
});

test("a free, never-booked stall on no published plan can be deleted", () => {
  assert.equal(stallDeleteBlock({ ...free, inPublishedFloorPlan: false }), null);
});

test("stall with booking history can never be deleted, even if it looks available again", () => {
  assert.match(stallDeleteBlock({ ...free, bookingCount: 1, inPublishedFloorPlan: false }) ?? "", /booking records/);
});

test("reserved, sold or exhibitor-assigned stalls cannot be deleted", () => {
  for (const status of ["reserved", "sold"] as const) {
    assert.ok(stallDeleteBlock({ ...free, status, inPublishedFloorPlan: false }));
  }
  assert.ok(stallDeleteBlock({ ...free, hasExhibitor: true, inPublishedFloorPlan: false }));
});

test("stall on a published floor plan cannot be deleted", () => {
  assert.match(stallDeleteBlock({ ...free, inPublishedFloorPlan: true }) ?? "", /published floor plan/);
});

test("commercial fields are editable only on a free, never-booked stall", () => {
  assert.equal(stallEditBlock(free, ["price"]), null);
  assert.equal(stallEditBlock(free, ["code", "stallType", "size", "price"]), null);
  assert.ok(stallEditBlock({ ...free, status: "reserved" }, ["price"]));
  assert.ok(stallEditBlock({ ...free, status: "sold" }, ["code"]));
  assert.ok(stallEditBlock({ ...free, bookingCount: 2 }, ["size"]));
  assert.ok(stallEditBlock({ ...free, hasExhibitor: true }, ["stallType"]));
});

test("floor-plan geometry stays editable on any stall", () => {
  assert.equal(stallEditBlock({ status: "sold", bookingCount: 3, hasExhibitor: true }, ["posX", "posY", "width", "height"]), null);
});
