import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// These tests validate deployment-facing contracts without requiring Docker or production infrastructure.
test("Phase 26.2: production deployment configuration requires explicit CORS", () => {
  const appSource = fs.readFileSync("src/app.ts", "utf8");
  assert.match(appSource, /CORS_ORIGINS must be configured in production/);
  assert.match(appSource, /\/api\/health\/ready/);
  assert.match(appSource, /disable\("x-powered-by"\)/);
});

test("Phase 26.2: production deployment artifacts exist", () => {
  assert.equal(fs.existsSync("Dockerfile"), true);
  assert.equal(fs.existsSync("../Dockerfile"), true);
  assert.equal(fs.existsSync("../nginx.conf"), true);
  assert.equal(fs.existsSync("../docker-compose.production.yml"), true);
  assert.equal(fs.existsSync("../docs/PHASE-26-2-PRODUCTION-DEPLOYMENT.md"), true);
});
