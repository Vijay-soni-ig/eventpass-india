#!/usr/bin/env node

const baseUrl = (process.env.SEO_BASE_URL || "https://exhibittix.com").replace(/\/$/, "");
const publicEventId = process.env.SEO_PUBLIC_EVENT_ID || "";
const privateEventId = process.env.SEO_PRIVATE_EVENT_ID || "";
const lighthousePages = (process.env.SEO_LIGHTHOUSE_URLS || "/,/events").split(",").map((v) => v.trim()).filter(Boolean);

const failures = [];
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

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

async function verifyPageSpeed(url) {
  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&category=performance&category=seo&strategy=mobile`;
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error(`PageSpeed HTTP ${response.status}`);
  const data = await response.json();
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
  const robots = await get("/robots.txt");
  check("robots.txt HTTP 200", robots.response.status === 200, `HTTP ${robots.response.status}`);
  check("robots.txt has sitemap", /(^|\n)Sitemap:\s*https?:\/\/[^\s]+\/sitemap\.xml\s*(?:\n|$)/i.test(robots.text), "Sitemap directive missing");
  check("robots.txt blocks application areas", ["/dashboard", "/organizer", "/platform"].every((path) => robots.text.includes(`Disallow: ${path}`)), "Expected application disallow rules are missing");

  const sitemap = await get("/sitemap.xml");
  check("sitemap.xml HTTP 200", sitemap.response.status === 200, `HTTP ${sitemap.response.status}`);
  check("sitemap.xml content type", /xml/i.test(sitemap.response.headers.get("content-type") || ""), sitemap.response.headers.get("content-type") || "missing");
  check("sitemap.xml is valid urlset", /<urlset[^>]+xmlns=["']http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9["']/i.test(sitemap.text), "urlset namespace missing");

  const sitemapUrls = extractLocs(sitemap.text);
  const eventUrls = sitemapUrls.filter((url) => /\/event\/[^/?#]+$/.test(url));
  check("sitemap contains public event URLs when events exist", eventUrls.length > 0 || process.env.SEO_ALLOW_NO_EVENTS === "true", `event URLs=${eventUrls.length}`);

  if (publicEventId) {
    const expected = `${baseUrl}/event/${encodeURIComponent(publicEventId)}`;
    check("configured published event is in sitemap", sitemapUrls.includes(expected), expected);
    const page = await get(`/event/${encodeURIComponent(publicEventId)}`);
    check("configured public event HTTP 200", page.response.status === 200, `HTTP ${page.response.status}`);
    await verifyPageSpeed(page.url);
  }

  if (privateEventId) {
    const privateUrl = `${baseUrl}/event/${encodeURIComponent(privateEventId)}`;
    check("configured private/draft event is excluded from sitemap", !sitemapUrls.includes(privateUrl), privateUrl);
  }

  for (const path of lighthousePages) {
    const url = path.startsWith("http") ? path : `${baseUrl}${path}`;
    await verifyPageSpeed(url);
  }

  console.log("\nProduction SEO verification results");
  for (const result of checks) console.log(`${result.passed ? "PASS" : "FAIL"}  ${result.name} - ${result.detail}`);

  if (failures.length) {
    console.error(`\n${failures.length} verification check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log("\nAll configured production SEO checks passed.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
