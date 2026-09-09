import { test } from "node:test";
import assert from "node:assert/strict";

// These tests validate the deployment-facing contracts without requiring a
// Docker daemon or production infrastructure in CI.
test("Phase 26.2: production deployment configuration requires explicit CORS", () => {
  const appSource = require("fs").readFileSync("src/app.ts", "utf8") as string;
  assert.match(appSource, /CORS_ORIGINS must be configured in production/);
  assert.match(appSource, /\/api\/health\/ready/);
  assert.match(appSource, /disable\("x-powered-by"\)/);
});

test("Phase 26.2: production deployment artifacts exist", () => {
  const fs = require("fs") as typeof import("fs");
  assert.equal(fs.existsSync("Dockerfile"), true);
  assert.equal(fs.existsSync("../Dockerfile"), true);
  assert.equal(fs.existsSync("../nginx.conf"), true);
  assert.equal(fs.existsSync("../docker-compose.production.yml"), true);
  assert.equal(fs.existsSync("../docs/PHASE-26-2-PRODUCTION-DEPLOYMENT.md"), true);
});
