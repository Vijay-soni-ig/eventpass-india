import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { execFile } from "node:child_process";
import { buildRobotsTxt } from "../src/routes/robots";
import { MARKETING_SITEMAP_PATHS } from "../src/routes/sitemap";

const script = path.resolve(__dirname, "..", "..", "scripts", "verify-production-seo.mjs");
const TITLE = "ExhibitTix | Events & Exhibitions in India: Tickets, Stalls and Check-in";
const DESCRIPTION = "Discover events and exhibitions across India and book tickets. Organizers manage stalls, exhibitors, ticketing and check-in on one platform.";

type Site = {
  robots: (base: string) => string;
  sitemapType: string;
  sitemap: (base: string) => string;
  home: (base: string) => string;
  pageSpeedStatus: number;
  pageSpeedScore: number;
};

let server: http.Server;
let base: string;
let site: Site;

const esc = (value: string) => value.replace(/&/g, "&amp;");

function goodSite(): Site {
  return {
    robots: (b) => buildRobotsTxt(b),
    sitemapType: "application/xml",
    sitemap: (b) =>
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...MARKETING_SITEMAP_PATHS.map((p) => `${b}${p}`), `${b}/event/published-1`]
        .map((loc) => `  <url><loc>${loc}</loc></url>`)
        .join("\n")}\n</urlset>\n`,
    home: (b) => `<!doctype html><html><head>
<title>${esc(TITLE)}</title>
<meta name="description" content="${DESCRIPTION}" />
<link rel="canonical" href="${b}/" />
<meta property="og:title" content="${esc(TITLE)}" />
<meta property="og:description" content="${DESCRIPTION}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${b}/" />
<meta property="og:image" content="${b}/og-image.jpg" />
<meta name="twitter:card" content="summary_large_image" />
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"ExhibitTix","url":"${b}"}</script>
</head><body><div id="root"></div></body></html>`,
    pageSpeedStatus: 200,
    pageSpeedScore: 0.95,
  };
}

before(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", base);
    if (url.pathname === "/robots.txt") return void res.writeHead(200, { "content-type": "text/plain" }).end(site.robots(base));
    if (url.pathname === "/sitemap.xml") return void res.writeHead(200, { "content-type": site.sitemapType }).end(site.sitemap(base));
    if (url.pathname === "/pagespeed") {
      if (site.pageSpeedStatus !== 200) return void res.writeHead(site.pageSpeedStatus).end("{}");
      const score = site.pageSpeedScore;
      return void res
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ lighthouseResult: { categories: { seo: { score }, performance: { score } }, audits: {} } }));
    }
    return void res.writeHead(200, { "content-type": "text/html" }).end(site.home(base));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  site = goodSite();
});

function run(env: Record<string, string> = {}, baseUrl = () => base): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [script],
      { env: { ...process.env, SEO_BASE_URL: baseUrl(), SEO_PAGESPEED_ENDPOINT: `${base}/pagespeed`, SEO_LIGHTHOUSE_URLS: "/", ...env }, timeout: 60_000 },
      (error, stdout, stderr) => resolve({ code: error ? Number((error as { code?: number }).code ?? 1) : 0, out: `${stdout}\n${stderr}` }),
    );
  });
}

const allowNoEvents = { SEO_ALLOW_NO_EVENTS: "true" };

test("verifier: a correct site passes every check", async () => {
  const { code, out } = await run({ SEO_PUBLIC_EVENT_ID: "published-1" });
  assert.equal(code, 0, out);
  assert.match(out, /All configured production SEO checks passed/);
  assert.match(out, /PASS {2}homepage title/);
  assert.match(out, /PASS {2}sitemap lists the marketing pages/);
});

test("verifier: the old '/organizer' robots rule that blocks /organizers is caught", async () => {
  site.robots = (b) => buildRobotsTxt(b).replace("Disallow: /organizer/\nDisallow: /organizer$", "Disallow: /organizer");
  const { code, out } = await run(allowNoEvents);
  assert.equal(code, 1);
  assert.match(out, /FAIL {2}robots\.txt does not block public pages - blocked: .*\/organizers/);
});

test("verifier: a missing private-area rule is caught", async () => {
  site.robots = (b) => buildRobotsTxt(b).replace("Disallow: /saved-events\n", "");
  const { code, out } = await run(allowNoEvents);
  assert.equal(code, 1);
  assert.match(out, /FAIL {2}robots\.txt has every private-area rule - missing: \/saved-events/);
});

test("verifier: a sitemap served as HTML (single-page-app fallback) is caught", async () => {
  site.sitemapType = "text/html";
  site.sitemap = (b) => site.home(b);
  const { code, out } = await run(allowNoEvents);
  assert.equal(code, 1);
  assert.match(out, /FAIL {2}sitemap\.xml content type/);
  assert.match(out, /FAIL {2}sitemap\.xml is valid urlset/);
});

test("verifier: private, noindex, duplicate and localhost URLs in the sitemap are caught", async () => {
  const good = site.sitemap;
  site.sitemap = (b) =>
    good(b).replace(
      "</urlset>",
      `<url><loc>${b}/organizer-demo</loc></url><url><loc>${b}/exhibition/abc</loc></url><url><loc>${b}/organizer/events</loc></url><url><loc>http://localhost:3000/pricing</loc></url></urlset>`,
    );
  const { code, out } = await run(allowNoEvents);
  assert.equal(code, 1);
  assert.match(out, /FAIL {2}sitemap has no private, noindex or duplicate-content URLs - found: .*organizer-demo/);
  assert.match(out, /FAIL {2}sitemap URLs use this site's origin/);
});

