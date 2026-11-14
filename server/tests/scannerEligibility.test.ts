import assert from "node:assert/strict";
import { test } from "node:test";
import { canCheckInForExhibitionStatus } from "../src/lib/scannerEligibility";

test("live exhibitions allow ticket check-in", () => {
  assert.equal(canCheckInForExhibitionStatus("live"), true);
});

test("draft exhibitions reject ticket check-in", () => {
  assert.equal(canCheckInForExhibitionStatus("draft"), false);
});

test("paused exhibitions reject ticket check-in", () => {
  assert.equal(canCheckInForExhibitionStatus("paused"), false);
});

test("completed exhibitions reject ticket check-in", () => {
  assert.equal(canCheckInForExhibitionStatus("completed"), false);
});

test("unknown exhibition statuses fail closed", () => {
  assert.equal(canCheckInForExhibitionStatus("unexpected"), false);
});
