#!/usr/bin/env node

const required = ["BACKUP_PROVIDER", "BACKUP_ENVIRONMENT", "BACKUP_RETENTION_DAYS"];
const missing = required.filter((name) => !(process.env[name] || "").trim());

if (missing.length) {
  console.error(JSON.stringify({ ok: false, error: "Backup contract is not configured", missing }));
  process.exit(1);
}

const retention = Number(process.env.BACKUP_RETENTION_DAYS);
if (!Number.isInteger(retention) || retention <= 0) {
  console.error(JSON.stringify({ ok: false, error: "BACKUP_RETENTION_DAYS must be a positive integer" }));
  process.exit(1);
}

if (process.env.BACKUP_ENVIRONMENT !== "production") {
  console.error(JSON.stringify({ ok: false, error: "BACKUP_ENVIRONMENT must be production for the production backup contract" }));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  provider: process.env.BACKUP_PROVIDER,
  environment: "production",
  retentionDays: retention,
  restoreDrill: "external_verification_required",
}));
