#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const dumpArg = process.argv[2];
if (!dumpArg) throw new Error("Usage: npm run db:restore -- /path/to/backup.dump");

const dumpPath = resolve(dumpArg);
if (!existsSync(dumpPath)) throw new Error(`Backup file not found: ${dumpPath}`);
if (statSync(dumpPath).size < 1024) throw new Error("Backup artifact is unexpectedly small");

const databaseUrl = requireEnv("DATABASE_URL");
const isProduction = (process.env.NODE_ENV || "").toLowerCase() === "production";
if (isProduction && process.env.CONFIRM_PRODUCTION_RESTORE !== "YES") {
  throw new Error("Production restore blocked. Set CONFIRM_PRODUCTION_RESTORE=YES after approved change control.");
}

const checksumPath = `${dumpPath}.sha256`;
if (!existsSync(checksumPath)) throw new Error(`Checksum file missing: ${checksumPath}`);
const expected = readFileSync(checksumPath, "utf8").trim().split(/\s+/)[0]?.toLowerCase();
const actual = createHash("sha256").update(readFileSync(dumpPath)).digest("hex");
if (!expected || expected !== actual) throw new Error("Backup checksum verification failed; restore aborted");

console.log(`Restoring verified backup: ${basename(dumpPath)}`);
execFileSync("pg_restore", [
  "--clean",
  "--if-exists",
  "--no-owner",
  "--no-acl",
  "--exit-on-error",
  "--dbname", databaseUrl,
  dumpPath,
], { stdio: "inherit" });

console.log("Restore completed successfully.");
