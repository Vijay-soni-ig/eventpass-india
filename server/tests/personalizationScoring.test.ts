import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decayedInteractionWeight,
  diversifyRecommendations,
  scoreRecommendation,
} from "../src/lib/personalizationScoring";

const now = new Date("2026-09-26T10:00:00.000Z");

const profile = {
  categoryWeights: new Map([["jewellery", 20]]),
  cityWeights: new Map([["ahmedabad", 10]]),
  organizerWeights: new Map([["org-1", 5]]),
};

const candidate = (id: string, categoryId: string, organizerId: string, startDate = "2026-09-27T10:00:00.000Z") => ({
  id,
  categoryId,
  city: "Ahmedabad",
  organizerId,
  startDate: new Date(startDate),
});

test("interaction affinity decays by half over the configured half-life", () => {
  const fresh = decayedInteractionWeight(10, now, now);
  const aged = decayedInteractionWeight(10, new Date("2026-08-27T10:00:00.000Z"), now);

  assert.equal(fresh, 10);
  assert.ok(Math.abs(aged - 5) < 0.01);
});

test("recommendation scoring combines affinity, city, popularity and freshness", () => {
  const result = scoreRecommendation(
    candidate("event-1", "jewellery", "org-1"),
    profile,
    { eventInteractions: 20, categoryInteractions: 0, cityInteractions: 0 },
    now,
    "Ahmedabad",
  );

  assert.ok(result.score > 50);
  assert.ok(result.reasonCodes.includes("CATEGORY_AFFINITY"));
  assert.ok(result.reasonCodes.includes("CITY_AFFINITY"));
  assert.ok(result.reasonCodes.includes("ORGANIZER_AFFINITY"));
  assert.ok(result.reasonCodes.includes("POPULAR_NEARBY"));
  assert.ok(result.reasonCodes.includes("UPCOMING_SOON"));
});

test("popularity contribution is bounded", () => {
  const low = scoreRecommendation(
    candidate("event-low", "other", "org-2"),
    profile,
    { eventInteractions: 1, categoryInteractions: 0, cityInteractions: 0 },
    now,
  );
  const huge = scoreRecommendation(
    candidate("event-huge", "other", "org-2"),
    profile,
    { eventInteractions: 1_000_000, categoryInteractions: 0, cityInteractions: 0 },
    now,
  );

  assert.ok(huge.score - low.score <= 8);
});

test("diversification prevents one category and organizer from dominating the rail", () => {
  const scored = [
    candidate("a", "jewellery", "org-1"),
    candidate("b", "jewellery", "org-1"),
    candidate("c", "fashion", "org-2"),
    candidate("d", "electronics", "org-3"),
  ].map((event) => ({
    event,
    score: event.id === "a" ? 100 : event.id === "b" ? 99 : event.id === "c" ? 98 : 97,
    reasonCodes: [] as never[],
  }));

  const selected = diversifyRecommendations(scored, 4);

  assert.deepEqual(selected.map((item) => item.event.id), ["a", "c", "d", "b"]);
  assert.ok(selected.slice(1).every((item) => item.reasonCodes.includes("DIVERSE_DISCOVERY")));
});
