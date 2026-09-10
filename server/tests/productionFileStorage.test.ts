import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("production file storage runbook explicitly rejects host-volume durability as launch complete", () => {
  const runbook = fs.readFileSync(path.join(process.cwd(), "..", "docs", "production-file-storage.md"), "utf8");
  assert.match(runbook, /durable object storage/i);
  assert.match(runbook, /PARTIAL \/ BLOCKED FOR PRODUCTION/i);
  assert.match(runbook, /private by default/i);
  assert.match(runbook, /tenant-scoped/i);
});
