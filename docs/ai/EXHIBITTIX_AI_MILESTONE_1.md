# ExhibitTix AI — Milestone 1: Curated Knowledge Retrieval

## Goal

Create a small, testable foundation for a business-specific AI assistant without
connecting an LLM, exposing production data, or making unsupported product
readiness claims.

## What this milestone includes

- A deterministic lexical retrieval function in
  `server/src/lib/exhibitTixKnowledge.ts`.
- A small curated knowledge baseline sourced from the repository README.
- Source path and source label returned with each match.
- Unit tests for product overview, payment integrity, readiness caveats,
  unrelated questions, empty queries, result limits, and score bounds.

## What it deliberately does not include

- No model training or fine-tuning.
- No LLM/API calls, embeddings, vector database, or network requests.
- No production database reads or customer data.
- No public HTTP route or chat UI.
- No claims that README-documented features are necessarily deployed or enabled.

## Run the tests

From the repository root:

```bash
cd server
npm test
```

The existing test script runs all `server/tests/*.test.ts` tests. To run only
this test file, use:

```bash
npx tsx --test --import ./tests/testSetup.ts tests/exhibitTixKnowledge.test.ts
```

## Acceptance criteria

1. TypeScript compiles under the existing server TypeScript configuration.
2. The tests pass without database access or external network calls.
3. Every result includes its source path and source label.
4. An unrelated question returns no matches.
5. Search scores are treated only as ranking hints, not calibrated confidence.

## Next milestone (not included here)

After this baseline is merged and CI is green, audit approved business sources
and define their access classifications. Then add an authenticated, read-only
API and an LLM adapter that receives retrieved evidence and returns answer
citations. Embeddings/semantic retrieval should be introduced only when a
curated evaluation set demonstrates the limitations of lexical retrieval.
