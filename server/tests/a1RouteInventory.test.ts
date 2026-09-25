import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "src/app.ts"), "utf8");
const inventory = fs.readFileSync(
  path.join(root, "..", "docs/security/A1_ENDPOINT_INVENTORY.md"),
  "utf8",
);

test("A1 route inventory documents every mounted API prefix", () => {
  const mounted = new Set<string>();

  for (const match of appSource.matchAll(/app\.use\(\s*"((?:\/api)(?:[^"]*)?)"/g)) {
    mounted.add(match[1]);
  }
  for (const match of appSource.matchAll(/app\.get\(\s*"((?:\/api)(?:[^"]*)?)"/g)) {
    mounted.add(match[1]);
  }

  const documented = new Set<string>();
  for (const line of inventory.split("\n")) {
    const match = line.match(/^\|\s*([^|]+?)\s*\|/);
    if (match) {
      const prefix = match[1].trim();
      if (prefix.startsWith("/api/")) documented.add(prefix);
    }
  }

  const missing = [...mounted].filter((prefix) => !documented.has(prefix)).sort();
  assert.deepEqual(
    missing,
    [],
    `A1 inventory is missing mounted API prefixes: ${missing.join(", ")}`,
  );

  assert.ok(mounted.size >= 35, `Unexpectedly small API surface: ${mounted.size}`);
});
