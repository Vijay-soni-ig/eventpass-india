import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveActiveBusinessSelection } from "../src/lib/exhibitorBusinessSelection";

test("a single business remains the implicit active business for compatibility", () => {
  assert.deepEqual(resolveActiveBusinessSelection(["business-1"]), { businessId: "business-1" });
});

test("no memberships resolve to no active business", () => {
  assert.deepEqual(resolveActiveBusinessSelection([]), { businessId: null });
});

test("multiple businesses require an explicit selection", () => {
  assert.deepEqual(resolveActiveBusinessSelection(["business-1", "business-2"]), {
    status: 400,
    error: "Select an active exhibitor business",
  });
});

test("a valid selected business is returned", () => {
  assert.deepEqual(resolveActiveBusinessSelection(["business-1", "business-2"], "business-2"), {
    businessId: "business-2",
  });
});

test("a business outside the caller's memberships is rejected", () => {
  assert.deepEqual(resolveActiveBusinessSelection(["business-1"], "business-2"), {
    status: 404,
    error: "Exhibitor business not found",
  });
});
