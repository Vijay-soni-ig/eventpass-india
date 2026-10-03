#!/usr/bin/env node

const baseUrl = (process.env.SEO_BASE_URL || "https://exhibittix.com").replace(/\/$/, "");
const publicEventId = process.env.SEO_PUBLIC_EVENT_ID || "";
const privateEventId = process.env.SEO_PRIVATE_EVENT_ID || "";
const archivedEventId = process.env.SEO_ARCHIVED_EVENT_ID || "";
const lighthousePages = (process.env.SEO_LIGHTHOUSE_URLS || "/,/events").split(",").map((v) => v.trim()).filter(Boolean);
// Anonymous PageSpeed calls are rate limited by Google; a key (never committed) avoids that. The endpoint
// can be overridden so the verifier itself can be tested against a stand-in.
const pageSpeedEndpoint = process.env.SEO_PAGESPEED_ENDPOINT || "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const pageSpeedKey = process.env.SEO_PAGESPEED_API_KEY || "";

const EXPECTED_HOME_TITLE = process.env.SEO_EXPECT_HOME_TITLE || "ExhibitTix | Events & Exhibitions in India: Tickets, Stalls and Check-in";
const EXPECTED_HOME_DESCRIPTION =
  process.env.SEO_EXPECT_HOME_DESCRIPTION ||
  "Discover events and exhibitions across India and book tickets. Organizers manage stalls, exhibitors, ticketing and check-in on one platform.";

