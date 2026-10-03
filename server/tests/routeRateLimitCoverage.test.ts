import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const routeRoot = path.resolve(__dirname, "..", "src", "routes");

/**
 * Mutating routes that are deliberately not rate limited, with the reason. Everything else must name
 * a rate limiter on the route itself or apply one to the whole router with `router.use(...)`.
 */
const intentionallyUnthrottled: Array<{ file: string; route: string; reason: string }> = [
  {
    file: "paymentWebhooks.ts",
    route: "POST /:provider",
    reason: "Gateway webhook: authenticated by signature, and throttling gateway retries would lose payment events.",
  },
  {
    file: "whatsappWebhook.ts",
    route: "POST /",
    reason: "Provider webhook: authenticated by signature, and throttling provider retries would lose delivery events.",
  },
];

/** Returns "METHOD path" for every post/put/patch/delete registration in `source` that has no rate limiter. */
export function findUnthrottledMutations(source: string): string[] {
  if (/\b\w+\.use\(\s*[^)]*(RateLimit|Limiter)/.test(source)) return [];
  const found: string[] = [];
  const registration = /\b\w+\.(post|put|patch|delete)\(\s*(["'`][^"'`]*["'`])/g;
  for (let match = registration.exec(source); match; match = registration.exec(source)) {
    // The middleware list sits between the path and the handler, which starts at the first arrow.
    const rest = source.slice(match.index);
    const arrow = rest.indexOf("=>");
    const close = rest.indexOf(");\n");
    const end = [arrow, close].filter((index) => index > 0).sort((a, b) => a - b)[0] ?? rest.length;
    if (!/RateLimit|Limiter/.test(rest.slice(0, end))) {
      found.push(`${match[1].toUpperCase()} ${match[2].slice(1, -1)}`);
    }
  }
  return found;
}

test("every mutating route has a rate limiter unless it is listed as intentionally unthrottled", () => {
  const allowed = new Set(intentionallyUnthrottled.map((entry) => `${entry.file} ${entry.route}`));
  const unexpected: string[] = [];
  const seen = new Set<string>();

  for (const file of fs.readdirSync(routeRoot).filter((name) => name.endsWith(".ts")).sort()) {
    for (const route of findUnthrottledMutations(fs.readFileSync(path.join(routeRoot, file), "utf8"))) {
      const key = `${file} ${route}`;
      seen.add(key);
      if (!allowed.has(key)) unexpected.push(key);
    }
  }

  assert.deepEqual(
    unexpected,
    [],
    `Mutating routes without a rate limiter. Add one from middleware/rateLimit.ts, or list the route as intentionally unthrottled with a reason:\n${unexpected.join("\n")}`,
  );

  const stale = [...allowed].filter((key) => !seen.has(key));
  assert.deepEqual(stale, [], `Intentionally-unthrottled entries that no longer match a route: ${stale.join(", ")}`);
});

test("the scanner flags a route with no limiter and accepts per-route and router-wide limiters", () => {
  const bare = `router.post("/things", requireAuth, async (req, res) => { res.json({}); });`;
  assert.deepEqual(findUnthrottledMutations(bare), ["POST /things"]);

  const perRoute = `router.delete("/things/:id", requireAuth, thingMutationRateLimit, async (req, res) => {});`;
  assert.deepEqual(findUnthrottledMutations(perRoute), []);

  const multiLine = `router.put(\n  "/things/:id",\n  requireAuth,\n  thingMutationRateLimit,\n  async (req, res) => {},\n);`;
  assert.deepEqual(findUnthrottledMutations(multiLine), []);

  const routerWide = `router.use(thingRateLimit);\nrouter.patch("/things/:id", async (req, res) => {});`;
  assert.deepEqual(findUnthrottledMutations(routerWide), []);

  const namedHandler = `router.post("/things", requireAuth, createThing);\nrouter.post("/other", requireAuth, otherRateLimit, createOther);`;
  assert.deepEqual(findUnthrottledMutations(namedHandler), ["POST /things"]);

  assert.deepEqual(findUnthrottledMutations(`router.get("/things", async (req, res) => {});`), []);
});
