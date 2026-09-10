import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const distDir = join(process.cwd(), "dist");
const maxAssetBytes = 1024 * 1024;
const maxTotalJsBytes = 4 * 1024 * 1024;
const maxCssBytes = 512 * 1024;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

const files = await walk(distDir);
const jsFiles = files.filter((file) => file.endsWith(".js"));
const cssFiles = files.filter((file) => file.endsWith(".css"));
const sizes = new Map(await Promise.all(files.map(async (file) => [file, (await stat(file)).size])));
const largestJs = [...jsFiles].sort((a, b) => sizes.get(b) - sizes.get(a))[0];
const totalJs = jsFiles.reduce((sum, file) => sum + sizes.get(file), 0);

if (!largestJs) throw new Error("No frontend JavaScript assets were produced");
if (sizes.get(largestJs) > maxAssetBytes) throw new Error(`Largest JS asset exceeds 1 MiB: ${largestJs}`);
if (totalJs > maxTotalJsBytes) throw new Error("Total JavaScript output exceeds 4 MiB");
for (const css of cssFiles) {
  if (sizes.get(css) > maxCssBytes) throw new Error(`CSS asset exceeds 512 KiB: ${css}`);
}

console.log(`Frontend performance budget PASS: ${jsFiles.length} JS assets, ${(totalJs / 1024 / 1024).toFixed(2)} MiB total JS.`);
