import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { getCanonicalUrl, getDefaultRobots } from "../../src/lib/seo";
import { buildRobotsTxt } from "../src/routes/robots";
import { MARKETING_SITEMAP_PATHS, escapeXml, publicEventUrl } from "../src/routes/sitemap";

test("canonical URLs normalize public paths", () => {
  assert.equal(getCanonicalUrl("/events/"), "https://exhibittix.com/events");
  assert.equal(getCanonicalUrl("event/abc"), "https://exhibittix.com/event/abc");
  assert.equal(getCanonicalUrl("/"), "https://exhibittix.com/");
});

test("robots policy indexes approved public routes only", () => {
  assert.equal(getDefaultRobots("/events"), "index,follow");
  assert.equal(getDefaultRobots("/event/evt-123"), "index,follow");
  assert.equal(getDefaultRobots("/event/evt-123/participants/p-1"), "index,follow");
  assert.equal(getDefaultRobots("/dashboard"), "noindex,nofollow");
  assert.equal(getDefaultRobots("/random/filter"), "noindex,nofollow");
});

test("robots.txt points to the configured sitemap", () => {
  const robots = buildRobotsTxt("https://example.com/");
  assert.match(robots, /User-agent: \*/);
  assert.match(robots, /Disallow: \/dashboard/);
  assert.match(robots, /Disallow: \/platform/);
  assert.match(robots, /Sitemap: https:\/\/example\.com\/sitemap\.xml/);
});

test("sitemap event URLs are encoded and XML-safe", () => {
  assert.equal(publicEventUrl("event/123"), "https://exhibittix.com/event/event%2F123");
  assert.equal(
    escapeXml('https://example.com/event?a=1&b=<x>"'),
    "https://example.com/event?a=1&amp;b=&lt;x&gt;&quot;",
  );
});

/** Applies robots.txt matching (prefix match, "$" anchors the end) the way Google does. */
function isBlockedByRobots(robotsTxt: string, urlPath: string): boolean {
  return robotsTxt
    .split(/\r?\n/)
    .filter((line) => line.startsWith("Disallow:"))
    .map((line) => line.slice("Disallow:".length).trim())
    .filter(Boolean)
    .some((rule) => (rule.endsWith("$") ? urlPath === rule.slice(0, -1) : urlPath.startsWith(rule)));
}

const PRIVATE_PATHS = [
  "/auth",
  "/onboarding",
  "/dashboard",
  "/saved-events",
  "/notifications",
  "/my-tickets",
  "/my-tickets/abc",
  "/account/settings",
  "/host/exhibitions/new",
  "/book/abc",
  "/book-stall/abc",
  "/exhibitor-dashboard",
  "/exhibitor-dashboard/leads",
  "/organizer",
  "/organizer/events",
  "/organizer/events/abc/edit",
  "/platform",
  "/platform/payments",
  "/organizer-demo",
];

test("the static public/robots.txt served by the frontend is exactly what the API generates", () => {
  const file = fs.readFileSync(path.resolve(__dirname, "..", "..", "public", "robots.txt"), "utf8").replace(/\r\n/g, "\n");
  assert.equal(file, buildRobotsTxt("https://exhibittix.com"));
});

test("robots.txt blocks every private area and none of the sitemap pages", () => {
  const robots = buildRobotsTxt("https://exhibittix.com");
  for (const privatePath of PRIVATE_PATHS.filter((p) => p !== "/organizer-demo")) {
    assert.equal(isBlockedByRobots(robots, privatePath), true, `${privatePath} should be disallowed`);
  }
  for (const publicPath of MARKETING_SITEMAP_PATHS) {
    assert.equal(isBlockedByRobots(robots, publicPath), false, `${publicPath} must stay crawlable`);
  }
  // Prefix traps: public pages that share a prefix with a private area.
  assert.equal(isBlockedByRobots(robots, "/organizers"), false);
  assert.equal(isBlockedByRobots(robots, "/exhibitors"), false);
  assert.equal(isBlockedByRobots(robots, "/organizers/some-organizer"), false);
});

test("every sitemap page is indexable and every private page defaults to noindex", () => {
  for (const publicPath of MARKETING_SITEMAP_PATHS) {
    assert.equal(getDefaultRobots(publicPath), "index,follow", `${publicPath} should be indexable`);
  }
  for (const privatePath of PRIVATE_PATHS) {
    assert.equal(getDefaultRobots(privatePath), "noindex,nofollow", `${privatePath} should be noindex`);
  }
  assert.equal(getDefaultRobots("/some/unknown/page"), "noindex,nofollow");
});

test("sitemap paths are unique, absolute paths without query strings", () => {
  assert.equal(new Set(MARKETING_SITEMAP_PATHS).size, MARKETING_SITEMAP_PATHS.length);
  for (const p of MARKETING_SITEMAP_PATHS) assert.match(p, /^\/[a-z0-9\-/]*$/);
});
