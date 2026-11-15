import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const repoRoot = path.resolve(__dirname, "..", "..");

test("production Compose requires an explicit single-instance rate-limit topology", () => {
  const compose = fs.readFileSync(path.join(repoRoot, "docker-compose.production.yml"), "utf8");

  assert.match(
    compose,
    /RATE_LIMIT_TOPOLOGY:\s*\$\{RATE_LIMIT_TOPOLOGY:\?RATE_LIMIT_TOPOLOGY must be explicitly set to single-instance\}/,
  );
  assert.doesNotMatch(compose, /RATE_LIMIT_TOPOLOGY:\s*\$\{RATE_LIMIT_TOPOLOGY:-single-instance\}/);
});

test("staging Compose enables malware scanning and requires a reachable ClamAV host", () => {
  const compose = fs.readFileSync(path.join(repoRoot, "docker-compose.staging.yml"), "utf8");
  const exampleEnv = fs.readFileSync(path.join(repoRoot, ".env.staging.example"), "utf8");

  assert.match(compose, /UPLOAD_MALWARE_SCAN_ENABLED:\s*["']true["']/);
  assert.match(compose, /CLAMD_HOST:\s*\$\{CLAMD_HOST:\?CLAMD_HOST is required/);
  assert.match(compose, /CLAMD_PORT:\s*\$\{CLAMD_PORT:-3310\}/);
  assert.match(exampleEnv, /^UPLOAD_MALWARE_SCAN_ENABLED=true$/m);
  assert.match(exampleEnv, /^CLAMD_HOST=.+$/m);
});
