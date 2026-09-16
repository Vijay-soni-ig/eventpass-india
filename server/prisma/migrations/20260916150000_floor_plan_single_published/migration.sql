-- FP-07: enforce the floor-plan publication invariant at the database level.
-- An exhibition may have many draft/archived layouts, but only one published
-- layout may exist at a time. The publish endpoint already archives the prior
-- published plan inside a transaction; this partial unique index closes the
-- remaining concurrent-publish race where two different drafts could both
-- transition to published.
CREATE UNIQUE INDEX "floor_plans_one_published_per_exhibition_idx"
ON "floor_plans" ("exhibitionId")
WHERE status = 'published';
