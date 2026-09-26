export interface SeoConfig {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  robots?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: string;
  twitterCard?: string;
}

const SITE_URL = "https://exhibittix.com";
const DEFAULT_TITLE = "ExhibitTix - Discover, Book & Exhibit at Top Events in India";
const DEFAULT_DESCRIPTION =
  "India's premier platform for discovering and booking tickets to exhibitions, trade fairs, cultural events, and events across India.";

function absoluteUrl(value: string): string {
  try {
    return new URL(value, SITE_URL).toString();
  } catch {
    return SITE_URL;
  }
}

function upsertMeta(attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${CSS.escape(key)}"]`,
  );

  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }

  element.setAttribute("content", content);
}

function upsertLink(rel: string, href: string) {
  let element = document.head.querySelector<HTMLLinkElement>(
    `link[rel="${CSS.escape(rel)}"]`,
  );

  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", rel);
    document.head.appendChild(element);
  }

  element.setAttribute("href", href);
}

function removeMeta(attribute: "name" | "property", key: string) {
  document.head
    .querySelectorAll(`meta[${attribute}="${CSS.escape(key)}"]`)
    .forEach((element) => element.remove());
}

export function getCanonicalUrl(pathname = window.location.pathname): string {
  const normalizedPath = pathname === "/" ? "/" : `/${pathname.replace(/^\/+|\/+$/g, "")}`;
  return absoluteUrl(normalizedPath);
}

export function getDefaultRobots(pathname = window.location.pathname): string {
  const indexablePaths = [
    /^\/$/,
    /^\/events\/?$/,
    /^\/event\/[^/]+\/?$/,
    /^\/event\/[^/]+\/participants\/[^/]+\/?$/,
    /^\/exhibitions\/?$/,
    /^\/exhibition\/[^/]+\/?$/,
    /^\/exhibition\/[^/]+\/exhibit\/?$/,
    /^\/organizers\/[^/]+\/?$/,
    /^\/exhibitors\/?$/,
    /^\/(about|contact|help|how-booking-works|how-exhibitions-work|refund-policy|terms|privacy)\/?$/,
  ];

  return indexablePaths.some((pattern) => pattern.test(pathname))
    ? "index,follow"
    : "noindex,nofollow";
}

export function applySeo(config: SeoConfig = {}) {
  const title = config.title?.trim() || DEFAULT_TITLE;
  const description = config.description?.trim() || DEFAULT_DESCRIPTION;
  const canonicalUrl = absoluteUrl(config.canonicalUrl || getCanonicalUrl());
  const robots = config.robots?.trim() || getDefaultRobots();
  const ogTitle = config.ogTitle?.trim() || title;
  const ogDescription = config.ogDescription?.trim() || description;
  const ogType = config.ogType?.trim() || "website";
  const twitterCard = config.twitterCard?.trim() || "summary_large_image";

  document.title = title;

  upsertMeta("name", "description", description);
  upsertMeta("name", "robots", robots);
  upsertMeta("property", "og:title", ogTitle);
  upsertMeta("property", "og:description", ogDescription);
  upsertMeta("property", "og:type", ogType);
  upsertMeta("property", "og:url", canonicalUrl);
  upsertMeta("name", "twitter:card", twitterCard);

  if (config.ogImage) {
    upsertMeta("property", "og:image", absoluteUrl(config.ogImage));
  } else {
    removeMeta("property", "og:image");
  }

  upsertLink("canonical", canonicalUrl);
}

export const seoDefaults = {
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  siteUrl: SITE_URL,
} as const;
