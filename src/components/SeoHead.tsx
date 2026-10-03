import { useEffect, useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import { applySeo, type SeoConfig } from "@/lib/seo";

type SeoHeadProps = SeoConfig;

export default function SeoHead(props: SeoHeadProps) {
  const location = useLocation();

  useEffect(() => {
    applySeo({
      title: props.title,
      description: props.description,
      canonicalUrl: props.canonicalUrl ?? location.pathname,
      robots: props.robots,
      ogTitle: props.ogTitle,
      ogDescription: props.ogDescription,
      ogImage: props.ogImage,
      ogType: props.ogType,
      twitterCard: props.twitterCard,
    });
  }, [
    props.title,
    props.description,
    props.canonicalUrl,
    props.robots,
    props.ogTitle,
    props.ogDescription,
    props.ogImage,
    props.ogType,
    props.twitterCard,
    location.pathname,
  ]);

  return null;
}

/**
 * Resets the head to the site defaults on every route change: default title and description, a
 * canonical for the current path, and the default robots policy (noindex outside the approved
 * public routes, so private screens never inherit the previous page's "index").
 *
 * It runs in a layout effect on purpose. React runs every layout effect of a commit before any
 * passive effect, so a page's own <SeoHead> (a passive effect) always applies after these defaults
 * instead of being overwritten by them when navigating between pages that are already loaded.
 */
export function RouteSeoDefaults() {
  const location = useLocation();
  useLayoutEffect(() => {
    applySeo({ canonicalUrl: location.pathname });
  }, [location.pathname]);
  return null;
}