const REQUIRED_DISALLOW = ["/auth", "/dashboard", "/saved-events", "/account/", "/host/", "/organizer/", "/organizer$", "/exhibitor-dashboard", "/platform", "/book/", "/my-tickets"];
const MUST_STAY_CRAWLABLE = ["/", "/events", "/exhibitions", "/organizers", "/exhibitors", "/pricing", "/about", "/contact"];
const REQUIRED_IN_SITEMAP = ["/", "/events", "/exhibitions", "/organizers", "/exhibitors", "/pricing", "/about", "/contact", "/privacy", "/terms", "/refund-policy"];
const FORBIDDEN_IN_SITEMAP = [/^\/organizer-demo/, /^\/exhibition\//, /^\/dashboard/, /^\/organizer(\/|$)/, /^\/exhibitor-dashboard/, /^\/platform/, /^\/auth/, /^\/api\//, /^\/my-tickets/, /^\/book/];

const failures = [];
const blocked = [];
const checks = [];

function check(name, passed, detail) {
  checks.push({ name, passed, detail });
  if (!passed) failures.push({ name, detail });
}

async function get(path) {
  const url = path.startsWith("http") ? path : `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, { redirect: "follow" });
  return { response, text: await response.text(), url: response.url };
}

/** Like get(), but an unreachable site becomes a failed check instead of a crash that hides every other result. */
async function tryGet(path, name) {
  try {
    return await get(path);
  } catch (error) {
    check(`${name} reachable`, false, `${error?.cause?.code || error?.message || error}`);
    return null;
  }
}

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

/** robots.txt matching the way Google does it: prefix match, "$" anchors the end of the path. */
function isBlockedByRobots(robotsText, urlPath) {
  return robotsText
    .split(/\r?\n/)
    .filter((line) => /^Disallow:/i.test(line))
    .map((line) => line.replace(/^Disallow:/i, "").trim())
    .filter(Boolean)
    .some((rule) => (rule.endsWith("$") ? urlPath === rule.slice(0, -1) : urlPath.startsWith(rule)));
}

function metaContent(html, attribute, key) {
  const tag = new RegExp(`<meta[^>]*${attribute}=["']${key}["'][^>]*>`, "i").exec(html)?.[0];
  return tag ? /content=["']([^"']*)["']/i.exec(tag)?.[1]?.replace(/&amp;/g, "&") : undefined;
}

function verifyRobots(robots) {
  check("robots.txt HTTP 200", robots.response.status === 200, `HTTP ${robots.response.status}`);
  check("robots.txt has sitemap", /(^|\n)Sitemap:\s*https?:\/\/[^\s]+\/sitemap\.xml\s*(?:\n|$)/i.test(robots.text), "Sitemap directive missing");
  check("robots.txt blocks application areas", ["/dashboard", "/organizer", "/platform"].every((path) => robots.text.includes(`Disallow: ${path}`)), "Expected application disallow rules are missing");

  check("robots.txt applies to all crawlers", /^User-agent:\s*\*/im.test(robots.text), "User-agent: * missing");
  const missingRules = REQUIRED_DISALLOW.filter((rule) => !new RegExp(`^Disallow:\\s*${rule.replace(/[$/]/g, "\\$&")}\\s*$`, "im").test(robots.text));
  check("robots.txt has every private-area rule", missingRules.length === 0, missingRules.length ? `missing: ${missingRules.join(", ")}` : "all present");
  const blockedPublic = MUST_STAY_CRAWLABLE.filter((path) => isBlockedByRobots(robots.text, path));
  check("robots.txt does not block public pages", blockedPublic.length === 0, blockedPublic.length ? `blocked: ${blockedPublic.join(", ")}` : "none blocked");
  const declared = /(^|\n)Sitemap:\s*(\S+)/i.exec(robots.text)?.[2];
  check("robots.txt sitemap points at this site", declared === `${baseUrl}/sitemap.xml`, `declared=${declared} expected=${baseUrl}/sitemap.xml`);
}

function verifySitemap(sitemap) {
  check("sitemap.xml HTTP 200", sitemap.response.status === 200, `HTTP ${sitemap.response.status}`);
  check("sitemap.xml content type", /xml/i.test(sitemap.response.headers.get("content-type") || ""), sitemap.response.headers.get("content-type") || "missing");
  check("sitemap.xml is valid urlset", /<urlset[^>]+xmlns=["']http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9["']/i.test(sitemap.text), "urlset namespace missing");

  const sitemapUrls = extractLocs(sitemap.text);
  const eventUrls = sitemapUrls.filter((url) => /\/event\/[^/?#]+$/.test(url));
  check("sitemap contains public event URLs when events exist", eventUrls.length > 0 || process.env.SEO_ALLOW_NO_EVENTS === "true", `event URLs=${eventUrls.length}`);

  const parsed = sitemapUrls.map((loc) => {
    try {
      return new URL(loc);
    } catch {
      return null;
    }
  });
  const malformed = sitemapUrls.filter((_, i) => parsed[i] === null);
  check("sitemap URLs are well formed", malformed.length === 0, malformed.length ? `malformed: ${malformed.slice(0, 3).join(", ")}` : `${sitemapUrls.length} URLs`);
  const valid = parsed.filter(Boolean);
  const wrongOrigin = valid.filter((u) => u.origin !== new URL(baseUrl).origin);
  check("sitemap URLs use this site's origin (no localhost or other host)", wrongOrigin.length === 0, wrongOrigin.length ? `e.g. ${wrongOrigin[0].href}` : "all match");
  if (new URL(baseUrl).protocol === "https:") {
    const insecure = valid.filter((u) => u.protocol !== "https:");
    check("sitemap URLs use HTTPS", insecure.length === 0, insecure.length ? `e.g. ${insecure[0].href}` : "all https");
  }
  check("sitemap URLs are unique", new Set(sitemapUrls).size === sitemapUrls.length, `${sitemapUrls.length - new Set(sitemapUrls).size} duplicate(s)`);

  const paths = new Set(valid.map((u) => u.pathname));
  const missing = REQUIRED_IN_SITEMAP.filter((p) => !paths.has(p));
  check("sitemap lists the marketing pages", missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : "all present");
  const forbidden = [...paths].filter((p) => FORBIDDEN_IN_SITEMAP.some((rx) => rx.test(p)));
  check("sitemap has no private, noindex or duplicate-content URLs", forbidden.length === 0, forbidden.length ? `found: ${forbidden.slice(0, 5).join(", ")}` : "none");

  const eventUrlFor = (id) => `${baseUrl}/event/${encodeURIComponent(id)}`;
  return { sitemapUrls, eventUrlFor };
}

function verifyHomepage(home) {
  check("homepage HTTP 200", home.response.status === 200, `HTTP ${home.response.status}`);
  const html = home.text;
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.replace(/&amp;/g, "&");
  check("homepage title", title === EXPECTED_HOME_TITLE, `title=${title}`);
  check("homepage description", metaContent(html, "name", "description") === EXPECTED_HOME_DESCRIPTION, `description=${metaContent(html, "name", "description")}`);
  const canonicals = [...html.matchAll(/<link[^>]*rel=["']canonical["'][^>]*>/gi)].map((m) => /href=["']([^"']*)["']/i.exec(m[0])?.[1]);
  check("homepage has exactly one canonical, the homepage itself", canonicals.length === 1 && canonicals[0] === `${baseUrl}/`, `canonicals=${JSON.stringify(canonicals)}`);
  for (const key of ["og:title", "og:description", "og:url", "og:type", "og:image"]) {
    check(`homepage ${key}`, Boolean(metaContent(html, "property", key)), metaContent(html, "property", key) || "missing");
  }
  check("homepage og:url is the homepage", metaContent(html, "property", "og:url") === `${baseUrl}/`, `og:url=${metaContent(html, "property", "og:url")}`);
  check("homepage twitter:card", Boolean(metaContent(html, "name", "twitter:card")), metaContent(html, "name", "twitter:card") || "missing");
  check("homepage is not noindex", !/<meta[^>]*name=["']robots["'][^>]*noindex/i.test(html), "robots meta contains noindex");

  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  let allValid = true;
  const badUrls = [];
  for (const block of blocks) {
    try {
      const data = JSON.parse(block);
      if (typeof data.url === "string" && !data.url.startsWith(baseUrl)) badUrls.push(data.url);
    } catch {
      allValid = false;
    }
  }
  check("homepage JSON-LD is valid JSON", allValid, `${blocks.length} block(s)`);
  check("homepage JSON-LD urls use this site", badUrls.length === 0, badUrls.length ? `e.g. ${badUrls[0]}` : "ok");
}

async function verifyPageSpeed(url) {
  const endpoint = `${pageSpeedEndpoint}?url=${encodeURIComponent(url)}&category=performance&category=seo&strategy=mobile${pageSpeedKey ? `&key=${encodeURIComponent(pageSpeedKey)}` : ""}`;
  let data;
  try {
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error(`PageSpeed HTTP ${response.status}`);
    data = await response.json();
  } catch (error) {
    // The score is unknown, which is not a pass: record it as blocked so the run cannot report success.
    blocked.push({ name: `PageSpeed: ${url}`, detail: `${error?.message || error}` });
    return;
  }
  const audits = data.lighthouseResult?.audits || {};
  const seoScore = data.lighthouseResult?.categories?.seo?.score;
  const performanceScore = data.lighthouseResult?.categories?.performance?.score;

  check(`PageSpeed SEO: ${url}`, seoScore === undefined || seoScore >= 0.9, `SEO score=${seoScore}`);
  check(`PageSpeed performance: ${url}`, performanceScore === undefined || performanceScore >= 0.9, `Performance score=${performanceScore}`);

  for (const [auditId, label] of [
    ["document-title", "title"],
    ["meta-description", "description"],
    ["canonical", "canonical"],
    ["structured-data", "structured data"],
  ]) {
    if (audits[auditId]) {
      check(`Lighthouse ${label}: ${url}`, audits[auditId].score === 1, `score=${audits[auditId].score}`);
    }
  }
}

async function main() {
  const robots = await tryGet("/robots.txt", "robots.txt");
  if (robots) verifyRobots(robots);

  const sitemap = await tryGet("/sitemap.xml", "sitemap.xml");
  const { sitemapUrls, eventUrlFor } = sitemap ? verifySitemap(sitemap) : { sitemapUrls: [], eventUrlFor: () => "" };

  const home = await tryGet("/", "homepage");
  if (home) verifyHomepage(home);

  if (publicEventId) {
    const expected = eventUrlFor(publicEventId);
    check("configured published event is in sitemap", sitemapUrls.includes(expected), expected);
    const page = await tryGet(`/event/${encodeURIComponent(publicEventId)}`, "configured public event");
    if (page) {
      check("configured public event HTTP 200", page.response.status === 200, `HTTP ${page.response.status}`);
      await verifyPageSpeed(page.url);
    }
  }

  if (privateEventId) {
    const privateUrl = eventUrlFor(privateEventId);
    check("configured private/draft event is excluded from sitemap", !sitemapUrls.includes(privateUrl), privateUrl);
  }

  if (archivedEventId) {
    const archivedUrl = eventUrlFor(archivedEventId);
    check("configured archived event is excluded from sitemap", !sitemapUrls.includes(archivedUrl), archivedUrl);
  }

  for (const path of lighthousePages) {
    const url = path.startsWith("http") ? path : `${baseUrl}${path}`;
    await verifyPageSpeed(url);
  }

  console.log(`\nProduction SEO verification results for ${baseUrl}`);
  for (const result of checks) console.log(`${result.passed ? "PASS" : "FAIL"}  ${result.name} - ${result.detail}`);
  for (const result of blocked) console.log(`BLOCKED  ${result.name} - ${result.detail}`);

  if (failures.length) {
    console.error(`\n${failures.length} verification check(s) failed.`);
    process.exitCode = 1;
  } else if (blocked.length) {
    console.error(`\nNo check failed, but ${blocked.length} check(s) could not be run. Verification is INCOMPLETE, not passed.`);
    process.exitCode = 2;
  } else {
    console.log("\nAll configured production SEO checks passed.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
