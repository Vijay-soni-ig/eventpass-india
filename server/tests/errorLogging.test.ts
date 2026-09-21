import test from "node:test";
import assert from "node:assert/strict";
import { buildErrorLog } from "../src/lib/errorLogging";

const context = {
  requestId: "req-123",
  method: "POST",
  path: "/api/payments/verify",
  status: 500,
  errorName: "Error",
  errorMessage: "upstream secret=do-not-log customer@example.com",
  stack: "Error: upstream secret=do-not-log\n    at payment.ts:10:5",
};

test("production error logs exclude arbitrary error details", () => {
  const log = buildErrorLog(context, true);

  assert.deepEqual(log, {
    event: "http_request_error",
    requestId: "req-123",
    method: "POST",
    path: "/api/payments/verify",
    status: 500,
    errorName: "Error",
  });
  assert.equal("errorMessage" in log, false);
  assert.equal("stack" in log, false);
});

test("non-production error logs retain diagnostic details", () => {
  const log = buildErrorLog(context, false);

  assert.equal(log.errorMessage, context.errorMessage);
  assert.equal(log.stack, context.stack);
});
