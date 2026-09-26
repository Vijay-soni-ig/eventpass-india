import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

const interactionSchema = z.object({
  eventId: z.string().uuid().optional(),
  type: z.enum([
    "VIEW",
    "CLICK",
    "SAVE",
    "REGISTER",
    "PURCHASE",
    "CHECK_IN",
    "SEARCH",
    "RECOMMENDATION_IMPRESSION",
    "RECOMMENDATION_DISMISS",
    "RECOMMENDATION_NOT_INTERESTED",
  ]),
  sessionId: z.string().trim().min(8).max(128).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).superRefine((value, ctx) => {
  if (!value.sessionId && !value.eventId) {
    ctx.addIssue({ code: "custom", message: "eventId or sessionId is required" });
  }
});

test("recommendation feedback types are accepted only with recommendation metadata", () => {
  const parsed = interactionSchema.safeParse({
    eventId: "00000000-0000-4000-8000-000000000001",
    type: "RECOMMENDATION_NOT_INTERESTED",
    sessionId: "phase4-session",
    metadata: { source: "recommendation", position: 2 },
  });

  assert.equal(parsed.success, true);
});

test("recommendation feedback is invalid without an event id", () => {
  const parsed = interactionSchema.safeParse({
    type: "RECOMMENDATION_DISMISS",
    sessionId: "phase4-session",
    metadata: { source: "recommendation" },
  });

  assert.equal(parsed.success, false);
});

test("feedback suppression distinguishes dismiss and not-interested events", () => {
  const history = [
    { eventId: "event-1", type: "RECOMMENDATION_DISMISS" },
    { eventId: "event-2", type: "RECOMMENDATION_NOT_INTERESTED" },
    { eventId: "event-3", type: "VIEW" },
  ];

  const negativeEventIds = new Set(
    history
      .filter((item) => item.type === "RECOMMENDATION_DISMISS" || item.type === "RECOMMENDATION_NOT_INTERESTED")
      .map((item) => item.eventId),
  );

  assert.deepEqual([...negativeEventIds].sort(), ["event-1", "event-2"]);
  assert.equal(negativeEventIds.has("event-3"), false);
});
