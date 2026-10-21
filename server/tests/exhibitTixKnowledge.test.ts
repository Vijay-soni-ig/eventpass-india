import assert from "node:assert/strict";
import test from "node:test";
import {
  getExhibitTixKnowledgeStats,
  searchExhibitTixKnowledge,
} from "../src/lib/exhibitTixKnowledge";

test("curated ExhibitTix knowledge baseline is available", () => {
  assert.equal(getExhibitTixKnowledgeStats().entryCount >= 5, true);
});

test("retrieves product overview evidence for a broad product question", () => {
  const matches = searchExhibitTixKnowledge("What does ExhibitTix do?");

  assert.equal(matches.length > 0, true);
  assert.equal(matches[0].id, "product-overview");
  assert.equal(matches[0].sourcePath, "README.md");
  assert.match(matches[0].content, /organizers, exhibitors, and visitors/);
});

test("retrieves payment integrity evidence for payment verification questions", () => {
  const matches = searchExhibitTixKnowledge(
    "How does server-side payment verification and webhook signature validation work?",
  );

  assert.equal(matches.length > 0, true);
  assert.equal(matches[0].id, "payment-integrity");
  assert.match(matches[0].content, /frontend payment success as authoritative/);
});

test("surfaces readiness caveat for deployment-readiness questions", () => {
  const matches = searchExhibitTixKnowledge(
    "Is every feature deployed and production ready?",
  );

  assert.equal(matches.length > 0, true);
  assert.equal(matches[0].id, "readiness-caveat");
  assert.match(matches[0].content, /not proof that a feature is currently deployed/);
});

test("returns no matches for unrelated questions", () => {
  const matches = searchExhibitTixKnowledge(
    "What is the weather forecast for tomorrow?",
  );

  assert.deepEqual(matches, []);
});

test("empty queries return no matches", () => {
  assert.deepEqual(searchExhibitTixKnowledge("   "), []);
});

test("limits the number of returned matches", () => {
  const matches = searchExhibitTixKnowledge(
    "event ticket organizer exhibitor booking payment",
    { limit: 2, minimumScore: 0 },
  );

  assert.equal(matches.length, 2);
});

test("scores are bounded ranking values, not confidence claims", () => {
  const matches = searchExhibitTixKnowledge("payment verification");

  assert.equal(matches.length > 0, true);
  for (const match of matches) {
    assert.equal(match.score >= 0 && match.score <= 1, true);
  }
});
