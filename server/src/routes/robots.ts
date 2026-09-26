import { Router } from "express";

const router = Router();

const SITE_URL = (process.env.SITE_URL ?? "https://exhibittix.com").replace(/\/$/, "");

router.get("/robots.txt", (_req, res) => {
  res
    .type("text/plain")
    .set("Cache-Control", "public, max-age=3600, s-maxage=3600")
    .send([
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
      `Sitemap: ${SITE_URL}/sitemap.xml`,
      "",
    ].join("\n"));
});

export default router;
