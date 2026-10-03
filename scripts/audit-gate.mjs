// Fails when `npm audit` reports a high or critical advisory, except for the advisories listed in
// audit-allowlist.json. An exception must say why it is safe and has an expiry date; once the date
// passes the gate fails again, so an exception cannot be forgotten.
//
// Usage: node scripts/audit-gate.mjs [directory]   (default: the repository root)
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const GATED = new Set(["high", "critical"]);
const dir = process.argv[2] ?? ".";
const allowlist = JSON.parse(readFileSync(fileURLToPath(new URL("./audit-allowlist.json", import.meta.url)), "utf8"));
const today = new Date().toISOString().slice(0, 10);

const run = spawnSync("npm audit --json", { cwd: dir, encoding: "utf8", shell: true, maxBuffer: 64 * 1024 * 1024 });
let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  console.error(`Could not read the npm audit report for "${dir}":\n${run.stdout}\n${run.stderr}`);
  process.exit(1);
}
if (report.error) {
  console.error(`npm audit failed for "${dir}": ${report.error.summary ?? JSON.stringify(report.error)}`);
  process.exit(1);
}

// Each advisory appears as an object in the `via` list of the package that owns it; the other
// entries are packages that merely depend on a vulnerable one.
const advisories = new Map();
for (const [name, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of vulnerability.via) {
    if (typeof via !== "object") continue;
    const id = via.url?.split("/").pop() ?? String(via.source);
    if (!advisories.has(id)) advisories.set(id, { id, name: via.name ?? name, severity: via.severity, title: via.title, url: via.url });
  }
}

const blocking = [];
const excepted = [];
for (const advisory of [...advisories.values()].filter((a) => GATED.has(a.severity))) {
  const exception = allowlist.find((entry) => entry.id === advisory.id);
  if (!exception) blocking.push(advisory);
  else if (exception.expires < today) blocking.push({ ...advisory, title: `${advisory.title} (exception expired ${exception.expires})` });
  else excepted.push({ advisory, exception });
}

for (const { advisory, exception } of excepted) {
  console.log(`Allowed until ${exception.expires}: ${advisory.id} ${advisory.name} - ${advisory.title}\n  ${exception.reason}`);
}
if (blocking.length > 0) {
  console.error(`\nHigh/critical advisories in "${dir}" that are not allowed:`);
  for (const a of blocking) console.error(`  ${a.severity} ${a.name}: ${a.title}\n  ${a.url}`);
  process.exit(1);
}
console.log(`npm audit gate passed for "${dir}" (${advisories.size} advisories, ${excepted.length} allowed exceptions).`);
