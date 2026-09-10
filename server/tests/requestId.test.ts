import assert from "node:assert/strict";
import test from "node:test";
import { createRequestId } from "../src/lib/requestId";

test("request IDs are UUID-shaped and unique", () => {
  const first = createRequestId();
  const second = createRequestId();

  assert.notEqual(first, second);
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.match(second, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});
