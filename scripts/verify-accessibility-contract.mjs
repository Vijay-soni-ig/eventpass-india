import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const srcDir = join(root, "src");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(file));
    else files.push(file);
  }
  return files;
}

const sourceFiles = (await walk(srcDir)).filter((file) => file.endsWith(".tsx") || file.endsWith(".jsx"));
const violations = [];

for (const file of sourceFiles) {
  const content = await readFile(file, "utf8");
  const relative = file.slice(root.length + 1);

  for (const match of content.matchAll(/<img\b[^>]*>/g)) {
    if (!/\balt\s*=/.test(match[0])) violations.push(`${relative}: image is missing an alt attribute`);
  }

  for (const match of content.matchAll(/\btabIndex\s*=\s*\{?\s*([0-9]+)/g)) {
    if (Number(match[1]) > 0) violations.push(`${relative}: positive tabIndex breaks predictable keyboard navigation`);
  }
}

const html = await readFile(join(root, "index.html"), "utf8");
if (!/<html\b[^>]*\blang=["']en["']/.test(html)) violations.push("index.html: document language must be declared");
if (!/<meta\s+name=["']viewport["']/.test(html)) violations.push("index.html: viewport metadata is required");
if (!/<a\s+class=["']skip-link["']\s+href=["']#root["']>/.test(html)) violations.push("index.html: keyboard skip link is required");
if (!/<div\s+id=["']root["']\s+tabindex=["']-1["']/.test(html)) violations.push("index.html: skip-link target must be programmatically focusable");

if (violations.length > 0) {
  console.error("Accessibility contract FAIL:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`Accessibility contract PASS: scanned ${sourceFiles.length} TSX/JSX files and verified document-level keyboard affordances.`);
