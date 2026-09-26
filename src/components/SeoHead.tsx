import { useEffect } from "react";
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
