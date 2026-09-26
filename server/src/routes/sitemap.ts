import { Router } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

const SITE_URL = (process.env.SITE_URL ?? "https://exhibittix.com").replace(/\/$/, "");

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function publicEventUrl(id: string): string {
  return `${SITE_URL}/event/${encodeURIComponent(id)}`;
}

router.get("/sitemap.xml", async (_req, res) => {
  const events = await prisma.event.findMany({
    where: {
      status: "PUBLISHED",
      visibility: "public",
      archivedAt: null,
    },
    select: {
      id: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const urls: Array<{ loc: string; lastmod?: Date }> = [
    { loc: `${SITE_URL}/` },
    { loc: `${SITE_URL}/events` },
    ...events.map((event) => ({
      loc: publicEventUrl(event.id),
      lastmod: event.updatedAt,
    })),
  ];

  const body = urls
    .map(({ loc, lastmod }) => [
      "  <url>",
      `    <loc>${escapeXml(loc)}</loc>`,
      lastmod ? `    <lastmod>${lastmod.toISOString()}</lastmod>` : null,
      "  </url>",
    ].filter(Boolean).join("\n"))
    .join("\n");

  res
    .type("application/xml")
    .set("Cache-Control", "public, max-age=300, s-maxage=300")
    .send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`,
    );
});

export default router;
