import assert from "node:assert/strict";
import { test } from "node:test";
import { canReplayRegistration } from "../src/lib/registrationIdempotency";

test("registration idempotency replay is limited to the same caller identity", () => {
  assert.equal(canReplayRegistration("user-a", "user-a"), true);
  assert.equal(canReplayRegistration("user-a", "user-b"), false);
  assert.equal(canReplayRegistration("user-a", null), false);
  assert.equal(canReplayRegistration(null, "user-a"), false);
  assert.equal(canReplayRegistration(null, null), true);
});