test("verifier: a missing marketing page in the sitemap is caught", async () => {
  const good = site.sitemap;
  site.sitemap = (b) => good(b).replace(`<url><loc>${b}/pricing</loc></url>`, "");
  const { code, out } = await run(allowNoEvents);
  assert.equal(code, 1);
  assert.match(out, /FAIL {2}sitemap lists the marketing pages - missing: \/pricing/);
});

test("verifier: private and archived events must be absent, a published event must be present", async () => {
  const good = site.sitemap;
  site.sitemap = (b) => good(b).replace("</urlset>", `<url><loc>${b}/event/draft-1</loc></url><url><loc>${b}/event/archived-1</loc></url></urlset>`);
  const { code, out } = await run({ SEO_PUBLIC_EVENT_ID: "missing-event", SEO_PRIVATE_EVENT_ID: "draft-1", SEO_ARCHIVED_EVENT_ID: "archived-1" });
  assert.equal(code, 1);
  assert.match(out, /FAIL {2}configured published event is in sitemap/);
  assert.match(out, /FAIL {2}configured private\/draft event is excluded from sitemap/);
  assert.match(out, /FAIL {2}configured archived event is excluded from sitemap/);
});

test("verifier: a wrong homepage canonical, title or malformed JSON-LD is caught", async () => {
  const good = site.home;
  site.home = (b) =>
    good(b)
      .replace(`<link rel="canonical" href="${b}/" />`, `<link rel="canonical" href="${b}/pricing" />`)
      .replace(`<title>${esc(TITLE)}</title>`, "<title>Something else</title>")
      .replace('"name":"ExhibitTix"', '"name":"ExhibitTix"  BROKEN');
  const { code, out } = await run(allowNoEvents);
  assert.equal(code, 1);
  assert.match(out, /FAIL {2}homepage has exactly one canonical/);
  assert.match(out, /FAIL {2}homepage title/);
  assert.match(out, /FAIL {2}homepage JSON-LD is valid JSON/);
});

test("verifier: low PageSpeed scores fail at the unchanged 0.90 threshold", async () => {
  site.pageSpeedScore = 0.89;
  const { code, out } = await run(allowNoEvents);
  assert.equal(code, 1);
  assert.match(out, /FAIL {2}PageSpeed SEO/);
  assert.match(out, /FAIL {2}PageSpeed performance/);
});

test("verifier: an unavailable PageSpeed is reported BLOCKED, keeps the other results and is never a pass", async () => {
  site.pageSpeedStatus = 429;
  const { code, out } = await run(allowNoEvents);
  assert.equal(code, 2, out);
  assert.match(out, /BLOCKED {2}PageSpeed: .*PageSpeed HTTP 429/);
  assert.match(out, /PASS {2}robots\.txt HTTP 200/);
  assert.match(out, /INCOMPLETE/);
  assert.doesNotMatch(out, /All configured production SEO checks passed/);
});

test("verifier: an unreachable site fails cleanly with every unreachable check named, not a crash", async () => {
  const { code, out } = await run(allowNoEvents, () => "http://127.0.0.1:1");
  assert.equal(code, 1);
  assert.match(out, /robots\.txt reachable/);
  assert.match(out, /sitemap\.xml reachable/);
  assert.match(out, /homepage reachable/);
  assert.doesNotMatch(out, /at async main/);
});
