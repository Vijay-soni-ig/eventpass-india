import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ANALYTICS_MAX_DAYS,
  recommendationImpressionCutoff,
  recommendationHistoryIdentity,
  validatePersonalizationAnalyticsRange,
} from "../src/lib/personalizationGuards.js";

const now = new Date("2026-09-26T10:00:00.000Z");

test("allows analytics ranges within the configured retention window", () => {
  const from = new Date("2026-07-01T10:00:00.000Z");
  const to = new Date("2026-09-26T10:00:00.000Z");
  assert.equal(validatePersonalizationAnalyticsRange(from, to, now), null);
});

test("rejects analytics ranges longer than 90 days", () => {
  const from = new Date(now.getTime() - (ANALYTICS_MAX_DAYS + 1) * 24 * 60 * 60 * 1000);
  assert.equal(
    validatePersonalizationAnalyticsRange(from, now, now),
    "analytics range cannot exceed 90 days",
  );
});

test("rejects materially future analytics end dates", () => {
  const future = new Date(now.getTime() + 6 * 60 * 1000);
  assert.equal(
    validatePersonalizationAnalyticsRange(now, future, now),
    "to cannot be materially in the future",
  );
});

test("rejects inverted analytics ranges", () => {
  assert.equal(
    validatePersonalizationAnalyticsRange(now, new Date(now.getTime() - 1), now),
    "from must be before to",
  );
});

test("dedupe cutoff is exactly 24 hours before the reference time", () => {
  assert.equal(
    recommendationImpressionCutoff(now).toISOString(),
    "2026-09-25T10:00:00.000Z",
  );
});

test("authenticated recommendation history ignores caller-supplied session IDs", () => {
  assert.deepEqual(
    recommendationHistoryIdentity("authenticated-user", "another-session-id"),
    { userId: "authenticated-user" },
  );
});

test("anonymous recommendation history remains scoped to its supplied session ID", () => {
  assert.deepEqual(
    recommendationHistoryIdentity(undefined, "anonymous-session-id"),
    { sessionId: "anonymous-session-id" },
  );
});

test("recommendation history has no identity when neither user nor session is present", () => {
  assert.equal(recommendationHistoryIdentity(undefined, undefined), undefined);
});
