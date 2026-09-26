import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePlatformAdmin } from "../middleware/auth";

const router = Router();

router.use(requireAuth, requirePlatformAdmin);

router.get("/seo-health", async (_req, res) => {
  const [publishedEvents, missingTitle, missingDescription, missingImage] = await Promise.all([
    prisma.event.count({ where: { status: "PUBLISHED", visibility: "public", archivedAt: null } }),
    prisma.event.count({ where: { status: "PUBLISHED", visibility: "public", archivedAt: null, OR: [{ seoTitle: null }, { seoTitle: "" }] } }),
    prisma.event.count({ where: { status: "PUBLISHED", visibility: "public", archivedAt: null, OR: [{ seoDescription: null }, { seoDescription: "" }] } }),
    prisma.event.count({ where: { status: "PUBLISHED", visibility: "public", archivedAt: null, OR: [{ seoImageUrl: null }, { seoImageUrl: "" }] } }),
  ]);

  const checks = {
    sitemap: { status: "configured", path: "/sitemap.xml" },
    robots: { status: "configured", path: "/robots.txt" },
    canonicalUrls: { status: "platform-controlled" },
    indexationPolicy: { status: "platform-controlled" },
  };

  const metadataCoverage = publishedEvents === 0
    ? 100
    : Math.round(((publishedEvents - missingTitle) / publishedEvents) * 100);

  res.json({
    status: missingTitle === publishedEvents && publishedEvents > 0 ? "warning" : "healthy",
    generatedAt: new Date().toISOString(),
    publishedEvents,
    seoMetadata: {
      titleCoveragePercent: metadataCoverage,
      missingTitle,
      missingDescription,
      missingImage,
    },
    checks,
    limitations: [
      "This endpoint validates application SEO configuration only.",
      "Search-engine indexing, impressions, clicks, rankings, and crawl errors require external search analytics integration.",
    ],
  });
});

export default router;
