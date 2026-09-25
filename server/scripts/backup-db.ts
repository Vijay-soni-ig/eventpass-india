#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const databaseUrl = requireEnv("DATABASE_URL");
const backupDir = resolve(process.env.BACKUP_DIR?.trim() || "./backups/postgres");
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || "14");

if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
  throw new Error("BACKUP_RETENTION_DAYS must be an integer between 1 and 3650");
}

mkdirSync(backupDir, { recursive: true, mode: 0o700 });
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const dumpPath = join(backupDir, `eventpass-${timestamp}.dump`);
const checksumPath = `${dumpPath}.sha256`;

console.log(`Creating PostgreSQL backup: ${basename(dumpPath)}`);
execFileSync("pg_dump", [
  "--format=custom",
  "--no-owner",
  "--no-acl",
  "--file", dumpPath,
  databaseUrl,
], { stdio: "inherit" });

const size = statSync(dumpPath).size;
if (size < 1024) throw new Error("Backup artifact is unexpectedly small; refusing to mark it valid");

const hash = createHash("sha256").update(readFileSync(dumpPath)).digest("hex");
writeFileSync(checksumPath, `${hash}  ${basename(dumpPath)}\n`, { mode: 0o600 });

const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
for (const entry of require("node:fs").readdirSync(backupDir, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith(".dump")) continue;
  const path = join(backupDir, entry.name);
  if (statSync(path).mtimeMs < cutoff) {
    require("node:fs").rmSync(path);
    const checksum = `${path}.sha256`;
    if (require("node:fs").existsSync(checksum)) require("node:fs").rmSync(checksum);
  }
}

console.log(`Backup created and checksummed: ${basename(dumpPath)} (${size} bytes)`);
