import { Router } from "express";

const router = Router();

const SITE_URL = (process.env.SITE_URL ?? "https://exhibittix.com").replace(/\/$/, "");

export function buildRobotsTxt(siteUrl = SITE_URL): string {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /auth",
    "Disallow: /onboarding",
    "Disallow: /dashboard",
    "Disallow: /my-tickets",
    "Disallow: /book/",
    "Disallow: /book-stall/",
    "Disallow: /notifications",
    "Disallow: /exhibitor-dashboard",
    "Disallow: /organizer",
    "Disallow: /platform",
    "",
    `Sitemap: ${siteUrl.replace(/\/$/, "")}/sitemap.xml`,
    "",
  ].join("\n");
}

router.get("/robots.txt", (_req, res) => {
  res
    .type("text/plain")
    .set("Cache-Control", "public, max-age=3600, s-maxage=3600")
    .send(buildRobotsTxt());
});

export default router;
