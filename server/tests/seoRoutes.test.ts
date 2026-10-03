import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testServer";
import { MARKETING_SITEMAP_PATHS } from "../src/routes/sitemap";

let baseUrl: string;
let stop: () => Promise<void>;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});
after(async () => {
  await stop();
});

test("sitemap.xml is XML and lists every marketing page", async () => {
  const res = await fetch(`${baseUrl}/sitemap.xml`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /xml/);
  const body = await res.text();
  assert.match(body, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const p of MARKETING_SITEMAP_PATHS) {
    assert.ok(locs.includes(`https://exhibittix.com${p}`), `sitemap is missing ${p}`);
  }
});

test("sitemap.xml never lists private, noindex or duplicate-content URLs", async () => {
  const body = await (await fetch(`${baseUrl}/sitemap.xml`)).text();
  const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  const forbidden = [/^\/auth/, /^\/dashboard/, /^\/organizer\//, /^\/organizer$/, /^\/organizer-demo/, /^\/exhibitor-dashboard/, /^\/platform/, /^\/my-tickets/, /^\/book/, /^\/account/, /^\/api/, /^\/exhibition\//];
  for (const loc of locs) {
    for (const pattern of forbidden) assert.doesNotMatch(loc, pattern, `${loc} must not be in the sitemap`);
  }
  assert.equal(new Set(locs).size, locs.length, "sitemap URLs must be unique");
});

test("robots.txt route declares the sitemap and keeps /organizers crawlable", async () => {
  const res = await fetch(`${baseUrl}/robots.txt`);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /Sitemap: https:\/\/[^\s]+\/sitemap\.xml/);
  assert.match(body, /Disallow: \/organizer\//);
  assert.doesNotMatch(body, /^Disallow: \/organizer$/m);
});
