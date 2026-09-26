import assert from "node:assert/strict";
import test from "node:test";

import { getCanonicalUrl, getDefaultRobots } from "../../src/lib/seo";
import { buildRobotsTxt } from "../src/routes/robots";
import { escapeXml, publicEventUrl } from "../src/routes/sitemap";

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
